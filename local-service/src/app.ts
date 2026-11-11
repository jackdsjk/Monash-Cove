import { readFileSync } from "node:fs";
import JSZip from "jszip";
import Fastify, { type FastifyInstance } from "fastify";
import staticPlugin from "@fastify/static";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { createDatabase, type CoveDatabase } from "./db.js";
import { createHash, randomUUID } from "node:crypto";
import { gzip as gzipCallback } from "node:zlib";
import { promisify } from "node:util";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCoveMcpServer } from "./mcp.js";
import { GoogleOAuth, OAuthError, type GoogleOAuthConfig } from "./oauth/google.js";
import { defaultSecretStore, type SecretStore } from "./secrets.js";
import { SyncOrchestrator } from "./sync/orchestrator.js";
import { syncGmail } from "./sync/gmail.js";
import { syncOnTrack } from "./sync/ontrack.js";
import { syncEd, syncMoodle, syncMoodleForum } from "./sync/sources.js";
import { syncAllMoodleContent } from "./sync/moodle-content.js";
import { FullSyncJobs, type SyncSource } from "./sync/jobs.js";
import { MoodleClient } from "./sources/moodle.js";
import { MoodleGradesClient, MoodleGradesError, type MoodleGradeCourse } from "./sources/moodle-grades.js";
import { matchGradebookItem } from "./vendor/muster/assessment-match.js";
import { mergeGradeCourse } from "./moodle-grade-refresh.js";
import { EdClient } from "./sources/ed.js";
import { syncMoodleContent } from "./sync/moodle-content.js";
import { downloadMoodleResource, MoodleDownloadError, moodleCookieHeader, safeDownloadName } from "./moodle-download.js";
import { moodleCredentialIdentity, moodleCredentials, scheduleMoodleSessionChecks, verifyMoodleSession } from "./moodle-session.js";
import { captureMoodlePage } from "./moodle-snapshot.js";
import { MoodleSessionTransport } from "./moodle-transport.js";
import { AssetFetchError, fetchAsset } from "./safe-download.js";
import { withTimeout } from "./http.js";
import { ResourceCache, RESOURCE_TTL, CacheIdentityChangedError, type CacheMetadata } from "./resource-cache.js";
import { coursePreferencesSchema, getMoodleCoursePreferences, saveMoodleCoursePreferences } from "./course-preferences.js";
import { attendanceScanKey } from "./attendance/scan-key.js";
import type { ApiError, ChangesResponse, ItemChange, Source } from "./domain.js";
import { describeCredentials } from "./credentials.js";
import { configureOnTrackCredentials, disconnectOnTrackCredentials, onTrackCacheIdentity, fetchOnTrackAccount, fetchOnTrackArtifact, fetchOnTrackComments, fetchOnTrackProjects, fetchOnTrackTasks } from "./sources/ontrack.js";
import { getRuntimeStatus } from "./runtime.js";
import { validateOnTrackArtifact } from "./sources/ontrack-artifacts.js";
import { MoodleLoginAssistant } from "./setup/moodle-assistant.js";
import { OnTrackLoginAssistant } from "./setup/ontrack-assistant.js";
import { AttendanceLoginAssistant } from "./attendance/assistant.js";
import { discoverAttendanceSessions, fillAttendance, validateAttendance, type AttendanceCredentials } from "./attendance/client.js";
import {
  AttendanceLoginRequiredError,
  AttendanceSubmitBusyError,
  ATTENDANCE_SUBMIT_TIMEOUT_MS,
  submitAttendance,
  type AttendanceSubmitInput,
} from "./attendance/submit.js";
import { parseAttendanceRows } from "./attendance/parser.js";
import { scanMoodleAttendanceImages } from "./attendance/moodle-ocr.js";
import { parseAttendanceSessionPreference, detectedToPreferences, matchesPreferredSession, type AttendancePreferences } from "./attendance/preferences.js";
import { buildUpdateStatus, fetchLatestRelease, type UpdateStatus } from "./update.js";
import { capturePortalExams, PortalError, portalLoginSaved } from "./student-portal.js";

