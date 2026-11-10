import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SecretStore } from "../secrets.js";
import { withTimeout } from "../http.js";

/**
 * Read-only OnTrack (Doubtfire) client.
 *
 * Prefer the refresh credential stored by the local login assistant. The CLI
 * session is a fallback until the user explicitly disconnects this source.
 */

export interface OnTrackAccount {
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  expiresAt: string | null;
  refreshedAt: string | null;
}

export interface OnTrackProject {
  id: number;
  unitId: number;
  unitCode: string;
  unitName: string;
}

export interface OnTrackTask {
  id: number;
  taskDefinitionId: number;
  abbreviation: string;
  name: string;
  description: string;
  status: string;
  dueDate: string | null;
  targetDueDate: string | null;
  submissionDate: string | null;
  completionDate: string | null;
  weighting: number | null;
  timesAssessed: number;
  numNewComments: number;
}

export interface OnTrackComment {
  id: string;
  type: string;
  comment: string;
  createdAt: string;
  authorId: number | null;
  authorName: string;
}

interface SessionFile {
  baseUrl?: string;
  username?: string;
  authToken?: string;
  expiresAt?: string;
  refreshedAt?: string;
  user?: {
    id?: number;
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
}

interface BrowserStateFile {
  cookies?: Array<{ name?: string; value?: string }>;
}

const SESSION_LIMIT_MARGIN_MS = 60_000;

let secrets: SecretStore | null = null;
interface MintedAuth {
  token: string;
  expiresAt: number;
  user: { id?: number; username?: string; email?: string; first_name?: string; last_name?: string } | null;
}
interface Connection {
  identity: string;
  epoch: number;
  baseUrl: string;
  username: string;
  stored: StoredCredentials | null;
  session: SessionFile | null;
  refreshToken: string | null;
}

let cachedAuth: ({ identity: string; epoch: number } & MintedAuth) | null = null;
let inflightAuth: { identity: string; epoch: number; promise: Promise<MintedAuth> } | null = null;
let configurationVersion = 0;
let connectionEpoch = 0;
let observedIdentity: string | null | undefined;
let disconnectingStore: SecretStore | null = null;
const DISCONNECTED_KEY = "ontrack-disconnected";

/** Rebinding a store must invalidate tokens and in-flight work from the old store. */
export function configureOnTrackCredentials(store: SecretStore): void {
  secrets = store;
  configurationVersion += 1;
  connectionEpoch += 1;
  observedIdentity = undefined;
  cachedAuth = null;
  inflightAuth = null;
}

/** Explicit disconnect also disables the unrelated global CLI session fallback. */
export async function disconnectOnTrackCredentials(): Promise<void> {
  const store = secrets;
  if (!store) return;
  configureOnTrackCredentials(store);
  disconnectingStore = store;
  try {
    await store.set(DISCONNECTED_KEY, "true");
    await store.delete("ontrack-credentials");
  } finally {
    if (disconnectingStore === store) disconnectingStore = null;
  }
}

interface StoredCredentials {
  baseUrl: string;
  username: string;
  refreshToken: string;
}

function credentialIdentity(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function observeConnection(identity: string | null): number {
  if (observedIdentity !== identity) {
    observedIdentity = identity;
    connectionEpoch += 1;
    cachedAuth = null;
    inflightAuth = null;
  }
  return connectionEpoch;
}

/** Read only local credential material; never probe the account over the network. */
async function connection(): Promise<Connection | null> {
  const version = configurationVersion;
  const store = secrets;
  const raw = store ? await store.get("ontrack-credentials") : null;
  let result: Omit<Connection, "epoch"> | null = null;
  if (store !== null && store === disconnectingStore) return null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
      if (typeof parsed.baseUrl === "string" && parsed.baseUrl && typeof parsed.username === "string"
          && parsed.username && typeof parsed.refreshToken === "string" && parsed.refreshToken) {
        const stored = { baseUrl: parsed.baseUrl.replace(/\/+$/, ""), username: parsed.username, refreshToken: parsed.refreshToken };
        result = {
          identity: credentialIdentity(["stored", stored.baseUrl, stored.username, stored.refreshToken]),
          baseUrl: stored.baseUrl, username: stored.username, stored, session: null, refreshToken: stored.refreshToken,
        };
      }
    } catch {
      // Invalid stored credentials must not silently switch to another CLI account.
    }
  } else if (!store || await store.get(DISCONNECTED_KEY) !== "true") {
    const session = await readSessionFile();
    const baseUrl = session?.baseUrl?.replace(/\/+$/, "");
    if (session && baseUrl && session.username) {
      const refreshToken = await readRefreshCookie();
      result = {
        identity: credentialIdentity(["cli", baseUrl, session.username, session.user?.id, session.authToken, refreshToken]),
        baseUrl, username: session.username, stored: null, session, refreshToken,
      };
    }
  }
  if (version !== configurationVersion || store !== secrets) throw new Error("OnTrack 连接已更改，请重试。");
  const epoch = observeConnection(result?.identity ?? null);
  return result ? { ...result, epoch } : null;
}

