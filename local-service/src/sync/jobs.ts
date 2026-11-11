export type SyncSource = "gmail" | "ed" | "moodle" | "ontrack";

export interface SourceProgress {
  status: "pending" | "running" | "done" | "error" | "skipped";
  processed: number;
  total: number | null;
  message?: string;
}

export interface FullSyncJob {
  id: string;
  status: "running" | "done" | "error" | "skipped";
  startedAt: string;
  finishedAt?: string;
  message?: string;
  sources: Record<SyncSource, SourceProgress>;
}

export class FullSyncJobs {
  private current: FullSyncJob | null = null;

  begin(): FullSyncJob | null {
    if (this.current?.status === "running") return null;
    this.current = {
      id: crypto.randomUUID(),
      status: "running",
      startedAt: new Date().toISOString(),
      sources: {
        gmail: { status: "pending", processed: 0, total: null },
        ed: { status: "pending", processed: 0, total: null },
        moodle: { status: "pending", processed: 0, total: null },
        ontrack: { status: "pending", processed: 0, total: null },
      },
    };
    return this.current;
  }

  get() {
    return this.current;
  }

  update(source: SyncSource, patch: Partial<SourceProgress>) {
    if (!this.current) return;
    this.current.sources[source] = { ...this.current.sources[source], ...patch };
  }

  complete() {
    if (!this.current) return;
    const anyDone = Object.values(this.current.sources).some((source) => source.status === "done");
    this.current.status = anyDone ? "done" : "skipped";
    if (!anyDone) this.current.message = "尚未配置支持全量同步的来源。";
    this.current.finishedAt = new Date().toISOString();
  }

  fail(message?: string) {
    if (!this.current) return;
    this.current.status = "error";
    this.current.finishedAt = new Date().toISOString();
    if (message) this.current.message = message;
  }
}
