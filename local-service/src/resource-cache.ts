/** Account-scoped snapshots with stale reads and a shared refresh per resource.
 * Adapted to SQLite from Muster's persist/backgroundSync/PageFetcher design;
 * no reference implementation code is copied here.
 */
export interface ResourceSnapshot<T> {
  data: T;
  fetchedAt: string;
  checkedAt: string;
  error: string | null;
  failedAt: number | null;
  coverage?: Record<string, string>;
  failedIds?: string[];
}

export interface SnapshotStore {
  getResourceSnapshot<T>(source: string, identity: string, resource: string): ResourceSnapshot<T> | null;
  saveResourceSnapshot<T>(source: string, identity: string, resource: string, snapshot: ResourceSnapshot<T>): void;
  deleteResourceSnapshots(source?: string): void;
}

export interface CacheMetadata {
  identity: string;
  fetchedAt: string | null;
  checkedAt: string | null;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  coverage?: Record<string, string>;
  failedIds?: string[];
}

export interface CacheScope {
  source: string;
  identity: string;
  resource: string;
  ttlMs: number;
  currentIdentity: () => Promise<string | null>;
  force?: boolean;
}

export interface RefreshResult<T> {
  data: T;
  /** A partial successful refresh can preserve old fragments and report failures. */
  error?: string | null;
  coverage?: Record<string, string>;
  failedIds?: string[];
}

export const RESOURCE_TTL = {
  courses: 6 * 60 * 60_000,
  grades: 5 * 60_000,
  ed: 15 * 60_000,
  ontrack: 2 * 60_000,
} as const;
export const CACHE_RETRY_MS = 30_000;

export class CacheIdentityChangedError extends Error {
  readonly statusCode = 409;
  constructor() {
    super("连接已变更，请重新读取数据。");
    this.name = "CacheIdentityChangedError";
  }
}

export class ResourceCache {
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly epochs = new Map<string, number>();
  private closed = false;

  constructor(private readonly store: SnapshotStore, private readonly now: () => number = Date.now) {}

  invalidate(source?: string): void {
    if (this.closed) return;
    if (source) this.epochs.set(source, this.epoch(source) + 1);
    else for (const name of new Set([...this.epochs.keys(), "moodle", "ed", "ontrack"])) {
      this.epochs.set(name, this.epoch(name) + 1);
    }
    this.store.deleteResourceSnapshots(source);
  }

  close(): void {
    this.closed = true;
  }

  private epoch(source: string): number {
    return this.epochs.get(source) ?? 0;
  }

  async read<T>(scope: CacheScope, load: (previous: T | undefined, snapshot: ResourceSnapshot<T> | null) => Promise<RefreshResult<T>>): Promise<{ data: T; cache: CacheMetadata }> {
    const epoch = this.epoch(scope.source);
    const key = JSON.stringify([scope.source, scope.identity, scope.resource, epoch]);
    const ensureCurrent = async (): Promise<void> => {
      if (this.closed || epoch !== this.epoch(scope.source) || await scope.currentIdentity() !== scope.identity) {
        throw new CacheIdentityChangedError();
      }
      // A disconnect can run while currentIdentity is awaiting its secret store.
      if (this.closed || epoch !== this.epoch(scope.source)) throw new CacheIdentityChangedError();
    };
    await ensureCurrent();
    let snapshot = this.store.getResourceSnapshot<T>(scope.source, scope.identity, scope.resource);
    const isStale = (value: ResourceSnapshot<T>): boolean =>
      value.error !== null || this.now() - Date.parse(value.checkedAt) >= scope.ttlMs;

    const refresh = (): Promise<void> => {
      const active = this.inflight.get(key);
      if (active) return active;
      const previous = snapshot;
      const task = (async () => {
        try {
          const result = await load(previous?.data, previous);
          await ensureCurrent();
          const at = new Date(this.now()).toISOString();
          this.store.saveResourceSnapshot(scope.source, scope.identity, scope.resource, {
            data: result.data, fetchedAt: at, checkedAt: at,
            error: result.error ?? null, failedAt: result.error ? this.now() : null,
            coverage: result.coverage, failedIds: result.failedIds,
          });
        } catch (error) {
          await ensureCurrent();
          if (previous) this.store.saveResourceSnapshot(scope.source, scope.identity, scope.resource, {
            ...previous,
            error: error instanceof Error ? error.message.slice(0, 300) : "刷新失败，请重试。",
            failedAt: this.now(),
          });
          throw error;
        }
      })();
      this.inflight.set(key, task);
      // Attach both handlers: background failures must never be unhandled rejections.
      void task.then(() => this.inflight.delete(key), () => this.inflight.delete(key));
      return task;
    };

    if (!snapshot || scope.force) {
      try {
        await refresh();
      } catch (error) {
        if (!snapshot || error instanceof CacheIdentityChangedError) throw error;
      }
      await ensureCurrent();
      snapshot = this.store.getResourceSnapshot<T>(scope.source, scope.identity, scope.resource);
    } else if (isStale(snapshot) && (snapshot.failedAt === null || this.now() - snapshot.failedAt >= CACHE_RETRY_MS)) {
      void refresh().catch(() => undefined);
    }
    await ensureCurrent();
    // A fast refresh may have finished while identity lookup was awaiting the
    // credential store. Return that published snapshot instead of stale data
    // incorrectly labelled as no longer refreshing.
    snapshot = this.store.getResourceSnapshot<T>(scope.source, scope.identity, scope.resource) ?? snapshot;
    if (!snapshot) throw new CacheIdentityChangedError();
    return {
      data: snapshot.data,
      cache: {
        identity: scope.identity, fetchedAt: snapshot.fetchedAt, checkedAt: snapshot.checkedAt,
        refreshing: this.inflight.has(key), stale: isStale(snapshot), error: snapshot.error,
        coverage: snapshot.coverage, failedIds: snapshot.failedIds,
      },
    };
  }
}
