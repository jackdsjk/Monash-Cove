import type { CoveDatabase } from "../db.js";
import type { Source } from "../domain.js";
import type { GoogleOAuth } from "../oauth/google.js";
import type { SecretStore } from "../secrets.js";
import { syncGmail } from "./gmail.js";
import { syncEd, syncMoodle, syncMoodleForum } from "./sources.js";
import { syncAllMoodleContent } from "./moodle-content.js";

export class SyncOrchestrator {
  private progress?: (source: "gmail" | "ed" | "moodle", processed: number, total: number | null) => void;

  constructor(
    private readonly db: CoveDatabase,
    private readonly secrets: SecretStore,
    private readonly google: GoogleOAuth,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sync(source: Source) {
    if (source === "gmail") {
      return syncGmail(this.db, await this.google.client());
    }
    if (source === "ed") {
      const raw = await this.secrets.get("ed-credentials");
      if (!raw) throw new Error("Ed token is not configured.");
      const credentials = JSON.parse(raw) as { token: string; region: "us" | "au" | "eu" };
      return syncEd(this.db, credentials.token, credentials.region, this.fetcher);
    }
    const raw = await this.secrets.get("moodle-credentials");
    if (!raw) throw new Error("Moodle session is not configured.");
    const credentials = JSON.parse(raw) as { baseUrl: string; session: string };
    const assessments = await syncMoodle(this.db, credentials.baseUrl, credentials.session, this.fetcher);
    const posts = await syncMoodleForum(this.db, credentials.baseUrl, credentials.session, this.fetcher);
    return { synced: assessments.synced + posts.synced };
  }

  async full() {
    const starts: string[] = [];
    const gmail = await syncGmail(this.db, await this.google.client(), {
      full: true,
      onProgress: (processed, total) => this.progress?.("gmail", processed, total),
    });
    starts.push(`gmail:${gmail.synced}`);
    const edRaw = await this.secrets.get("ed-credentials");
    if (!edRaw) throw new Error("Ed token is not configured.");
    const edCreds = JSON.parse(edRaw) as { token: string; region: "us" | "au" | "eu" };
    const ed = await syncEd(this.db, edCreds.token, edCreds.region, this.fetcher, {
      full: true,
      onProgress: (processed, total) => this.progress?.("ed", processed, total),
    });
    starts.push(`ed:${ed.synced}`);
    const moodleRaw = await this.secrets.get("moodle-credentials");
    if (!moodleRaw) throw new Error("Moodle session is not configured.");
    const moodleCreds = JSON.parse(moodleRaw) as { baseUrl: string; session: string };
    const assessments = await syncMoodle(this.db, moodleCreds.baseUrl, moodleCreds.session, this.fetcher);
    const forum = await syncMoodleForum(this.db, moodleCreds.baseUrl, moodleCreds.session, this.fetcher);
    const content = await syncAllMoodleContent(this.db, moodleCreds.baseUrl, moodleCreds.session, this.fetcher, (processed, total) => this.progress?.("moodle", processed, total));
    starts.push(`moodle:${assessments.synced + forum.synced + content.items}`);
    this.db.setSetting("moodle_full_synced_at", new Date().toISOString());
    this.db.setSetting("full_sync_completed_at", new Date().toISOString());
    return { ok: true, sources: starts };
  }

  onProgress(handler: (source: "gmail" | "ed" | "moodle", processed: number, total: number | null) => void) {
    this.progress = handler;
    return this;
  }

  async syncAll() {
    const sources: Source[] = ["gmail", "ed", "moodle"];
    const results: Array<{ source: Source; ok: boolean; message?: string }> = [];
    for (const source of sources) {
      try {
        await this.sync(source);
        results.push({ source, ok: true });
      } catch (error) {
        results.push({ source, ok: false, message: error instanceof Error ? error.message : "sync failed" });
      }
    }
    return results;
  }
}
