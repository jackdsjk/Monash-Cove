import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SecretStore } from "../secrets.js";

/**
 * Read-only OnTrack (Doubtfire) client.
 *
 * Credentials are owned by the `ontrack` CLI: this module reads the session it
 * already stored, renews an expired token through the refresh cookie the CLI
 * keeps for that machine, and never persists a credential of its own.
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
let cachedAuth: { baseUrl: string; username: string } & MintedAuth | null = null;

/** The login assistant stores a refresh cookie; the CLI session is a fallback. */
export function configureOnTrackCredentials(store: SecretStore) {
  secrets = store;
}

interface StoredCredentials {
  baseUrl: string;
  username: string;
  refreshToken: string;
}

async function storedCredentials(): Promise<StoredCredentials | null> {
  if (!secrets) return null;
  const raw = await secrets.get("ontrack-credentials");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (!parsed.baseUrl || !parsed.username || !parsed.refreshToken) return null;
    return { baseUrl: parsed.baseUrl, username: parsed.username, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

async function mintAccessToken(stored: StoredCredentials): Promise<MintedAuth> {
  const response = await fetch(`${stored.baseUrl.replace(/\/+$/, "")}/auth/access-token`, {
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
}

async function refresh(baseUrl: string, username: string): Promise<Credentials | null> {
  const cookie = await readRefreshCookie();
  if (!cookie) return null;

  const response = await fetch(`${baseUrl}/auth/access-token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: `refresh_token=${cookie.replace(/[;\r\n]/g, "")}; username=${username.replace(/[;\r\n]/g, "")}`,
    },
  });
  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as { auth_token?: string } | null;
  if (!body?.auth_token) return null;

  return { baseUrl, username, token: body.auth_token };
}

async function credentials(): Promise<Credentials> {
  const stored = await storedCredentials();
  if (stored) {
    const baseUrl = stored.baseUrl.replace(/\/+$/, "");
    if (cachedAuth && cachedAuth.baseUrl === baseUrl && cachedAuth.expiresAt - Date.now() > SESSION_LIMIT_MARGIN_MS) {
      return { baseUrl, username: stored.username, token: cachedAuth.token };
    }
    const minted = await mintAccessToken(stored);
    cachedAuth = { baseUrl, username: stored.username, ...minted };
    return { baseUrl, username: stored.username, token: minted.token };
  }

  const session = await readSessionFile();
  const baseUrl = session?.baseUrl?.replace(/\/+$/, "");
  const username = session?.username;
  if (!session || !baseUrl || !username) {
    throw new Error("OnTrack 还没有登录。在终端运行 ontrack login。");
  }

  const expiresAt = session.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;
  const stillValid = Number.isFinite(expiresAt) && expiresAt - Date.now() > SESSION_LIMIT_MARGIN_MS;
  if (stillValid && session.authToken) {
    return { baseUrl, username, token: session.authToken };
  }

  const renewed = await refresh(baseUrl, username);
  if (renewed) return renewed;

  if (session.authToken && !Number.isFinite(expiresAt)) {
    return { baseUrl, username, token: session.authToken };
  }
  throw new Error("OnTrack 会话已过期，请在终端重新运行 ontrack login。");
}

async function getJson<T>(auth: Credentials, path: string): Promise<T> {
  const response = await fetch(`${auth.baseUrl}${path}`, {
    headers: { Accept: "application/json", "Auth-Token": auth.token, Username: auth.username },
  });
  if (response.status === 419 || response.status === 401) {
    throw new Error("OnTrack 会话已过期，请在终端重新运行 ontrack login。");
  }
  if (!response.ok) {
    throw new Error(`OnTrack 请求失败：${path} 返回 ${response.status}`);
  }
  return (await response.json()) as T;
}

/** The account the OnTrack credential belongs to, for showing who is connected. */
export async function fetchOnTrackAccount(): Promise<OnTrackAccount | null> {
  const stored = await storedCredentials();
  if (stored) {
    const baseUrl = stored.baseUrl.replace(/\/+$/, "");
    const fresh = cachedAuth?.baseUrl === baseUrl && cachedAuth.expiresAt - Date.now() > SESSION_LIMIT_MARGIN_MS;
    const auth = fresh && cachedAuth ? cachedAuth : { baseUrl, username: stored.username, ...(await mintAccessToken(stored)) };
    if (!fresh) cachedAuth = auth;
    const user = auth.user;
    return {
      userId: user?.id ?? 0,
      username: user?.username ?? stored.username,
      firstName: user?.first_name ?? "",
      lastName: user?.last_name ?? "",
      email: user?.email ?? "",
      expiresAt: new Date(auth.expiresAt).toISOString(),
      refreshedAt: new Date().toISOString(),
    };
  }

  const session = await readSessionFile();
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
  const response = await fetch(`${auth.baseUrl}${path}`, {
    headers: { Accept: "*/*", "Auth-Token": auth.token, Username: auth.username },
  });
  if (response.status === 419 || response.status === 401) {
    throw new Error("OnTrack 会话已过期，请在终端重新运行 ontrack login。");
  }
  if (!response.ok) {
    throw new Error(`OnTrack 下载失败：返回 ${response.status}`);
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
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
