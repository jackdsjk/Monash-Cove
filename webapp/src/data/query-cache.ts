export interface CacheMetadata {
  fetchedAt: string | null;
  checkedAt: string | null;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  identity: string;
  failedIds?: string[];
}

export interface QueryResult<T> {
  data: T;
  cache?: CacheMetadata;
}

export interface QuerySnapshot<T> {
  data: T | undefined;
  cache?: CacheMetadata;
  loading: boolean;
  error: string | null;
}

const queries = new Set<{ source: string; clear(): void }>();

/** Shared across routes; successful empty results are cached too. Credentials stay in the service. */
export class ResourceQuery<T> {
  private snapshot: QuerySnapshot<T> = { data: undefined, loading: false, error: null };
  private listeners = new Set<() => void>();
  private inflight: Promise<void> | null = null;
  private generation = 0;
  private receivedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private polls = 0;

  constructor(
    readonly source: string,
    private readonly loader: (force: boolean) => Promise<QueryResult<T>>,
    private readonly freshForMs: number,
  ) {
    queries.add(this);
  }

  getSnapshot = (): QuerySnapshot<T> => this.snapshot;

  getGeneration(): number { return this.generation; }

  /** Install a server-confirmed mutation result and ignore any older read in flight. */
  replace(data: T): void {
    this.generation++;
    this.inflight = null;
    this.receivedAt = Date.now();
    this.polls = 0;
    clearTimeout(this.timer);
    this.publish({ data, loading: false, error: null });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) clearTimeout(this.timer);
    };
  };

  private publish(snapshot: QuerySnapshot<T>): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    this.generation++;
    this.inflight = null;
    this.receivedAt = 0;
    this.polls = 0;
    clearTimeout(this.timer);
    this.publish({ data: undefined, loading: false, error: null });
  }

  load(force = false, poll = false): Promise<void> {
    if (this.inflight) return this.inflight;
    if (!force && !poll && this.snapshot.data !== undefined && !this.snapshot.cache?.stale && Date.now() - this.receivedAt < this.freshForMs) {
      return Promise.resolve();
    }
    clearTimeout(this.timer);
    if (!poll) this.polls = 0;
    const generation = this.generation;
    this.publish({ ...this.snapshot, loading: true, error: null });
    const task = Promise.resolve().then(() => this.loader(force)).then((result) => {
      if (generation !== this.generation) return;
      this.receivedAt = Date.now();
      const waitingTooLong = result.cache?.refreshing && this.polls >= 30;
      this.publish({ data: result.data, cache: result.cache, loading: false,
        error: result.cache?.error ?? (waitingTooLong ? '后台更新耗时较长，可以点击刷新重新查看。' : null) });
      // A stale local snapshot can be returned while the service refreshes it. Poll only
      // the read endpoint, never force another scrape, and stop after a bounded wait.
      if (result.cache?.refreshing && this.polls < 30) {
        this.polls++;
        this.timer = setTimeout(() => { void this.load(false, true).catch(() => undefined); }, Math.min(1000 + this.polls * 100, 4000));
      }
    }).catch((cause: unknown) => {
      if (generation !== this.generation) return;
      this.publish({ ...this.snapshot,
        cache: this.snapshot.cache ? { ...this.snapshot.cache, refreshing: false, stale: true } : undefined,
        loading: false, error: cause instanceof Error ? cause.message : '无法读取本地数据' });
      throw cause;
    }).finally(() => {
      if (generation === this.generation) this.inflight = null;
    });
    this.inflight = task;
    return task;
  }
}

export function invalidateSourceQueries(source: string): void {
  queries.forEach((query) => { if (query.source === source) query.clear(); });
}

export function invalidateQueryCache(): void {
  queries.forEach((query) => query.clear());
}
