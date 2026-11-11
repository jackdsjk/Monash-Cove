import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SecretStore } from "../secrets.js";
import { withTimeout } from "../http.js";
import { ONTRACK_MAX_ARTIFACT_BYTES, type OnTrackArtifact } from "./ontrack-artifacts.js";
import { mapWithConcurrency } from "../vendor/always-ontrack/async-pool.js";
import { buildStudentTaskViews, type StudentTaskVisibility } from "../vendor/always-ontrack/student-task-view.js";
import type { ProjectSummary, UnitSummary } from "../vendor/always-ontrack/types.js";

/**
 * Read-only OnTrack (Doubtfire) client.
 *
 * Prefer the refresh credential stored by the local login assistant. The CLI
 * session is a fallback until the user explicitly disconnects this source.
 */

export interface OnTrackAccount {
  baseUrl: string;
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
  /** Real task instance ID only; a definition can exist before an instance. */
  id: number | null;
  isInstantiated: boolean;
  visibility: StudentTaskVisibility;
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
      baseUrl: current.baseUrl,
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
    baseUrl: current.baseUrl,
    userId: session.user.id,
    username: session.user.username ?? session.username ?? "",
    firstName: session.user.first_name ?? "",
    lastName: session.user.last_name ?? "",
    email: session.user.email ?? "",
    expiresAt: session.expiresAt ?? null,
    refreshedAt: session.refreshedAt ?? null,
  };
}

/** Always-Ontrack project-catalogue fallback for snake/camel unit IDs. */
function projectUnitId(project: ProjectSummary): number | null {
  const id = project.unit?.id ?? project.unitId ?? project.unit_id;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function fetchOnTrackProjects(): Promise<OnTrackProject[]> {
  const auth = await credentials();
  const raw = await getJson<ProjectSummary[]>(auth, "/projects");
  if (!Array.isArray(raw)) throw new Error("OnTrack 项目列表格式无效。");
  const units = new Map<number, Promise<UnitSummary>>();
  return mapWithConcurrency(raw, 4, async (project) => {
    const unitId = projectUnitId(project);
    if (!Number.isSafeInteger(project.id) || project.id <= 0 || unitId === null) {
      throw new Error("OnTrack 项目缺少有效的项目或课程 ID。");
    }
    // Some API versions expose only unit_id; hydrate those summaries once per unit.
    let unit = project.unit;
    if (!unit?.code) {
      let pending = units.get(unitId);
      if (!pending) {
        pending = getJson<UnitSummary>(auth, `/units/${unitId}`);
        units.set(unitId, pending);
      }
      unit = await pending;
    }
    return {
      id: project.id,
      unitId,
      unitCode: unit.code ?? `课程 ${unitId}`,
      unitName: unit.name ?? "",
    };
  });
}

export async function fetchOnTrackTasks(
  projectId: number,
  summary?: OnTrackProject,
  options: { includeNonApplicable?: boolean } = {},
): Promise<OnTrackTask[]> {
  const auth = await credentials();
  const detail = await getJson<ProjectSummary>(auth, `/projects/${projectId}`);
  const unitId = projectUnitId(detail) ?? summary?.unitId;
  if (!unitId) throw new Error("OnTrack 项目缺少课程 ID，无法读取完整任务目录。");
  const unit = await getJson<UnitSummary>(auth, `/units/${unitId}`);
  const definitions = unit.taskDefinitions ?? unit.task_definitions;
  if (!Array.isArray(definitions)) throw new Error("OnTrack 课程未返回完整任务定义。");
  const project: ProjectSummary = { ...detail, id: projectId, unit: { ...detail.unit, ...unit, id: unitId } };
  // Keep unknown applicability visible, but never invent instance IDs or deadlines.
  return buildStudentTaskViews([project], {
    includeUnknown: true,
    includeBeyondTarget: options.includeNonApplicable,
    includeTutorialMismatches: options.includeNonApplicable,
  }).map((view) => {
    const task = view.instance;
    const instanceId = view.taskInstanceId;
    return {
      id: instanceId !== undefined && instanceId > 0 ? instanceId : null,
      isInstantiated: instanceId !== undefined && instanceId > 0,
      visibility: view.visibility,
      taskDefinitionId: view.reference.taskDefinitionId,
      abbreviation: view.definition.abbreviation ?? "",
      name: view.definition.name ?? "",
      description: typeof view.definition.description === "string" ? view.definition.description : "",
      status: view.status,
      dueDate: dateOnly(view.dates.effectiveDue),
      targetDueDate: dateOnly(task?.targetDueDate ?? task?.target_due_date ?? view.dates.target),
      submissionDate: dateOnly(view.dates.submission),
      completionDate: dateOnly(view.dates.completion),
      weighting: typeof view.definition.weighting === "number" ? view.definition.weighting : null,
      timesAssessed: Number(task?.timesAssessed ?? task?.times_assessed ?? 0),
      numNewComments: Number(task?.numNewComments ?? task?.num_new_comments ?? 0),
    };
  });
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
export async function fetchOnTrackArtifact(path: string): Promise<OnTrackArtifact> {
  const auth = await credentials();
  const response = await withTimeout(fetch)(`${auth.baseUrl}${path}`, {
    headers: { Accept: "*/*", "Auth-Token": auth.token, Username: auth.username },
  });
  if (response.status === 419 || response.status === 401) {
    await response.body?.cancel();
    throw new Error("OnTrack 会话已过期，请在终端重新运行 ontrack login。");
  }
  if (!response.ok || response.status === 206) {
    await response.body?.cancel();
    throw new Error(`OnTrack 下载失败：返回 ${response.status}，需要完整文件。`);
  }
  if (Number(response.headers.get("content-length")) > ONTRACK_MAX_ARTIFACT_BYTES) {
    await response.body?.cancel();
    throw new Error("OnTrack 文件超过本地 25 MiB 下载上限。");
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > ONTRACK_MAX_ARTIFACT_BYTES) {
          await reader.cancel();
          throw new Error("OnTrack 文件超过本地 25 MiB 下载上限。");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const body = Buffer.concat(chunks, size);
  await assertCurrent(auth);
  return {
    body,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    contentDisposition: response.headers.get("content-disposition"),
  };
}

export function onTrackWebUrl(baseUrl: string, projectId: number, taskDefinitionId: number) {
  const origin = baseUrl.replace(/\/api\/?$/, "");
  return `${origin}/#/projects/${projectId}/tasks/${taskDefinitionId}`;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, 10);
}