/** Stable across restarts for unchanged credentials; contains no plaintext secrets. */
export async function onTrackCacheIdentity(): Promise<string | null> {
  return (await connection())?.identity ?? null;
}

async function assertCurrent(auth: { identity: string; epoch: number }): Promise<void> {
  const current = await connection();
  if (!current || current.identity !== auth.identity || current.epoch !== auth.epoch) {
    throw new Error("OnTrack 连接已更改，请重试。");
  }
}

async function accessToken(current: Connection): Promise<MintedAuth> {
  if (cachedAuth?.identity === current.identity && cachedAuth.epoch === current.epoch
      && cachedAuth.expiresAt - Date.now() > SESSION_LIMIT_MARGIN_MS) return cachedAuth;
  if (inflightAuth?.identity === current.identity && inflightAuth.epoch === current.epoch) return inflightAuth.promise;
  const promise = (async (): Promise<MintedAuth> => {
    const session = current.session;
    const expiresAt = session?.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;
    let minted: MintedAuth;
    if (!current.stored && session?.authToken && Number.isFinite(expiresAt)
        && expiresAt - Date.now() > SESSION_LIMIT_MARGIN_MS) {
      minted = { token: session.authToken, expiresAt, user: session.user ?? null };
    } else if (current.refreshToken) {
      minted = await mintAccessToken({ baseUrl: current.baseUrl, username: current.username, refreshToken: current.refreshToken });
    } else if (session?.authToken && !Number.isFinite(expiresAt)) {
      minted = { token: session.authToken, expiresAt: Date.now() + 5 * 60_000, user: session.user ?? null };
    } else {
      throw new Error("OnTrack 会话已过期，请在数据源页重新连接。");
    }
    await assertCurrent(current);
    cachedAuth = { identity: current.identity, epoch: current.epoch, ...minted };
    return minted;
  })();
  const task = { identity: current.identity, epoch: current.epoch, promise };
  inflightAuth = task;
  try {
    return await promise;
  } finally {
    if (inflightAuth === task) inflightAuth = null;
  }
}

