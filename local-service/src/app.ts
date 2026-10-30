import JSZip from "jszip";
import Fastify, { type FastifyInstance } from "fastify";
import staticPlugin from "@fastify/static";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { createDatabase, type CoveDatabase } from "./db.js";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCoveMcpServer } from "./mcp.js";
import { GoogleOAuth, OAuthError, type GoogleOAuthConfig } from "./oauth/google.js";
import { defaultSecretStore, type SecretStore } from "./secrets.js";
import { SyncOrchestrator } from "./sync/orchestrator.js";
import { syncGmail } from "./sync/gmail.js";
import { syncEd, syncMoodle, syncMoodleForum } from "./sync/sources.js";
import { syncAllMoodleContent } from "./sync/moodle-content.js";
import { FullSyncJobs } from "./sync/jobs.js";
import { MoodleClient } from "./sources/moodle.js";
import { syncMoodleContent } from "./sync/moodle-content.js";
import { downloadMoodleResource, MoodleDownloadError, safeDownloadName } from "./moodle-download.js";
import type { ApiError, Source } from "./domain.js";
import { getRuntimeStatus } from "./runtime.js";
import { MoodleLoginAssistant } from "./setup/moodle-assistant.js";
import { AttendanceLoginAssistant } from "./attendance/assistant.js";
import { discoverAttendanceSessions, fillAttendance, validateAttendance, type AttendanceCredentials } from "./attendance/client.js";
import { parseAttendanceRows } from "./attendance/parser.js";
import { scanMoodleAttendanceImages } from "./attendance/moodle-ocr.js";
import { parseAttendanceSessionPreference, detectedToPreferences, matchesPreferredSession, type AttendancePreferences } from "./attendance/preferences.js";