const CURRENT_VERSION = (() => {
  try {
    return String((JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string }).version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
})();
let updateCache: { at: number; value: UpdateStatus } | null = null;

const gzipAsync = promisify(gzipCallback);


const sourceSchema = z.enum(["gmail", "ed", "moodle", "ontrack"]);

/** Task sheets and resources are addressed by unit, not by project. */
async function resolveOnTrackUnitId(projectId: number): Promise<number> {
  const projects = await fetchOnTrackProjects();
  const match = projects.find((project) => project.id === projectId);
  if (!match) throw new Error("找不到这个 OnTrack 项目，可能没有权限。");
  return match.unitId;
}

/** GET routes that trigger OCR, a browser capture, or an outbound fetch. */
const SIDE_EFFECTING_GETS = new Set([
  "/api/attendance/codes",
  "/api/moodle/grades",
  "/api/moodle/page",
  "/api/moodle/download",
  "/api/moodle/download-batch",
  "/api/ed/download",
  "/api/ed/download-batch",
  "/api/update",
]);

const correctionSchema = z.object({
  pinned: z.boolean().optional(),
  dismissed: z.boolean().optional(),
  feedback: z
    .object({
      reason: z.enum(["content_type", "importance", "action", "other"]),
      note: z.string().max(300).default(""),
      at: z.string().min(1),
    })
    .optional(),
});

const checkSchema = z.object({ ids: z.array(z.string()).default([]) });

export interface AppOptions {
  dbPath: string;
  fixturePath?: string;
  seed?: boolean;
  logger?: boolean;
  autoSync?: boolean;
  /** 启动时及定时维护 Moodle 会话；服务入口显式启用，测试可关闭。 */
  moodleSessionCheck?: boolean;
  staticDir?: string | null;
  secretStore?: SecretStore;
  google?: GoogleOAuthConfig | null;
  fetcher?: typeof fetch;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const db: CoveDatabase = createDatabase(options);
  const app = Fastify({
    logger: options.logger ? { level: "info", redact: ["req.headers.authorization", "req.headers.cookie"] } : false,
    bodyLimit: 1_000_000,
  });
  const allowedOrigins = new Set([
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:4317",
    "http://localhost:4317",
  ]);
  // The UI is same-origin in production and on a custom COVE_PORT, so an
  // Origin that matches the request's own Host is accepted too.
  const isSameOrigin = (origin: string, host: string | undefined): boolean => {
    if (!host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  };
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin) && !isSameOrigin(origin, request.headers.host) && ["POST", "PATCH", "DELETE"].includes(request.method)) {
      return reply.code(403).send({ error: { code: "forbidden_origin", message: "Origin is not allowed.", retryable: false } } satisfies ApiError);
    }
    // Some GET routes do remote work (OCR, page capture, release lookup) and a
    // web page can trigger them with an <img> tag, which carries no Origin.
    // Browsers label those requests `cross-site`; our own UI is always
    // same-origin, so blocking cross-site here closes the CSRF gap.
    if (request.method === "GET" && SIDE_EFFECTING_GETS.has(request.url.split("?")[0]) && request.headers["sec-fetch-site"] === "cross-site") {
      return reply.code(403).send({ error: { code: "forbidden_origin", message: "Cross-site requests are not allowed for this endpoint.", retryable: false } } satisfies ApiError);
    }
  });
  // 简报是一个数 MB 的 JSON，本地回环也值得压缩；hook 必须早于路由注册才生效。
  app.addHook("onSend", async (request, reply, payload) => {
    if (typeof payload !== "string" || payload.length < 1024) return payload;
    if (!/\bgzip\b/i.test(String(request.headers["accept-encoding"] ?? ""))) return payload;
    reply.header("content-encoding", "gzip");
    reply.header("vary", "accept-encoding");
    reply.removeHeader("content-length");
    return gzipAsync(payload);
  });

  const resourceCache = new ResourceCache(db);
  const underlyingSecrets = options.secretStore ?? defaultSecretStore();
  // Moodle owns a shared, credential-bound jar; other sources keep their fetcher.
  const fetcher = withTimeout(options.fetcher ?? fetch);
  const moodleTransport = new MoodleSessionTransport({ secrets: underlyingSecrets, fetcher });
  const credentialSource = (key: string): string | undefined => /^(moodle|ed|ontrack)-credentials$/.exec(key)?.[1];
  // All credential writers, including login assistants, share the same invalidation.
  const secrets: SecretStore = {
    get: (key) => underlyingSecrets.get(key),
    async set(key, value) {
      const source = credentialSource(key);
      if (source) resourceCache.invalidate(source);
      if (key === "moodle-credentials") await moodleTransport.replaceCredentials(value);
      else await underlyingSecrets.set(key, value);
      if (source) resourceCache.invalidate(source);
    },
    async delete(key) {
      const source = credentialSource(key);
      if (source) resourceCache.invalidate(source);
      if (key === "moodle-credentials") await moodleTransport.deleteCredentials();
      else await underlyingSecrets.delete(key);
      if (source) resourceCache.invalidate(source);
    },
  };
  const credentialIdentity = async (source: "moodle" | "ed"): Promise<string | null> => {
    const raw = await secrets.get(`${source}-credentials`);
    return raw ? source === "moodle" ? moodleCredentialIdentity(raw)
      : createHash("sha256").update(`${source}\0${raw}`).digest("hex") : null;
  };
  const forcedRefresh = (url: string): boolean => new URL(url, "http://localhost").searchParams.get("refresh") === "1";
  const google = new GoogleOAuth(options.google ?? null, secrets, fetcher);
  const orchestrator = new SyncOrchestrator(db, secrets, google, fetcher, (raw) => moodleTransport.forCredentials(raw));
  const fullSyncJobs = new FullSyncJobs();
  const moodleAssistant = new MoodleLoginAssistant(secrets, db, async (value, signal) => {
    resourceCache.invalidate("moodle");
    try {
      await moodleTransport.replaceCredentials(value, signal);
    } finally {
      resourceCache.invalidate("moodle");
    }
  });
  configureOnTrackCredentials(secrets);
  const onTrackAssistant = new OnTrackLoginAssistant(secrets, db);
  const attendanceAssistant = new AttendanceLoginAssistant(secrets);
  const mcpSessions = new Map<string, StreamableHTTPServerTransport>();
  if (options.autoSync) {
    const timer = setInterval(() => void orchestrator.syncAll(), 60 * 60 * 1000);
    timer.unref();
    app.addHook("onReady", async () => {
      void orchestrator.syncAll();
    });
    app.addHook("onClose", async () => clearInterval(timer));
  }
  let stopMoodleSessionChecks: () => void = () => undefined;
  let moodleSessionCheckFlight: Promise<unknown> | null = null;
  // Lightweight maintenance is independent of bulk sync in the production entry.
  // Fixture-only app instances do not opt in unless explicitly configured.
  if (options.moodleSessionCheck ?? Boolean(options.autoSync)) {
    const reportCheckError = (error: unknown) => app.log.warn({ err: error }, "Moodle session check failed");
    const check = (): Promise<unknown> => {
      if (!moodleSessionCheckFlight) {
        moodleSessionCheckFlight = verifyMoodleSession({ db, secrets, fetcherForCredentials: (raw) => moodleTransport.forCredentials(raw) })
          .finally(() => { moodleSessionCheckFlight = null; });
      }
      return moodleSessionCheckFlight;
    };
    stopMoodleSessionChecks = scheduleMoodleSessionChecks(check, { onError: reportCheckError });
    app.addHook("onReady", async () => {
      void check().catch(reportCheckError);
    });
  }

  app.decorate("coveDb", db);
  app.addHook("onClose", async () => {
    stopMoodleSessionChecks();
    await moodleAssistant.cancel();
    moodleTransport.close();
    await moodleSessionCheckFlight?.catch(() => undefined);
    resourceCache.close();
    db.close();
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    // Internal messages can contain file paths, SQL, or upstream response text.
    // Keep them in the server log and return a stable message to the browser.
    if (status >= 500) request.log.error({ err }, "request failed");
    const body: ApiError = {
      error: {
        code: status === 400 ? "invalid_request" : status >= 500 ? "internal_error" : "request_failed",
        message: status >= 500 ? "The local service hit an unexpected error." : err.message,
        retryable: status >= 500,
      },
    };
    reply.code(status).send(body);
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post<{ Body: unknown }>("/mcp", async (request, reply) => {
    const requestedSession = request.headers["mcp-session-id"];
    let transport = typeof requestedSession === "string" ? mcpSessions.get(requestedSession) : undefined;
    if (!transport) {
      const mcp = createCoveMcpServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          if (transport) mcpSessions.set(sessionId, transport);
        },
      });
      transport.onclose = () => {
        if (transport?.sessionId) mcpSessions.delete(transport.sessionId);
      };
      await mcp.connect(transport);
    }
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
    return reply;
  });

  app.get("/mcp", async (request, reply) => {
    const sessionId = request.headers["mcp-session-id"];
    const transport = typeof sessionId === "string" ? mcpSessions.get(sessionId) : undefined;
    if (!transport) return reply.code(400).send({ error: { code: "mcp_session", message: "Missing or unknown MCP session.", retryable: false } });
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
    return reply;
  });

  app.delete("/mcp", async (request, reply) => {
    const sessionId = request.headers["mcp-session-id"];
    const transport = typeof sessionId === "string" ? mcpSessions.get(sessionId) : undefined;
    if (!transport) return reply.code(400).send({ error: { code: "mcp_session", message: "Missing or unknown MCP session.", retryable: false } });
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
    return reply;
  });

  app.get("/api/sources", async () => ({ sources: db.listSources() }));

  app.get("/api/portal/exams", async () => ({
    exams: db.listPortalExams(),
    // A sync that found zero exams still means "synced"; the setting survives
    // the empty table, so the UI never confuses it with "never synced".
    syncedAt: db.getSetting("portal_exams_synced_at") ?? db.portalExamsSyncedAt(),
    connected: portalLoginSaved(),
  }));

  app.post("/api/portal/exams/sync", async (_request, reply) => {
    try {
      const exams = await capturePortalExams();
      const syncedAt = new Date().toISOString();
      db.replacePortalExams(exams, syncedAt);
      db.setSetting("portal_exams_synced_at", syncedAt);
      return { count: exams.length, syncedAt };
    } catch (error) {
      if (error instanceof PortalError) {
        const status =
          error.code === "portal_not_connected"
            ? 409
            : error.code === "portal_timeout"
              ? 504
              : error.code === "portal_browser_unavailable"
                ? 503
                : 502;
        return reply.code(status).send({
          error: {
            code: error.code,
            message: error.message,
            retryable: error.code === "portal_timeout" || error.code === "portal_response_error",
          },
        } satisfies ApiError);
      }
      return reply.code(502).send({
        error: {
          code: "portal_sync_failed",
          message: error instanceof Error ? error.message : "同步考试时间表失败。",
          retryable: true,
        },
      } satisfies ApiError);
    }
  });

  app.get("/api/attendance/status", async () => {
    const raw = await secrets.get("attendance-credentials");
    let connected = false;
    if (raw) {
      try {
        const credentials = JSON.parse(raw) as AttendanceCredentials;
        connected = await validateAttendance(credentials);
      } catch {
        connected = false;
      }
    }
    return { connected, assistant: attendanceAssistant.get() };
  });

  app.post("/api/attendance/connect/start", async () => ({ assistant: await attendanceAssistant.start() }));
  app.get("/api/attendance/connect/status", async () => ({ assistant: attendanceAssistant.get() }));
  app.post("/api/attendance/connect/cancel", async () => ({ assistant: await attendanceAssistant.cancel() }));

  app.get("/api/attendance/preferences", async () => {
    const raw = db.getSetting("attendance_preferences");
    let value: AttendancePreferences = { courses: [] };
    try {
      value = raw ? parseAttendanceSessionPreference(JSON.parse(raw)) : value;
    } catch {
      value = { courses: [] };
    }
    return value;
  });

  app.put<{ Body: unknown }>("/api/attendance/preferences", async (request) => {
    const preferences = parseAttendanceSessionPreference(request.body);
    db.setSetting("attendance_preferences", JSON.stringify(preferences));
    return preferences;
  });

  app.post("/api/attendance/detect", async (_request, reply) => {
    const raw = await secrets.get("attendance-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "attendance_not_connected", message: "Attendance login is not configured.", retryable: false } } satisfies ApiError);
    try {
      const credentials = JSON.parse(raw) as AttendanceCredentials;
      const valid = await validateAttendance(credentials);
      if (!valid) return reply.code(409).send({ error: { code: "attendance_expired", message: "Attendance session expired; reconnect Attendance.", retryable: false } } satisfies ApiError);
      const sessions = await discoverAttendanceSessions(credentials);
      return { sessions, preferences: detectedToPreferences(sessions) };
    } catch (error) {
      return reply.code(502).send({ error: { code: "attendance_detect_failed", message: error instanceof Error ? error.message : "Attendance session detection failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { refresh?: string; rescan?: string } }>("/api/attendance/codes", async (request) => {
    const moodleRows = db.listAllMoodleContent();
    const rows = [
      ...db.listAttendanceItems().map((row) => ({
        id: row.id,
        source: row.source,
        course: row.course,
        title: row.title,
        text: row.text,
        url: row.url,
        publishedAt: row.publishedAt,
      })),
      ...moodleRows.map((row) => ({
        id: row.id,
        source: "moodle" as const,
        course: row.courseName,
        title: row.title,
        text: row.text,
        url: row.url,
        publishedAt: row.updatedAt,
      })),
    ];
    // Text codes are cheap to re-derive; keep them in the attendance table so
    // history survives even after the source item scrolls out of the window.
    for (const code of parseAttendanceRows(rows)) {
      db.upsertAttendanceCode({ ...code, origin: "text" });
    }

    // OCR is the expensive part: only scan rows that were never scanned, or
    // that failed last time. `rescan=1` forces a full pass.
    let ocr: { scanned: number; failed: number; pending: number } | null = null;
    if (request.query.refresh === "1") {
      const raw = await secrets.get("moodle-credentials");
      if (raw) {
        try {
          const credentials = moodleCredentials.parse(JSON.parse(raw));
          // Attendance announcements often arrive as Gmail copies of a Moodle forum
          // post whose code is an image. Feed those forum URLs into the same OCR path.
          const forumRows = db.listAttendanceItems()
            .filter((row) => row.source === "gmail")
            .flatMap((row) => {
              const forumUrl = /https:\/\/learning\.monash\.edu\/mod\/forum\/discuss\.php\?d=\d+/.exec(row.text)?.[0];
              if (!forumUrl) return [];
              const course = /^(.+?)\s+-\s+Announcements\s+-/i.exec(row.title)?.[1] ?? row.course;
              return [{
                id: `gmail-forum:${row.id}`,
                courseId: "",
                courseName: course || "Moodle",
                sectionNumber: 0,
                sectionTitle: row.title,
                module: "forum",
                title: row.title,
                url: forumUrl,
                text: row.text,
                updatedAt: row.publishedAt,
              }];
            });
          const seen = new Set<string>();
          const candidates = [...moodleRows, ...forumRows].filter((row) => {
            const key = `${row.courseName}:${row.url}:${row.title}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          const scanKeys = new Map(candidates.map((row) => [row.id, attendanceScanKey(row)]));
          const known = request.query.rescan === "1" ? new Map<string, string>() : db.attendanceScanStatus([...scanKeys.values()]);
          const pending = candidates
            // Only pages that talk about attendance are worth OCR (the scanner
            // applies the same filter, but the scan ledger should match it).
            .filter((row) => /attendance/i.test(`${row.title} ${row.text}`))
            .filter((row) => {
              const status = known.get(scanKeys.get(row.id) ?? "");
              // "empty" means the picture was read but no code matched its shape:
              // retrying the same pixels costs 30s and changes nothing.
              return status !== "ok" && status !== "empty";
            });
          if (pending.length > 0) {
            const { codes, failedRowIds } = await scanMoodleAttendanceImages(credentials, pending, moodleTransport.forCredentials(raw));
            for (const code of codes) db.upsertAttendanceCode({ ...code, origin: "ocr" });
            const failed = new Set(failedRowIds);
            const produced = new Set(codes.map((code) => code.id.split(":")[1]));
            for (const row of pending) {
              const key = scanKeys.get(row.id) ?? attendanceScanKey(row);
              if (failed.has(row.id)) db.setAttendanceScan(key, "error", "OCR failed");
              else if (produced.has(row.id)) db.setAttendanceScan(key, "ok");
              else db.setAttendanceScan(key, "empty", "图片读到了，但没有匹配到 code 格式");
            }
            db.setSetting("attendance_scan_at", new Date().toISOString());
            ocr = { scanned: pending.length, failed: failed.size, pending: 0 };
          } else {
            ocr = { scanned: 0, failed: 0, pending: 0 };
          }
        } catch (error) {
          ocr = { scanned: 0, failed: 1, pending: 0 };
          db.setSetting("attendance_scan_error", error instanceof Error ? error.message : "scan failed");
        }
      }
    }
    const rawPreferences = db.getSetting("attendance_preferences");
    let preferences = { courses: [] as Array<{ course: string; sessions: string[] }> };
    try {
      preferences = rawPreferences ? parseAttendanceSessionPreference(JSON.parse(rawPreferences)) : preferences;
    } catch {
      preferences = { courses: [] };
    }
    const seen = new Set<string>();
    const codes = db
      .listAttendanceCodes()
      .filter((code) => matchesPreferredSession(preferences, code.course, code.session))
      // The same code usually arrives twice (Moodle content plus a Gmail copy).
      .filter((code) => {
        const key = `${code.course}|${code.week}|${code.session}|${code.code}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { codes, ocr, lastScanAt: db.getSetting("attendance_scan_at") };
  });

  app.post<{ Body: { items?: Array<{ course?: string; week?: number; session?: string; code?: string }> } }>("/api/attendance/fill-all", async (request, reply) => {
    const items = (request.body?.items ?? []).filter((item) => item && typeof item.course === "string" && typeof item.session === "string" && typeof item.code === "string" && Number.isInteger(item.week));
    if (items.length === 0 || items.length > 50) {
      return reply.code(400).send({ error: { code: "invalid_attendance", message: "Select between 1 and 50 attendance codes.", retryable: false } } satisfies ApiError);
    }
    const raw = await secrets.get("attendance-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "attendance_not_connected", message: "Attendance login is not configured.", retryable: false } } satisfies ApiError);
    try {
      const credentials = JSON.parse(raw) as AttendanceCredentials;
      const valid = await validateAttendance(credentials);
      if (!valid) return reply.code(409).send({ error: { code: "attendance_expired", message: "Attendance session expired; reconnect Attendance.", retryable: false } } satisfies ApiError);
      const results = [];
      let filled = 0;
      let inactive = 0;
      let notFound = 0;
      for (const item of items) {
        try {
          const result = await fillAttendance({ course: item.course!, week: Number(item.week), session: item.session!, code: item.code! }, credentials);
          if (result.status === "filled") {
            filled += 1;
            db.markAttendanceFilled(item.course!, Number(item.week), item.session!, item.code!);
          }
          else if (result.status === "inactive") inactive += 1;
          else notFound += 1;
          results.push({ course: item.course, week: item.week, session: item.session, code: item.code, ...result });
        } catch (error) {
          results.push({ course: item.course, week: item.week, session: item.session, code: item.code, status: "error", message: error instanceof Error ? error.message : "fill failed" });
        }
      }
      return { filled, inactive, notFound, results };
    } catch (error) {
      return reply.code(502).send({ error: { code: "attendance_fill_failed", message: error instanceof Error ? error.message : "Attendance fill failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.get("/api/attendance/unmatched", async () => {
    const rows = db
      .listAllMoodleContent()
      .filter((row) => (row.images?.length ?? 0) > 0)
      // Same gate as the scanner: only pages that talk about attendance.
      .filter((row) => /attendance/i.test(`${row.title} ${row.text}`));
    const keys = new Map(rows.map((row) => [row.id, attendanceScanKey(row)]));
    const statuses = db.attendanceScanStatus([...keys.values()]);
    const items = rows
      .map((row) => ({ row, status: statuses.get(keys.get(row.id) ?? "") }))
      .filter(({ status }) => status === "empty" || status === "error")
      .map(({ row, status }) => ({
        id: row.id,
        course: row.courseName,
        week: Number(/\bweek\s*(\d{1,2})\b/i.exec(row.title)?.[1] ?? 0) || null,
        title: row.title,
        url: row.url,
        images: row.images ?? [],
        status,
      }));
    return { items, lastScanAt: db.getSetting("attendance_scan_at") };
  });

  app.get<{ Querystring: { url?: string } }>("/api/moodle/asset", async (request, reply) => {
    const target = request.query.url;
    if (!target) return reply.code(400).send({ error: { code: "invalid_url", message: "url is required.", retryable: false } } satisfies ApiError);
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    const base = new URL(credentials.baseUrl);
    const parsed = new URL(target, credentials.baseUrl);
    if (parsed.hostname !== base.hostname || !parsed.pathname.includes("pluginfile.php")) {
      return reply.code(403).send({ error: { code: "blocked_host", message: "Only Moodle pluginfile assets can be served.", retryable: false } } satisfies ApiError);
    }
    try {
      const response = await moodleTransport.forCredentials(raw)(parsed.toString(), {
        headers: { cookie: moodleCookieHeader(credentials) },
        redirect: "follow",
      });
      if (!response.ok) {
        return reply.code(502).send({ error: { code: "asset_failed", message: `Moodle returned HTTP ${response.status}.`, retryable: true } } satisfies ApiError);
      }
      reply.header("content-type", response.headers.get("content-type") ?? "image/png");
      reply.header("cache-control", "private, max-age=300");
      return reply.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      return reply.code(502).send({ error: { code: "asset_failed", message: error instanceof Error ? error.message : "Asset fetch failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.post<{ Body: { course?: string; week?: number; session?: string; code?: string } }>("/api/attendance/fill", async (request, reply) => {
    const body = request.body ?? {};
    if (!body.course || !body.session || !body.code || !Number.isInteger(body.week) || Number(body.week) < 1) {
      return reply.code(400).send({ error: { code: "invalid_attendance", message: "course, week, session and code are required.", retryable: false } } satisfies ApiError);
    }
    const raw = await secrets.get("attendance-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "attendance_not_connected", message: "Attendance login is not configured.", retryable: false } } satisfies ApiError);
    try {
      const credentials = JSON.parse(raw) as AttendanceCredentials;
      const valid = await validateAttendance(credentials);
      if (!valid) return reply.code(409).send({ error: { code: "attendance_expired", message: "Attendance session expired; reconnect Attendance.", retryable: false } } satisfies ApiError);
      const result = await fillAttendance({ course: body.course, week: Number(body.week), session: body.session, code: body.code }, credentials);
      if (result.status === "filled") db.markAttendanceFilled(body.course, Number(body.week), body.session, body.code);
      return result;
    } catch (error) {
      return reply.code(502).send({ error: { code: "attendance_fill_failed", message: error instanceof Error ? error.message : "Attendance fill failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.post<{ Body: { items?: Array<{ course?: string; week?: number; session?: string; code?: string }> } }>("/api/attendance/submit", async (request, reply) => {
    const rawItems = Array.isArray(request.body?.items) ? request.body.items : [];
    if (rawItems.length === 0 || rawItems.length > 50) {
      return reply.code(400).send({ error: { code: "invalid_attendance", message: "Select between 1 and 50 attendance codes.", retryable: false } } satisfies ApiError);
    }
    // `code` is the only required field. A missing course/session is reported
    // per item as "not submitted" — never guessed, never silently dropped.
    const items: AttendanceSubmitInput[] = [];
    for (const [index, rawItem] of rawItems.entries()) {
      const item = rawItem ?? {};
      const code = typeof item.code === "string" ? item.code.trim().toUpperCase() : "";
      if (!code || code.length > 32) {
        return reply.code(400).send({ error: { code: "invalid_attendance", message: `items[${index}].code is required (1-32 characters).`, retryable: false } } satisfies ApiError);
      }
      const week = item.week === undefined ? undefined : Number(item.week);
      if (week !== undefined && !Number.isInteger(week)) {
        return reply.code(400).send({ error: { code: "invalid_attendance", message: `items[${index}].week must be an integer.`, retryable: false } } satisfies ApiError);
      }
      items.push({
        course: typeof item.course === "string" && item.course.trim() ? item.course.trim() : undefined,
        week,
        session: typeof item.session === "string" && item.session.trim() ? item.session.trim() : undefined,
        code,
      });
    }

    const raw = await secrets.get("attendance-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "attendance_not_connected", message: "Attendance login is not configured.", retryable: false } } satisfies ApiError);
    const credentials = (() => {
      try {
        const parsed = JSON.parse(raw) as AttendanceCredentials;
        if (!parsed?.baseUrl || !Array.isArray(parsed.cookies)) return null;
        return parsed;
      } catch {
        return null;
      }
    })();
    if (!credentials) {
      return reply.code(409).send({ error: { code: "attendance_expired", message: "Attendance session is unreadable; reconnect Attendance.", retryable: false } } satisfies ApiError);
    }

    try {
      const summary = await submitAttendance(credentials, items, { timeoutMs: ATTENDANCE_SUBMIT_TIMEOUT_MS });
      for (const entry of summary.results) {
        if (entry.status !== "submitted") continue;
        const { course, session, week } = entry;
        if (!course || !session || typeof week !== "number" || !Number.isInteger(week)) continue;
        db.markAttendanceFilled(course, week, session, entry.code);
      }
      return summary;
    } catch (error) {
      if (error instanceof AttendanceLoginRequiredError) {
        return reply.code(409).send({ error: { code: "attendance_expired", message: error.message, retryable: false } } satisfies ApiError);
      }
      if (error instanceof AttendanceSubmitBusyError) {
        return reply.code(409).send({ error: { code: "attendance_submit_busy", message: error.message, retryable: true } } satisfies ApiError);
      }
      // A failed submit may still have reached the portal. Retrying automatically
      // is unsafe, so this error is explicitly not retryable.
      return reply.code(502).send({
        error: {
          code: "attendance_submit_failed",
          message: `提交没有完成：${error instanceof Error ? error.message : "unknown error"}。是否已提交未知，请先到 Attendance 门户核对，不要直接重试。`,
          retryable: false,
        },
      } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { since?: string; source?: string; q?: string; limit?: string } }>("/api/brief", async (request, reply) => {
    const { since, source, q, limit } = request.query;
    if (source && !sourceSchema.safeParse(source).success) {
      return reply.code(400).send({ error: { code: "invalid_source", message: "Unknown source", retryable: false } } satisfies ApiError);
    }
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
      return reply.code(400).send({ error: { code: "invalid_limit", message: "limit must be a positive integer.", retryable: false } } satisfies ApiError);
    }
    return db.brief({ since, source: source as Source | undefined, query: q, limit: parsedLimit });
  });

  const readOnTrack = async (identity: string, force: boolean) => resourceCache.read({
    source: "ontrack", identity, resource: "overview:v2", ttlMs: RESOURCE_TTL.ontrack,
    currentIdentity: onTrackCacheIdentity, force,
  }, async () => {
    const account = await fetchOnTrackAccount();
    if (!account) throw new Error("OnTrack 登录已失效，请重新连接。");
    const projects = await fetchOnTrackProjects();
    const overview: Array<(typeof projects)[number] & { tasks: Awaited<ReturnType<typeof fetchOnTrackTasks>> }> = [];
    // Bounded project batches; all overview/list consumers share this one refresh.
    for (let index = 0; index < projects.length; index += 4) {
      const batch = await Promise.all(projects.slice(index, index + 4).map(async (project) => ({
        ...project, tasks: await fetchOnTrackTasks(project.id, project),
      })));
      overview.push(...batch);
    }
    return { data: { account, projects: overview } };
  });

  app.get("/api/ontrack/overview", async (request, reply) => {
    const identity = await onTrackCacheIdentity();
    if (!identity) return { connected: false, account: null, projects: [] };
    try {
      const result = await readOnTrack(identity, forcedRefresh(request.url));
      reply.header("cache-control", "no-store");
      return { connected: true, ...result.data, cache: result.cache };
    } catch (error) {
      if (error instanceof CacheIdentityChangedError) throw error;
      return reply.code(502).send({ error: { code: "ontrack_unavailable", message: error instanceof Error ? error.message : "读取 OnTrack 失败", retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { project?: string; task?: string; kind?: string } }>("/api/ontrack/artifact", async (request, reply) => {
    const projectId = Number(request.query.project);
    const taskDefinitionId = Number(request.query.task);
    const kind = request.query.kind ?? "task";
    if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(taskDefinitionId) || taskDefinitionId <= 0) {
      return reply.code(400).send({ error: { code: "invalid_target", message: "project and task must be positive integers.", retryable: false } } satisfies ApiError);
    }
    if (kind !== "task" && kind !== "submission" && kind !== "resources") {
      return reply.code(400).send({ error: { code: "invalid_kind", message: "kind must be task, submission or resources.", retryable: false } } satisfies ApiError);
    }

    try {
      const unitId = await resolveOnTrackUnitId(projectId);
      const path =
        kind === "resources"
          ? `/units/${unitId}/task_definitions/${taskDefinitionId}/task_resources.json`
          : kind === "submission"
            ? `/projects/${projectId}/task_def_id/${taskDefinitionId}/submission?as_attachment=true`
            : `/units/${unitId}/task_definitions/${taskDefinitionId}/task_pdf.json?as_attachment=true`;

      const artifact = await fetchOnTrackArtifact(path);
      const validated = validateOnTrackArtifact(artifact, kind);
      const filename = `ontrack-${kind}-${taskDefinitionId}${validated.extension}`;
      return reply
        .header("content-type", validated.contentType)
        .header("x-content-type-options", "nosniff")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send(artifact.body);
    } catch (error) {
      return reply.code(502).send({
        error: { code: "ontrack_download_failed", message: error instanceof Error ? error.message : "OnTrack download failed.", retryable: true },
      } satisfies ApiError);
    }
  });

  app.get("/api/ontrack/tasks", async (request, reply) => {
    try {
      const identity = await onTrackCacheIdentity();
      if (!identity) return { projects: [], tasks: [] };
      const result = await readOnTrack(identity, forcedRefresh(request.url));
      const tasks = result.data.projects.flatMap((project) => project.tasks.map((task) => ({
        ...task, projectId: project.id, unitCode: project.unitCode, unitName: project.unitName,
      })));
      const projects = result.data.projects.map(({ tasks: _tasks, ...project }) => project);
      reply.header("cache-control", "no-store");
      return { projects, tasks, cache: result.cache };
    } catch (error) {
      if (error instanceof CacheIdentityChangedError) throw error;
      return reply.code(502).send({
        error: { code: "ontrack_unavailable", message: error instanceof Error ? error.message : "OnTrack is unavailable.", retryable: true },
      } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { project?: string; task?: string } }>("/api/ontrack/comments", async (request, reply) => {
    const projectId = Number(request.query.project);
    const taskDefinitionId = Number(request.query.task);
    if (!Number.isInteger(projectId) || !Number.isInteger(taskDefinitionId)) {
      return reply.code(400).send({ error: { code: "invalid_target", message: "project and task are required.", retryable: false } } satisfies ApiError);
    }
    try {
      const account = await fetchOnTrackAccount();
      const comments = await fetchOnTrackComments(projectId, taskDefinitionId);
      return { comments, viewerId: account?.userId ?? null };
    } catch (error) {
      return reply.code(502).send({
        error: { code: "ontrack_unavailable", message: error instanceof Error ? error.message : "OnTrack is unavailable.", retryable: true },
      } satisfies ApiError);
    }
  });

  app.get("/api/ontrack/account", async () => {
    const account = await fetchOnTrackAccount();
    if (!account) return { connected: false, account: null };
    return { connected: true, account };
  });

  app.get("/api/credentials", async () => ({ credentials: await describeCredentials(secrets) }));

  app.get<{ Querystring: { since?: string; limit?: string } }>("/api/changes", async (request, reply) => {
    const { since, limit } = request.query;
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
      return reply.code(400).send({ error: { code: "invalid_limit", message: "limit must be a positive integer.", retryable: false } } satisfies ApiError);
    }
    const changes = db.listChanges({ since: since ?? null, limit: parsedLimit });
    return { changes, since: since ?? null } satisfies ChangesResponse;
  });

  app.get<{ Params: { id: string } }>("/api/items/:id", async (request, reply) => {
    const item = db.getItem(request.params.id);
    if (!item) {
      return reply.code(404).send({ error: { code: "not_found", message: "Item not found", retryable: false } } satisfies ApiError);
    }
    return item;
  });

  app.get<{ Params: { id: string } }>("/api/items/:id/detail", async (request, reply) => {
    const item = db.getItem(request.params.id);
    if (!item) return reply.code(404).send({ error: { code: "not_found", message: "Item not found", retryable: false } } satisfies ApiError);
    const fallback = {
      authorName: "",
      authorRole: item.authorRole,
      text: item.text,
      replies: [],
      url: item.url,
      warning: "无法读取来源的实时回复，已显示本地缓存。",
    };
    try {
      if (item.source === "ed") {
        const raw = await secrets.get("ed-credentials");
        if (!raw) return fallback;
        const credentials = JSON.parse(raw) as { token: string; region: "us" | "au" | "eu" };
        const threadId = Number(item.sourceItemId.replace(/^thread:/, ""));
        if (!Number.isFinite(threadId)) return fallback;
        const detail = await new EdClient(credentials.token, credentials.region, fetcher).getThreadDetail(threadId);
        return { ...detail, url: item.url, warning: null };
      }
      if (item.source === "gmail") {
        try {
          const message = await (await google.client()).getMessage(item.sourceItemId);
          return {
            authorName: message.fromName,
            authorRole: "unknown",
            text: message.text,
            replies: [],
            url: item.url,
            warning: null,
          };
        } catch {
          return fallback;
        }
      }
      return { ...fallback, warning: null };
    } catch {
      return fallback;
    }
  });

  app.post("/api/check", async (request, reply) => {
    const parsed = checkSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: parsed.error.message, retryable: false } } satisfies ApiError);
    }
    db.markChecked(parsed.data.ids);
    return { ok: true, lastCheckedAt: db.getSetting("last_checked_at") };
  });

  app.patch<{ Params: { id: string }; Body: { completed?: boolean | null } }>("/api/items/:id/completed", async (request, reply) => {
    const body = request.body ?? {};
    if (!("completed" in body) || (body.completed !== null && typeof body.completed !== "boolean")) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "completed must be true, false, or null.", retryable: false } } satisfies ApiError);
    }
    if (!db.getItem(request.params.id)) {
      return reply.code(404).send({ error: { code: "not_found", message: "Item not found", retryable: false } } satisfies ApiError);
    }
    db.setItemUserCompleted(request.params.id, body.completed);
    return db.getItem(request.params.id);
  });

  app.patch<{ Params: { id: string } }>("/api/items/:id/correction", async (request, reply) => {
    const parsed = correctionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: parsed.error.message, retryable: false } } satisfies ApiError);
    }
    if (!db.getItem(request.params.id)) {
      return reply.code(404).send({ error: { code: "not_found", message: "Item not found", retryable: false } } satisfies ApiError);
    }
    return db.saveCorrection(request.params.id, parsed.data);
  });

  app.get("/api/oauth/google/start", async (_request, reply) => {
    try {
      return { url: google.start() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google OAuth is not configured.";
      return reply.code(503).send({ error: { code: "oauth_not_configured", message, retryable: false } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/oauth/google/callback", async (request, reply) => {
    const { code, state, error } = request.query;
    const appUrl = process.env.COVE_APP_URL ?? "http://127.0.0.1:5174/";
    if (error || !code || !state) {
      const target = new URL(appUrl);
      target.searchParams.set("connected", "error");
      return reply.code(302).header("location", target.toString()).send();
    }
    try {
      await google.handleCallback(code, state);
      // The Gmail profile is the only account identity the grant gives us; when
      // Google does not answer, the account stays empty instead of guessing.
      const email = await google.accountEmail();
      if (email) db.setSourceAccount("gmail", email);
      const target = new URL(appUrl);
      target.searchParams.set("connected", "gmail");
      return reply.code(302).header("location", target.toString()).send();
    } catch (cause) {
      const target = new URL(appUrl);
      target.searchParams.set("connected", "error");
      return reply.code(302).header("location", target.toString()).send();
    }
  });

  app.post("/api/oauth/google/disconnect", async () => {
    await google.disconnect();
    db.setSourceStatus("gmail", "disconnected", null, null);
    db.setSourceAccount("gmail", null);
    return { ok: true };
  });

  const edCredentials = z.object({ token: z.string().min(1), region: z.enum(["us", "au", "eu"]).default("us") });

  app.post<{ Params: { source: string } }>("/api/sources/:source/credentials", async (request, reply) => {
    const source = sourceSchema.safeParse(request.params.source);
    if (!source.success) {
      return reply.code(400).send({ error: { code: "invalid_source", message: "Unknown source", retryable: false } } satisfies ApiError);
    }
    if (source.data === "gmail") {
      return reply.code(400).send({ error: { code: "use_oauth", message: "Use the Gmail OAuth flow.", retryable: false } } satisfies ApiError);
    }
    if (source.data === "ontrack") {
      return reply.code(400).send({ error: { code: "use_assistant", message: "Use the OnTrack login assistant.", retryable: false } } satisfies ApiError);
    }
    if (source.data === "ed") {
      const parsed = edCredentials.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_request", message: parsed.error.message, retryable: false } } satisfies ApiError);
      await secrets.set("ed-credentials", JSON.stringify(parsed.data));
      // The Ed token carries no account identity, so sources.account stays NULL.
    } else {
      const parsed = moodleCredentials.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_request", message: parsed.error.message, retryable: false } } satisfies ApiError);
      await secrets.set("moodle-credentials", JSON.stringify(parsed.data));
      db.setSourceAccount("moodle", parsed.data.username ?? null);
    }
    db.setSourceStatus(source.data, "degraded", null, null);
    return { ok: true };
  });

  app.post<{ Params: { source: string } }>("/api/sources/:source/disconnect", async (request, reply) => {
    const source = sourceSchema.safeParse(request.params.source);
    if (!source.success) return reply.code(400).send({ error: { code: "invalid_source", message: "Unknown source", retryable: false } } satisfies ApiError);
    if (source.data === "ed") await secrets.delete("ed-credentials");
    if (source.data === "moodle") await secrets.delete("moodle-credentials");
    if (source.data === "gmail") await google.disconnect();
    if (source.data === "ontrack") await disconnectOnTrackCredentials();
    db.setSourceStatus(source.data, "disconnected", null, null);
    db.setSourceAccount(source.data, null);
    return { ok: true };
  });

  app.get("/api/moodle/course-preferences", async (_request, reply) => {
    const identity = await credentialIdentity("moodle");
    if (!identity) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    reply.header("cache-control", "no-store");
    return getMoodleCoursePreferences(db, identity);
  });

  app.patch("/api/moodle/course-preferences", async (request, reply) => {
    const identity = await credentialIdentity("moodle");
    if (!identity) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    const parsed = coursePreferencesSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_preferences", message: "课程同步范围格式无效。", retryable: false } } satisfies ApiError);
    if (await credentialIdentity("moodle") !== identity) throw new CacheIdentityChangedError();
    saveMoodleCoursePreferences(db, identity, parsed.data);
    return parsed.data;
  });

  app.get("/api/moodle/courses", async (request, reply) => {
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    try {
      const identity = moodleCredentialIdentity(raw);
      const result = await resourceCache.read({ source: "moodle", identity, resource: "courses:v1", ttlMs: RESOURCE_TTL.courses,
        currentIdentity: () => credentialIdentity("moodle"), force: forcedRefresh(request.url) }, async () => ({
        data: await new MoodleClient(credentials.baseUrl, moodleCookieHeader(credentials), moodleTransport.forCredentials(raw)).listCourses(),
      }));
      reply.header("cache-control", "no-store");
      return { courses: result.data, cache: result.cache };
    } catch (error) {
      if (error instanceof CacheIdentityChangedError) throw error;
      const message = error instanceof Error ? error.message : "Moodle course list failed.";
      return reply.code(502).send({ error: { code: "moodle_courses_failed", message, retryable: true } } satisfies ApiError);
    }
  });

  app.post<{ Body: { courseId?: number } }>("/api/moodle/content-sync", async (request, reply) => {
    const courseId = Number(request.body?.courseId);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return reply.code(400).send({ error: { code: "invalid_course", message: "courseId is required.", retryable: false } } satisfies ApiError);
    }
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    try {
      const result = await syncMoodleContent(db, credentials.baseUrl, moodleCookieHeader(credentials), courseId, moodleTransport.forCredentials(raw));
      db.setSourceStatus("moodle", "connected", new Date().toISOString(), null);
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Moodle content sync failed.";
      db.setSourceStatus("moodle", "error", null, message);
      return reply.code(502).send({ error: { code: "moodle_content_failed", message, retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { url?: string; name?: string } }>("/api/moodle/download", async (request, reply) => {
    const targetValue = request.query.url;
    if (!targetValue) return reply.code(400).send({ error: { code: "invalid_url", message: "url is required.", retryable: false } } satisfies ApiError);
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    try {
      const file = await downloadMoodleResource(credentials, targetValue, request.query.name, moodleTransport.forCredentials(raw));
      reply.header("content-type", file.contentType);
      reply.header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
      return reply.send(file.buffer);
    } catch (error) {
      if (error instanceof MoodleDownloadError) {
        return reply.code(error.status).send({ error: { code: error.code, message: error.message, retryable: error.status >= 500 } } satisfies ApiError);
      }
      return reply.code(502).send({ error: { code: "download_failed", message: "Moodle download failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { url?: string; name?: string } }>("/api/moodle/page", async (request, reply) => {
    if (!request.query.url) return reply.code(400).send({ error: { code: "invalid_url", message: "url is required.", retryable: false } } satisfies ApiError);
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    try {
      const credentials = moodleCredentials.parse(JSON.parse(raw));
      const image = await captureMoodlePage(credentials, request.query.url);
      const name = `${safeDownloadName(request.query.name || "moodle-page") || "moodle-page"}.png`;
      reply.header("content-type", "image/png");
      reply.header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      return reply.send(image);
    } catch (error) {
      return reply.code(502).send({ error: { code: "moodle_page_failed", message: error instanceof Error ? error.message : "Moodle page capture failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.post<{ Body: { urls?: string[]; items?: Array<{ url?: string; name?: string }>; archiveName?: string } }>("/api/moodle/download-batch", async (request, reply) => {
    const rawItems: Array<{ url?: string; name?: string }> = request.body?.items?.length
      ? request.body.items
      : (request.body?.urls ?? []).map((url) => ({ url }));
    const seenUrls = new Set<string>();
    const items = rawItems
      .filter((item): item is { url: string; name?: string } => {
        if (typeof item.url !== "string" || !item.url || seenUrls.has(item.url)) return false;
        seenUrls.add(item.url);
        return true;
      });
    if (items.length === 0 || items.length > 100) {
      return reply.code(400).send({ error: { code: "invalid_urls", message: "Select between 1 and 100 resources.", retryable: false } } satisfies ApiError);
    }
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    const zip = new JSZip();
    let added = 0;
    let skipped = 0;
    let totalBytes = 0;
    const usedNames = new Set<string>();
    for (const item of items) {
      try {
        const file = await downloadMoodleResource(credentials, item.url, item.name, moodleTransport.forCredentials(raw));
        if (totalBytes + file.buffer.length > 100 * 1024 * 1024) {
          skipped += 1;
          continue;
        }
        let name = file.fileName;
        let suffix = 2;
        while (usedNames.has(name.toLowerCase())) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${file.fileName.slice(0, dot)} (${suffix})${file.fileName.slice(dot)}` : `${file.fileName} (${suffix})`;
          suffix += 1;
        }
        usedNames.add(name.toLowerCase());
        zip.file(name, file.buffer);
        totalBytes += file.buffer.length;
        added += 1;
      } catch {
        skipped += 1;
      }
    }
    if (added === 0) {
      return reply.code(404).send({ error: { code: "no_files", message: "None of the selected resources could be downloaded.", retryable: false } } satisfies ApiError);
    }
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    reply.header("content-type", "application/zip");
    const requestedArchive = safeDownloadName(request.body?.archiveName ?? "moodle-materials") || "moodle-materials";
    const archiveName = requestedArchive.toLowerCase().endsWith(".zip") ? requestedArchive : `${requestedArchive}.zip`;
    reply.header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
    reply.header("x-cove-batch-count", String(added));
    reply.header("x-cove-batch-skipped", String(skipped));
    return reply.send(archive);
  });

  app.get<{ Querystring: { refresh?: string } }>("/api/update", async (request) => {
    if (!request.query.refresh && updateCache && Date.now() - updateCache.at < 15 * 60_000) return updateCache.value;
    try {
      const latest = await fetchLatestRelease(fetcher);
      const value = buildUpdateStatus(CURRENT_VERSION, latest);
      updateCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      const value = buildUpdateStatus(CURRENT_VERSION, null, error instanceof Error ? error.message : "Update check failed.");
      updateCache = { at: Date.now(), value };
      return value;
    }
  });

  app.get("/api/ed/courses", async (request, reply) => {
    const raw = await secrets.get("ed-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "ed_not_connected", message: "Ed is not connected.", retryable: false } } satisfies ApiError);
    try {
      const credentials = JSON.parse(raw) as { token: string; region: "us" | "au" | "eu" };
      const identity = createHash("sha256").update(`ed\0${raw}`).digest("hex");
      const result = await resourceCache.read({ source: "ed", identity, resource: "courses:v1", ttlMs: RESOURCE_TTL.courses,
        currentIdentity: () => credentialIdentity("ed"), force: forcedRefresh(request.url) }, async () => ({
        data: await new EdClient(credentials.token, credentials.region, fetcher).listCourses(),
      }));
      reply.header("cache-control", "no-store");
      return { courses: result.data, cache: result.cache };
    } catch (error) {
      if (error instanceof CacheIdentityChangedError) throw error;
      return reply.code(502).send({ error: { code: "ed_courses_failed", message: error instanceof Error ? error.message : "Ed courses failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { courseId?: string } }>("/api/ed/lessons", async (request, reply) => {
    const courseId = Number(request.query.courseId);
    if (!Number.isFinite(courseId)) return reply.code(400).send({ error: { code: "invalid_course", message: "courseId is required.", retryable: false } } satisfies ApiError);
    const raw = await secrets.get("ed-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "ed_not_connected", message: "Ed is not connected.", retryable: false } } satisfies ApiError);
    try {
      const credentials = JSON.parse(raw) as { token: string; region: "us" | "au" | "eu" };
      const identity = createHash("sha256").update(`ed\0${raw}`).digest("hex");
      const result = await resourceCache.read({ source: "ed", identity, resource: `lessons:v1:${courseId}`, ttlMs: RESOURCE_TTL.ed,
        currentIdentity: () => credentialIdentity("ed"), force: forcedRefresh(request.url) }, async () => ({
        data: await new EdClient(credentials.token, credentials.region, fetcher).listLessons(courseId),
      }));
      reply.header("cache-control", "no-store");
      return { lessons: result.data, cache: result.cache };
    } catch (error) {
      if (error instanceof CacheIdentityChangedError) throw error;
      return reply.code(502).send({ error: { code: "ed_lessons_failed", message: error instanceof Error ? error.message : "Ed lessons failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { lessonId?: string } }>("/api/ed/lesson", async (request, reply) => {
    const lessonId = Number(request.query.lessonId);
    if (!Number.isFinite(lessonId)) return reply.code(400).send({ error: { code: "invalid_lesson", message: "lessonId is required.", retryable: false } } satisfies ApiError);
    const raw = await secrets.get("ed-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "ed_not_connected", message: "Ed is not connected.", retryable: false } } satisfies ApiError);
    try {
      const credentials = JSON.parse(raw) as { token: string; region: "us" | "au" | "eu" };
      const identity = createHash("sha256").update(`ed\0${raw}`).digest("hex");
      const result = await resourceCache.read({ source: "ed", identity, resource: `lesson:v1:${lessonId}`, ttlMs: RESOURCE_TTL.ed,
        currentIdentity: () => credentialIdentity("ed"), force: forcedRefresh(request.url) }, async () => ({
        data: await new EdClient(credentials.token, credentials.region, fetcher).getLesson(lessonId),
      }));
      reply.header("cache-control", "no-store");
      return { ...result.data, cache: result.cache };
    } catch (error) {
      if (error instanceof CacheIdentityChangedError) throw error;
      return reply.code(502).send({ error: { code: "ed_lesson_failed", message: error instanceof Error ? error.message : "Ed lesson failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { url?: string; name?: string } }>("/api/ed/download", async (request, reply) => {
    if (!request.query.url) return reply.code(400).send({ error: { code: "invalid_url", message: "url is required.", retryable: false } } satisfies ApiError);
    const raw = await secrets.get("ed-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "ed_not_connected", message: "Ed is not connected.", retryable: false } } satisfies ApiError);
    try {
      const response = await fetchAsset(fetcher, request.query.url);
      if (!response.ok) return reply.code(502).send({ error: { code: "ed_download_failed", message: `Ed file returned HTTP ${response.status}.`, retryable: true } } satisfies ApiError);
      const buffer = Buffer.from(await response.arrayBuffer());
      const name = safeDownloadName(request.query.name || "ed-material") || "ed-material";
      reply.header("content-type", response.headers.get("content-type") ?? "application/octet-stream");
      reply.header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      return reply.send(buffer);
    } catch (error) {
      if (error instanceof AssetFetchError) {
        return reply.code(error.status).send({ error: { code: error.code, message: error.message, retryable: error.status >= 500 } } satisfies ApiError);
      }
      return reply.code(502).send({ error: { code: "ed_download_failed", message: error instanceof Error ? error.message : "Ed download failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.post<{ Body: { lessonTitle?: string; markdown?: string; files?: Array<{ name?: string; url?: string }> } }>("/api/ed/download-batch", async (request, reply) => {
    const files = (request.body?.files ?? []).filter((file): file is { name: string; url: string } => Boolean(file.url));
    if (files.length > 100) return reply.code(400).send({ error: { code: "too_many_files", message: "Too many files.", retryable: false } } satisfies ApiError);
    const raw = await secrets.get("ed-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "ed_not_connected", message: "Ed is not connected.", retryable: false } } satisfies ApiError);
    const zip = new JSZip();
    let added = 0;
    let blocked = 0;
    let totalBytes = 0;
    if (request.body?.markdown) {
      zip.file("lesson.md", request.body.markdown);
      added += 1;
    }
    for (const file of files) {
      try {
        const response = await fetchAsset(fetcher, file.url);
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (totalBytes + buffer.length > 100 * 1024 * 1024) continue;
        totalBytes += buffer.length;
        let name = safeDownloadName(file.name || "file") || "file";
        let suffix = 2;
        while (zip.file(name)) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${suffix})${name.slice(dot)}` : `${name} (${suffix})`;
          suffix += 1;
        }
        zip.file(name, buffer);
        added += 1;
      } catch (error) {
        if (error instanceof AssetFetchError && error.code === "blocked_host") blocked += 1;
        // Best-effort archive: omit files that Ed's static host cannot serve.
      }
    }
    if (added === 0 && blocked > 0) {
      return reply.code(403).send({ error: { code: "blocked_host", message: "None of the selected files are hosted on Ed.", retryable: false } } satisfies ApiError);
    }
    if (added === 0) return reply.code(404).send({ error: { code: "no_files", message: "No Ed files could be downloaded.", retryable: false } } satisfies ApiError);
    const archiveName = `${safeDownloadName(request.body?.lessonTitle || "ed-lesson") || "ed-lesson"}.zip`;
    reply.header("content-type", "application/zip");
    reply.header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
    return reply.send(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  });

  app.get<{ Querystring: { courseId?: string } }>("/api/moodle/content", async (request, reply) => {
    const courseId = request.query.courseId;
    if (!courseId) {
      return reply.code(400).send({ error: { code: "invalid_course", message: "courseId is required.", retryable: false } } satisfies ApiError);
    }
    return { courseId, items: db.listMoodleContent(courseId) };
  });

  /** Grades and assignment materials share one account/range snapshot and refresh. */
  async function readMoodleGrades(raw: string, force = false): Promise<{ data: MoodleGradeCourse[]; cache: CacheMetadata }> {
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    const identity = moodleCredentialIdentity(raw);
    const preferences = getMoodleCoursePreferences(db, identity);
    // A range change selects a different snapshot without discarding the course
    // directory or allowing a refresh for the previous range to overwrite it.
    const range = createHash("sha256").update(JSON.stringify(preferences)).digest("hex").slice(0, 16);
    return resourceCache.read({ source: "moodle", identity, resource: `grades:v7:${range}`, ttlMs: RESOURCE_TTL.grades,
      currentIdentity: () => credentialIdentity("moodle"), force }, async (previous: Awaited<ReturnType<MoodleGradesClient["pull"]>> | undefined, snapshot) => {
      const pulled = await new MoodleGradesClient(credentials.baseUrl, moodleCookieHeader(credentials), moodleTransport.forCredentials(raw)).pullDetailed(preferences);
      const failed = new Set(pulled.failedCourseIds);
      const at = new Date().toISOString();
      const coverage = Object.fromEntries([
        ...Object.entries(snapshot?.coverage ?? {}).filter(([id]) => failed.has(id)),
        ...pulled.courses.map((course) => [course.courseId, at]),
      ]);
      return {
        data: [...pulled.courses.map((course) => mergeGradeCourse(course, previous?.find((old) => old.courseId === course.courseId), credentials.baseUrl, at)),
          ...(previous ?? []).filter((course) => failed.has(course.courseId))],
        error: failed.size ? `部分课程成绩刷新失败（${[...failed].map((id) => `课程 ${id}：${pulled.failureReasons[id]}`).join("；")}）。` : null,
        coverage, failedIds: [...failed],
      };
    });
  }

  /**
   * Only Grades-confirmed assessment content and its Moodle changes.
   * Existing account-scoped grade snapshots remain usable when Moodle is offline.
   */
  app.get<{ Querystring: { courseId?: string } }>("/api/pack", async (request) => {
    const courseId = request.query.courseId?.trim() || null;
    /** Extract a display code while preserving courseId as the selection identity. */
    const courseCode = (course: string) => /^[A-Za-z]{2,5}\d{3,4}/.exec(course.trim())?.[0].toUpperCase() ?? course.trim();
    const assignments = db
      .listAllMoodleContent()
      .filter((row) => row.module === "assign" || row.module === "quiz")
      .filter((row) => !courseId || row.courseId === courseId);

    const raw = await secrets.get("moodle-credentials");
    let grades: MoodleGradeCourse[] = [];
    let baseUrl = "";
    let verificationWarning: string | null = null;
    if (assignments.length > 0) {
      if (!raw) verificationWarning = "尚未连接 Moodle，无法通过 Grades 确认评分作业。请先连接 Moodle。";
      else {
        try {
          baseUrl = moodleCredentials.parse(JSON.parse(raw)).baseUrl;
          const result = await readMoodleGrades(raw);
          grades = result.data;
          if (result.cache.error) verificationWarning = "Grades 更新失败，当前仅显示上次成绩册已确认的作业。请到「成绩」重新读取。";
          if (assignments.some((row) => !grades.some((course) => course.courseId === row.courseId))) {
            verificationWarning ??= "部分课程尚无可用的 Grades 成绩册或不在同步范围，暂不列出其作业。请到「成绩」读取，或在「每周资料」调整同步范围。";
          }
        } catch (error) {
          if (error instanceof CacheIdentityChangedError) throw error;
          verificationWarning = "暂时无法读取 Grades 确认评分作业，未确认的内容暂不列出。请到「成绩」检查连接并重新读取。";
        }
      }
    }
    const byCourse = new Map(grades.map((course) => [course.courseId, course.items]));
    const matched = assignments.flatMap((row) => {
      const peers = assignments.filter((candidate) => candidate.courseId === row.courseId)
        .map((candidate) => ({ name: candidate.title, url: candidate.url }));
      const gradeItem = matchGradebookItem({ name: row.title, url: row.url }, byCourse.get(row.courseId) ?? [], peers, baseUrl);
      return gradeItem ? [{ row, gradeItem }] : [];
    });

    // Due dates and completion live on the normalized brief item, not on the content row.
    const briefByUrl = new Map(
      db.listItems({ source: "moodle" }).filter((item) => item.url).map((item) => [item.url, item] as const),
    );
    const changesByItem = new Map<string, ItemChange[]>();
    for (const change of db.listChanges()) {
      if (change.source !== "moodle") continue;
      const list = changesByItem.get(change.itemId) ?? [];
      list.push(change);
      changesByItem.set(change.itemId, list);
    }

    return {
      rubric: null,
      verificationWarning,
      assignments: matched.map(({ row, gradeItem }) => {
        const brief = briefByUrl.get(row.url);
        return {
          id: row.id,
          gradeItemId: gradeItem.id,
          courseId: row.courseId,
          course: courseCode(row.courseName),
          courseName: row.courseName,
          sectionTitle: row.sectionTitle,
          title: row.title,
          url: row.url,
          text: row.text,
          updatedAt: row.updatedAt,
          dueAt: brief?.dueAt ?? null,
          completedAt: brief?.completedAt ?? null,
          changes: (brief ? (changesByItem.get(brief.id) ?? []) : []).map((change) => ({
            field: change.field,
            before: change.before === null ? null : String(change.before),
            after: change.after === null ? null : String(change.after),
            changedAt: change.changedAt,
          })),
        };
      }),
    };
  });

  app.get("/api/moodle/grades", async (request, reply) => {
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    try {
      const result = await readMoodleGrades(raw, forcedRefresh(request.url));
      reply.header("cache-control", "no-store");
      return { courses: result.data, cache: result.cache };
    } catch (error) {
      if (error instanceof CacheIdentityChangedError) throw error;
      if (error instanceof MoodleGradesError && error.code === "session_expired") {
        return reply.code(409).send({ error: { code: "not_connected", message: error.message, retryable: false } } satisfies ApiError);
      }
      const message = error instanceof Error ? error.message : "Moodle gradebook failed.";
      return reply.code(502).send({ error: { code: "moodle_grades_failed", message, retryable: true } } satisfies ApiError);
    }
  });

  app.get("/api/runtime/status", async () => {
    return getRuntimeStatus({
      dataDir: process.env.COVE_DATA_DIR ?? path.join(os.homedir(), "Library", "Application Support", "Cove"),
      oauthConfigured: Boolean(options.google),
    });
  });

  app.get("/api/setup/status", async () => {
    const rawEd = await secrets.get("ed-credentials");
    const rawMoodle = await secrets.get("moodle-credentials");
    let moodle = false;
    if (rawMoodle) {
      try {
        const state = await verifyMoodleSession({ db, secrets, fetcherForCredentials: (raw) => moodleTransport.forCredentials(raw) });
        moodle = state === "valid" || state === "unreachable" && db.listSources().some((source) => source.id === "moodle" && source.status === "connected");
      } catch {
        moodle = false;
      }
    }
    const gmail = await google.connected();
    const fullSyncCompleted = Boolean(db.getSetting("full_sync_completed_at"));
    return {
      gmailConnected: gmail,
      edConnected: Boolean(rawEd),
      moodleConnected: moodle,
      fullSyncCompleted,
      setupRequired: !(gmail || rawEd || moodle) || !fullSyncCompleted,
    };
  });

  app.post("/api/setup/moodle/start", async () => {
    return { assistant: await moodleAssistant.start() };
  });

  app.get("/api/setup/moodle/status", async () => ({ assistant: moodleAssistant.get() }));

  app.post("/api/setup/moodle/cancel", async () => ({ assistant: await moodleAssistant.cancel() }));

  app.post("/api/setup/ontrack/start", async () => ({ assistant: await onTrackAssistant.start() }));

  app.get("/api/setup/ontrack/status", async () => ({ assistant: onTrackAssistant.get() }));

  app.post("/api/setup/ontrack/cancel", async () => ({ assistant: await onTrackAssistant.cancel() }));

  app.get("/api/sync/status", async () => ({
    fullSyncCompleted: Boolean(db.getSetting("full_sync_completed_at")),
    job: fullSyncJobs.get(),
  }));

  app.post("/api/sync/full", async (_request, reply) => {
    const job = fullSyncJobs.begin();
    if (!job) return reply.code(409).send({ error: { code: "sync_running", message: "A full sync is already running.", retryable: false } } satisfies ApiError);

    void (async () => {
      const errors: string[] = [];
      const run = async (source: SyncSource, configured: () => Promise<boolean>, work: () => Promise<void>) => {
        const previousSyncAt = db.listSources().find((entry) => entry.id === source)?.lastSyncAt ?? null;
        try {
          if (!await configured()) {
            fullSyncJobs.update(source, { status: "skipped", message: "未配置此来源，已跳过。" });
            return;
          }
          fullSyncJobs.update(source, { status: "running" });
          await work();
          fullSyncJobs.update(source, { status: "done" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "同步失败";
          errors.push(`${source}: ${message}`);
          fullSyncJobs.update(source, { status: "error", message });
          db.setSourceStatus(source, "error", previousSyncAt, message);
        }
      };
      await run("gmail", () => google.connected(), async () => {
        await syncGmail(db, await google.client(), {
          full: true,
          onProgress: (processed, total) => fullSyncJobs.update("gmail", { processed, total }),
        });
      });

      await run("ed", async () => Boolean(await secrets.get("ed-credentials")), async () => {
        const raw = await secrets.get("ed-credentials");
        if (!raw) throw new Error("Ed token is not configured.");
        const credentials = edCredentials.parse(JSON.parse(raw));
        await syncEd(db, credentials.token, credentials.region, fetcher, {
          full: true,
          onProgress: (processed, total) => fullSyncJobs.update("ed", { processed, total }),
        });
      });

      await run("moodle", async () => Boolean(await secrets.get("moodle-credentials")), async () => {
        const raw = await secrets.get("moodle-credentials");
        if (!raw) throw new Error("Moodle session is not configured.");
        const credentials = moodleCredentials.parse(JSON.parse(raw));
        const assessments = await syncMoodle(db, credentials.baseUrl, moodleCookieHeader(credentials), moodleTransport.forCredentials(raw));
        const forum = await syncMoodleForum(db, credentials.baseUrl, moodleCookieHeader(credentials), moodleTransport.forCredentials(raw));
        const content = await syncAllMoodleContent(db, credentials.baseUrl, moodleCookieHeader(credentials), moodleTransport.forCredentials(raw), (processed, total) => {
          fullSyncJobs.update("moodle", { processed, total });
        }, getMoodleCoursePreferences(db, moodleCredentialIdentity(raw)));
        fullSyncJobs.update("moodle", { status: "done", processed: content.courses, total: content.courses, message: `${assessments.synced + forum.synced} 条简报，${content.items} 条资料` });
        db.setSetting("moodle_full_synced_at", new Date().toISOString());
      });

      await run("ontrack", async () => Boolean(await onTrackCacheIdentity()), async () => {
        const account = await fetchOnTrackAccount();
        const result = await syncOnTrack(db, account, {
          full: true,
          onProgress: (processed, total) => fullSyncJobs.update("ontrack", { processed, total }),
        });
        resourceCache.invalidate("ontrack");
        fullSyncJobs.update("ontrack", { message: `${result.tasks} 条任务，${result.feedback} 条历史反馈（当前可访问项目）` });
      });

      if (errors.length === 0) {
        fullSyncJobs.complete();
        if (fullSyncJobs.get()?.status === "done") db.setSetting("full_sync_completed_at", new Date().toISOString());
      } else {
        fullSyncJobs.fail(errors.join(" | "));
      }
    })();

    return reply.code(202).send({ job });
  });

  app.post<{ Body: { source?: string } }>("/api/sync", async (request, reply) => {
    const source = request.body?.source ?? "gmail";
    if (!sourceSchema.safeParse(source).success) {
      return reply.code(400).send({ error: { code: "invalid_source", message: "Unknown source", retryable: false } } satisfies ApiError);
    }
    const previousSyncAt = db.listSources().find((entry) => entry.id === source)?.lastSyncAt ?? null;
    try {
      const result = await orchestrator.sync(source as Source);
      return { ok: true, source, ...result };
    } catch (error) {
      const isOauth = error instanceof OAuthError;
      const status = isOauth ? (error.code === "not_connected" ? 409 : 502) : 502;
      const message = error instanceof Error ? error.message : "Source sync failed.";
      db.setSourceStatus(source as Source, status === 409 ? "disconnected" : "error", previousSyncAt, message);
      return reply.code(status).send({
        error: { code: isOauth ? error.code : "sync_failed", message, retryable: status >= 500 },
      } satisfies ApiError);
    }
  });

  app.delete("/api/data", async () => {
    // 只清内容，不动凭据：设置页承诺「来源连接保留」，断开连接是另一个动作。
    resourceCache.invalidate();
    db.clearAll({ keepConnections: true });
    return { ok: true };
  });

  if (options.staticDir) {
    app.register(staticPlugin, {
      root: options.staticDir,
      prefix: "/",
      setHeaders: (reply) => {
        reply.header(
          "content-security-policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self';",
        );
        reply.header("x-content-type-options", "nosniff");
        reply.header("referrer-policy", "no-referrer");
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api") || request.url.startsWith("/oauth")) {
        return reply.code(404).send({ error: { code: "not_found", message: "Not found", retryable: false } } satisfies ApiError);
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
