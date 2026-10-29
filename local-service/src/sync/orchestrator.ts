import type { CoveDatabase } from "../db.js";
import type { Source } from "../domain.js";
import type { GoogleOAuth } from "../oauth/google.js";
import type { SecretStore } from "../secrets.js";
import { syncGmail } from "./gmail.js";
import { syncEd, syncMoodle, syncMoodleForum } from "./sources.js";

export class SyncOrchestrator {
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