async function mintAccessToken(stored: StoredCredentials): Promise<MintedAuth> {
  const response = await withTimeout(fetch)(`${stored.baseUrl.replace(/\/+$/, "")}/auth/access-token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: `refresh_token=${stored.refreshToken.replace(/[;\r\n]/g, "")}; username=${stored.username.replace(/[;\r\n]/g, "")}`,
    },
  });
  if (!response.ok) throw new Error("OnTrack 登录已失效，请在数据源页重新连接。");
  const body = (await response.json().catch(() => null)) as
    | { auth_token?: string; auth_token_expiry?: string; user?: MintedAuth["user"] }
    | null;
  if (!body?.auth_token) throw new Error("OnTrack 登录已失效，请在数据源页重新连接。");
  const expiresAt = body.auth_token_expiry ? Date.parse(body.auth_token_expiry) : Date.now() + 5 * 60_000;
  return {
    token: body.auth_token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60_000,
    user: body.user ?? null,
  };
}

function configRoot() {
  return process.env.ONTRACK_CONFIG_DIR ?? join(homedir(), ".config", "ontrack-cli");
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readSessionFile(): Promise<SessionFile | null> {
  return readJson<SessionFile>(join(configRoot(), "session.json"));
}

async function readRefreshCookie(): Promise<string | null> {
  const state = await readJson<BrowserStateFile>(join(configRoot(), "browser-state.json"));
  const cookie = state?.cookies?.find((entry) => entry.name === "refresh_token");
  return cookie?.value ?? null;
}

interface Credentials {
  baseUrl: string;
  username: string;
  token: string;
  identity: string;
  epoch: number;
}

async function credentials(): Promise<Credentials> {
  const current = await connection();
  if (!current) throw new Error("OnTrack 还没有登录，请在数据源页连接。");
  const auth = await accessToken(current);
  await assertCurrent(current);
  return { baseUrl: current.baseUrl, username: current.username, token: auth.token, identity: current.identity, epoch: current.epoch };
}

async function getJson<T>(auth: Credentials, path: string): Promise<T> {
  const response = await withTimeout(fetch)(`${auth.baseUrl}${path}`, {
    headers: { Accept: "application/json", "Auth-Token": auth.token, Username: auth.username },
  });
  if (response.status === 419 || response.status === 401) {
    throw new Error("OnTrack 会话已过期，请在终端重新运行 ontrack login。");
  }
  if (!response.ok) {
    throw new Error(`OnTrack 请求失败：${path} 返回 ${response.status}`);
  }
  const data = (await response.json()) as T;
  await assertCurrent(auth);
  return data;
}

/** The account the OnTrack credential belongs to, for showing who is connected. */
export async function fetchOnTrackAccount(): Promise<OnTrackAccount | null> {
  const current = await connection();
  if (!current) return null;
  if (current.stored) {
    const auth = await accessToken(current);
    await assertCurrent(current);
    const user = auth.user;
    return {
      userId: user?.id ?? 0,
      username: user?.username ?? current.username,
      firstName: user?.first_name ?? "",
      lastName: user?.last_name ?? "",
      email: user?.email ?? "",
      expiresAt: new Date(auth.expiresAt).toISOString(),
      refreshedAt: new Date().toISOString(),
    };
  }

  const session = current.session;
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    username: session.user.username ?? session.username ?? "",
    firstName: session.user.first_name ?? "",
    lastName: session.user.last_name ?? "",
    email: session.user.email ?? "",
    expiresAt: session.expiresAt ?? null,
    refreshedAt: session.refreshedAt ?? null,
  };
}

export async function fetchOnTrackProjects(): Promise<OnTrackProject[]> {
  const auth = await credentials();
  const raw = await getJson<Array<{ id?: number; unit?: { id?: number; code?: string; name?: string } }>>(auth, "/projects");
  return raw
    .filter((project) => typeof project.id === "number" && typeof project.unit?.id === "number")
    .map((project) => ({
      id: project.id as number,
      unitId: project.unit?.id as number,
      unitCode: project.unit?.code ?? "",
      unitName: project.unit?.name ?? "",
    }));
}

export async function fetchOnTrackTasks(projectId: number): Promise<OnTrackTask[]> {
  const auth = await credentials();
  const detail = await getJson<{
    unit_id?: number;
    tasks?: Array<Record<string, unknown>>;
  }>(auth, `/projects/${projectId}`);
  const definitions = await fetchDefinitions(auth, Number(detail.unit_id ?? 0));

  return (detail.tasks ?? []).map((task) => {
    const taskDefinitionId = Number(task.task_definition_id ?? 0);
    const definition = definitions.get(taskDefinitionId);
    return {
      id: Number(task.id ?? 0),
      taskDefinitionId,
      abbreviation: definition?.abbreviation ?? "",
      name: definition?.name ?? "",
      description: definition?.description ?? "",
      status: String(task.status ?? ""),
      dueDate: dateOnly(task.due_date),
      targetDueDate: dateOnly(task.target_due_date),
      submissionDate: dateOnly(task.submission_date),
      completionDate: dateOnly(task.completion_date),
      weighting: definition?.weighting ?? null,
      timesAssessed: Number(task.times_assessed ?? 0),
      numNewComments: Number(task.num_new_comments ?? 0),
    };
  });
}

interface Definition {
  abbreviation: string;
  name: string;
  description: string;
  weighting: number | null;
}

async function fetchDefinitions(auth: Credentials, unitId: number): Promise<Map<number, Definition>> {
  const map = new Map<number, Definition>();
  if (!unitId) return map;

  const unit = await getJson<{ task_definitions?: Array<Record<string, unknown>> }>(auth, `/units/${unitId}`);
  for (const definition of unit.task_definitions ?? []) {
    const id = Number(definition.id ?? 0);
    if (!id) continue;
    map.set(id, {
      abbreviation: String(definition.abbreviation ?? ""),
      name: String(definition.name ?? ""),
      description: String(definition.description ?? ""),
      weighting: typeof definition.weighting === "number" ? definition.weighting : null,
    });
  }
  return map;
}

export async function fetchOnTrackComments(projectId: number, taskDefinitionId: number): Promise<OnTrackComment[]> {
  const auth = await credentials();
  const raw = await getJson<Array<Record<string, unknown>>>(
    auth,
    `/projects/${projectId}/task_def_id/${taskDefinitionId}/comments`,
  );

  return raw.map((comment) => {
    const author = (comment.author ?? {}) as Record<string, unknown>;
    const authorId = Number(author.id ?? 0);
    const first = String(author.first_name ?? "");
    const last = String(author.last_name ?? "");
    return {
      id: String(comment.id ?? ""),
      type: String(comment.type ?? ""),
      comment: String(comment.comment ?? ""),
      createdAt: String(comment.created_at ?? ""),
      authorId: Number.isFinite(authorId) && authorId > 0 ? authorId : null,
      authorName: `${first} ${last}`.trim(),
    };
  });
}

/** Download one read-only artifact (task sheet, resources, or submission PDF). */
export async function fetchOnTrackArtifact(path: string): Promise<{ body: Buffer; contentType: string }> {
  const auth = await credentials();
  const response = await withTimeout(fetch)(`${auth.baseUrl}${path}`, {
    headers: { Accept: "*/*", "Auth-Token": auth.token, Username: auth.username },
  });
  if (response.status === 419 || response.status === 401) {
    throw new Error("OnTrack 会话已过期，请在终端重新运行 ontrack login。");
  }
  if (!response.ok) {
    throw new Error(`OnTrack 下载失败：返回 ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  await assertCurrent(auth);
  return { body, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

export function onTrackWebUrl(baseUrl: string, projectId: number, taskDefinitionId: number) {
  const origin = baseUrl.replace(/\/api\/?$/, "");
  return `${origin}/#/projects/${projectId}/tasks/${taskDefinitionId}`;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, 10);
}
