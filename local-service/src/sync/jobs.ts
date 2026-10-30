export type SyncSource = "gmail" | "ed" | "moodle";

export interface SourceProgress {
  status: "pending" | "running" | "done" | "error";
  processed: number;
  total: number | null;
  message?: string;
}

export interface FullSyncJob {
  id: string;
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
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
    this.current.status = "done";
    this.current.finishedAt = new Date().toISOString();
  }

  fail(message?: string) {
    if (!this.current) return;
    this.current.status = "error";
    this.current.finishedAt = new Date().toISOString();
    if (message) this.current.sources.gmail.message ??= message;
  }
}