const sourceSchema = z.enum(["gmail", "ed", "moodle"]);

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
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin) && ["POST", "PATCH", "DELETE"].includes(request.method)) {
      return reply.code(403).send({ error: { code: "forbidden_origin", message: "Origin is not allowed.", retryable: false } } satisfies ApiError);
    }
  });
  const secrets = options.secretStore ?? defaultSecretStore();
  const google = new GoogleOAuth(options.google ?? null, secrets, options.fetcher ?? fetch);
  const orchestrator = new SyncOrchestrator(db, secrets, google, options.fetcher ?? fetch);
  const fullSyncJobs = new FullSyncJobs();
  const moodleAssistant = new MoodleLoginAssistant(secrets, db);
  const attendanceAssistant = new AttendanceLoginAssistant(secrets);
  let attendanceOcrCache: { at: number; codes: ReturnType<typeof parseAttendanceRows> } | null = null;
  const mcpSessions = new Map<string, StreamableHTTPServerTransport>();
  if (options.autoSync) {
    const timer = setInterval(() => void orchestrator.syncAll(), 60 * 60 * 1000);
    timer.unref();
    app.addHook("onReady", async () => {
      void orchestrator.syncAll();
    });
    app.addHook("onClose", async () => clearInterval(timer));
  }

  app.decorate("coveDb", db);
  app.addHook("onClose", async () => db.close());

  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    const body: ApiError = {
      error: {
        code: status === 400 ? "invalid_request" : "internal_error",
        message: err.message,
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

  app.get<{ Querystring: { refresh?: string } }>("/api/attendance/codes", async (request) => {
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
    const textCodes = parseAttendanceRows(rows);
    if (request.query.refresh === "1") {
      const raw = await secrets.get("moodle-credentials");
      if (raw) {
        try {
          const credentials = moodleCredentials.parse(JSON.parse(raw));
          attendanceOcrCache = { at: Date.now(), codes: await scanMoodleAttendanceImages(credentials, moodleRows) };
        } catch {
          attendanceOcrCache = { at: Date.now(), codes: [] };
        }
      }
    }
    const allCodes = [...textCodes, ...(attendanceOcrCache?.codes ?? [])];
    const rawPreferences = db.getSetting("attendance_preferences");
    let preferences = { courses: [] as Array<{ course: string; sessions: string[] }> };
    try {
      preferences = rawPreferences ? parseAttendanceSessionPreference(JSON.parse(rawPreferences)) : preferences;
    } catch {
      preferences = { courses: [] };
    }
    return { codes: allCodes.filter((code) => matchesPreferredSession(preferences, code.course, code.session)) };
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
      return result;
    } catch (error) {
      return reply.code(502).send({ error: { code: "attendance_fill_failed", message: error instanceof Error ? error.message : "Attendance fill failed.", retryable: true } } satisfies ApiError);
    }
  });

  app.get<{ Querystring: { since?: string; source?: string; q?: string } }>("/api/brief", async (request, reply) => {
    const { since, source, q } = request.query;
    if (source && !sourceSchema.safeParse(source).success) {
      return reply.code(400).send({ error: { code: "invalid_source", message: "Unknown source", retryable: false } } satisfies ApiError);
    }
    return db.brief({ since, source: source as Source | undefined, query: q });
  });

  app.get<{ Params: { id: string } }>("/api/items/:id", async (request, reply) => {
    const item = db.getItem(request.params.id);
    if (!item) {
      return reply.code(404).send({ error: { code: "not_found", message: "Item not found", retryable: false } } satisfies ApiError);
    }
    return item;
  });

  app.post("/api/check", async (request, reply) => {
    const parsed = checkSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: parsed.error.message, retryable: false } } satisfies ApiError);
    }
    db.markChecked(parsed.data.ids);
    return { ok: true, lastCheckedAt: db.getSetting("last_checked_at") };
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
    return { ok: true };
  });

  const edCredentials = z.object({ token: z.string().min(1), region: z.enum(["us", "au", "eu"]).default("us") });
  const moodleCredentials = z.object({ baseUrl: z.string().url(), session: z.string().min(1) });

  app.post<{ Params: { source: string } }>("/api/sources/:source/credentials", async (request, reply) => {
    const source = sourceSchema.safeParse(request.params.source);
    if (!source.success) {
      return reply.code(400).send({ error: { code: "invalid_source", message: "Unknown source", retryable: false } } satisfies ApiError);
    }
    if (source.data === "gmail") {
      return reply.code(400).send({ error: { code: "use_oauth", message: "Use the Gmail OAuth flow.", retryable: false } } satisfies ApiError);
    }
    if (source.data === "ed") {
      const parsed = edCredentials.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_request", message: parsed.error.message, retryable: false } } satisfies ApiError);
      await secrets.set("ed-credentials", JSON.stringify(parsed.data));
    } else {
      const parsed = moodleCredentials.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_request", message: parsed.error.message, retryable: false } } satisfies ApiError);
      await secrets.set("moodle-credentials", JSON.stringify(parsed.data));
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
    db.setSourceStatus(source.data, "disconnected", null, null);
    return { ok: true };
  });

  app.get("/api/moodle/courses", async (_request, reply) => {
    const raw = await secrets.get("moodle-credentials");
    if (!raw) return reply.code(409).send({ error: { code: "not_connected", message: "Moodle session is not configured.", retryable: false } } satisfies ApiError);
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    try {
      const client = new MoodleClient(credentials.baseUrl, credentials.session, options.fetcher ?? fetch);
      return { courses: await client.listCourses() };
    } catch (error) {
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
      const result = await syncMoodleContent(db, credentials.baseUrl, credentials.session, courseId, options.fetcher);
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
      const file = await downloadMoodleResource(credentials, targetValue, request.query.name, options.fetcher ?? fetch);
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
        const file = await downloadMoodleResource(credentials, item.url, item.name, options.fetcher ?? fetch);
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

  app.get<{ Querystring: { courseId?: string } }>("/api/moodle/content", async (request, reply) => {
    const courseId = request.query.courseId;
    if (!courseId) {
      return reply.code(400).send({ error: { code: "invalid_course", message: "courseId is required.", retryable: false } } satisfies ApiError);
    }
    return { courseId, items: db.listMoodleContent(courseId) };
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
        const credentials = moodleCredentials.parse(JSON.parse(rawMoodle));
        moodle = await new MoodleClient(credentials.baseUrl, credentials.session, options.fetcher ?? fetch).validateSession();
        if (!moodle) db.setSourceStatus("moodle", "degraded", null, "Moodle session expired; reconnect");
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
      setupRequired: !gmail || !rawEd || !moodle || !fullSyncCompleted,
    };
  });

  app.post("/api/setup/moodle/start", async () => {
    return { assistant: await moodleAssistant.start() };
  });

  app.get("/api/setup/moodle/status", async () => ({ assistant: moodleAssistant.get() }));

  app.post("/api/setup/moodle/cancel", async () => ({ assistant: await moodleAssistant.cancel() }));

  app.get("/api/sync/status", async () => ({
    fullSyncCompleted: Boolean(db.getSetting("full_sync_completed_at")),
    job: fullSyncJobs.get(),
  }));

  app.post("/api/sync/full", async (_request, reply) => {
    const job = fullSyncJobs.begin();
    if (!job) return reply.code(409).send({ error: { code: "sync_running", message: "A full sync is already running.", retryable: false } } satisfies ApiError);

    void (async () => {
      const errors: string[] = [];
      fullSyncJobs.update("gmail", { status: "running" });
      try {
        await syncGmail(db, await google.client(), {
          full: true,
          onProgress: (processed, total) => fullSyncJobs.update("gmail", { processed, total }),
        });
        fullSyncJobs.update("gmail", { status: "done" });
      } catch (error) {
        errors.push(`Gmail: ${error instanceof Error ? error.message : "failed"}`);
        fullSyncJobs.update("gmail", { status: "error", message: errors.at(-1) });
      }

      fullSyncJobs.update("ed", { status: "running" });
      try {
        const raw = await secrets.get("ed-credentials");
        if (!raw) throw new Error("Ed token is not configured.");
        const credentials = edCredentials.parse(JSON.parse(raw));
        await syncEd(db, credentials.token, credentials.region, options.fetcher, {
          full: true,
          onProgress: (processed, total) => fullSyncJobs.update("ed", { processed, total }),
        });
        fullSyncJobs.update("ed", { status: "done" });
      } catch (error) {
        errors.push(`Ed: ${error instanceof Error ? error.message : "failed"}`);
        fullSyncJobs.update("ed", { status: "error", message: errors.at(-1) });
      }

      fullSyncJobs.update("moodle", { status: "running" });
      try {
        const raw = await secrets.get("moodle-credentials");
        if (!raw) throw new Error("Moodle session is not configured.");
        const credentials = moodleCredentials.parse(JSON.parse(raw));
        const assessments = await syncMoodle(db, credentials.baseUrl, credentials.session, options.fetcher);
        const forum = await syncMoodleForum(db, credentials.baseUrl, credentials.session, options.fetcher);
        const content = await syncAllMoodleContent(db, credentials.baseUrl, credentials.session, options.fetcher, (processed, total) => {
          fullSyncJobs.update("moodle", { processed, total });
        });
        fullSyncJobs.update("moodle", { status: "done", processed: content.courses, total: content.courses, message: `${assessments.synced + forum.synced} 条简报，${content.items} 条资料` });
        db.setSetting("moodle_full_synced_at", new Date().toISOString());
      } catch (error) {
        errors.push(`Moodle: ${error instanceof Error ? error.message : "failed"}`);
        fullSyncJobs.update("moodle", { status: "error", message: errors.at(-1) });
      }

      if (errors.length === 0) {
        db.setSetting("full_sync_completed_at", new Date().toISOString());
        fullSyncJobs.complete();
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
    try {
      const result = await orchestrator.sync(source as Source);
      return { ok: true, source, ...result };
    } catch (error) {
      const isOauth = error instanceof OAuthError;
      const status = isOauth ? (error.code === "not_connected" ? 409 : 502) : 502;
      const message = error instanceof Error ? error.message : "Source sync failed.";
      db.setSourceStatus(source as Source, status === 409 ? "disconnected" : "error", null, message);
      return reply.code(status).send({
        error: { code: isOauth ? error.code : "sync_failed", message, retryable: status >= 500 },
      } satisfies ApiError);
    }
  });

  app.delete("/api/data", async () => {
    await google.disconnect();
    await secrets.delete("ed-credentials");
    await secrets.delete("moodle-credentials");
    db.clearAll();
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
