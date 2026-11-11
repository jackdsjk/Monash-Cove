import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchBrief, fetchChanges, fetchSources, fetchSyncStatus, moodleGradesQuery, revalidateMoodleGrades, setItemCompleted, startFullSync, syncSource as requestSourceSync } from "./data/repository";
import { invalidateQueryCache, invalidateSourceQueries } from "./data/query-cache";
import { coursesOf, toChange, toItem, toSource } from "./data/adapter";
import type { Course, Item, ItemChange, SourceId, SourceState, UserMark } from "./data/model";
import { SOURCE_ORDER } from "./data/model";
import { TimezoneContext } from './lib/time';

const KEY = "cove_v3";

interface Settings {
  name: string;
  timezone: string;
  showLaunchSummary?: boolean;
}

export type AttendanceState = { code: string; status: "empty" | "filled" | "submitted" };

interface Persisted {
  setupDone: boolean;
  lastViewedAt: number;
  lastOpenedAt?: number;
  marks: Record<string, UserMark>;
  settings: Settings;
  attendance: Record<string, AttendanceState>;
}

function initial(): Persisted {
  return {
    setupDone: false,
    lastViewedAt: Date.now(),
    marks: {},
    settings: { name: "", timezone: "Asia/Kuala_Lumpur", showLaunchSummary: true },
    attendance: {},
  };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = { ...initial(), ...JSON.parse(raw) } as Persisted;
      // The old browser-only submitted flag was never a saved submission fact.
      saved.marks = Object.fromEntries(Object.entries(saved.marks).map(([id, mark]) => {
        const { submitted: _legacy, ...rest } = mark as UserMark & { submitted?: boolean };
        return [id, rest];
      }));
      return saved;
    }
  } catch {
    /* ignore */
  }
  return initial();
}

interface Store {
  now: number;
  ready: boolean;
  error: string | null;
  items: Item[];
  changes: ItemChange[];
  courses: Course[];
  marks: Record<string, UserMark>;
  sources: SourceState[];
  settings: Settings;
  attendance: Record<string, AttendanceState>;
  setupDone: boolean;
  lastViewedAt: number;
  openedSince: number;
  summaryOpen: boolean;
  setSummaryOpen: (v: boolean) => void;
  openItemId: string | null;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  openItem: (id: string | null) => void;
  setMark: (id: string, patch: Partial<UserMark>) => void;
  completionUpdates: Record<string, { pending: boolean; error: string | null }>;
  setCompleted: (id: string, completed: boolean | null) => Promise<void>;
  markWindowViewed: () => void;
  syncSource: (id: SourceId, full?: boolean) => void;
  syncAll: (full?: boolean) => void;
  connectSource: (id: SourceId) => void;
  disconnectSource: (id: SourceId) => void;
  completeSetup: () => void;
  restartSetup: () => void;
  clearAllData: () => void;
  clearMarks: () => void;
  updateSettings: (s: Partial<Settings>) => void;
  setAttendance: (id: string, s: AttendanceState) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [p, setP] = useState<Persisted>(load);
  const [items, setItems] = useState<Item[]>([]);
  const [changes, setChanges] = useState<ItemChange[]>([]);
  const [sources, setSources] = useState<SourceState[]>(() =>
    SOURCE_ORDER.map((id) => ({ id, connected: false, state: "disconnected" as const, itemCount: 0, account: "" })),
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openedSince, setOpenedSince] = useState(() => load().lastOpenedAt ?? Date.now());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [completionUpdates, setCompletionUpdates] = useState<Store["completionUpdates"]>({});
  const completionFlights = useRef(new Map<string, Promise<void>>());
  const completionRevision = useRef(0);
  const itemCompletionRevision = useRef(new Map<string, number>());
  const previousSources = useRef<SourceState[] | null>(null);
  const syncFailures = useRef(new Map<SourceId, string>());
  const syncFlights = useRef(new Map<SourceId, symbol>());
  const fullSyncFlight = useRef<Promise<void> | null>(null);
  const launchHandled = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, [p]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const revisionAtStart = completionRevision.current;
    try {
      const [brief, sourceList, changeList] = await Promise.all([
        fetchBrief(),
        fetchSources().catch(() => []),
        fetchChanges().catch(() => []),
      ]);
      const at = Date.now();
      const mapped = brief.items.map((item) => toItem(item, at));
      // A brief read started before a successful completion update must not undo it.
      setItems((current) => mapped.map((item) =>
        (itemCompletionRevision.current.get(item.id) ?? 0) > revisionAtStart
          ? current.find((existing) => existing.id === item.id) ?? item
          : item,
      ));
      setChanges(changeList.map(toChange));
      const nextSources: SourceState[] = sourceList.length > 0
          ? sourceList.map((s) => toSource(s, mapped.filter((i) => i.source === s.id).length))
          : SOURCE_ORDER.map((id) => ({
              id,
              connected: mapped.some((i) => i.source === id),
              state: mapped.some((i) => i.source === id) ? "idle" : "disconnected",
              itemCount: mapped.filter((i) => i.source === id).length,
              account: "",
            }));
      if (previousSources.current) {
        for (const next of nextSources) {
          const previous = previousSources.current.find((source) => source.id === next.id);
          if (previous && (previous.account !== next.account || previous.connected !== next.connected)) {
            invalidateSourceQueries(next.id);
            syncFailures.current.delete(next.id);
            syncFlights.current.delete(next.id);
          }
        }
      }
      previousSources.current = nextSources;
      setSources(nextSources.map((source) => {
        if (!source.connected) syncFailures.current.delete(source.id);
        const failure = syncFailures.current.get(source.id);
        if (failure) return { ...source, state: 'error', error: failure };
        if (syncFlights.current.has(source.id)) return { ...source, state: 'syncing' };
        return source;
      }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取本地数据");
    } finally {
      setReady(true);
    }
  }, []);

  const setCompleted = useCallback((id: string, completed: boolean | null): Promise<void> => {
    const pending = completionFlights.current.get(id);
    if (pending) return pending;
    setCompletionUpdates((current) => ({ ...current, [id]: { pending: true, error: null } }));
    const task = (async () => {
      try {
        const saved = toItem(await setItemCompleted(id, completed), Date.now());
        itemCompletionRevision.current.set(id, ++completionRevision.current);
        setItems((current) => current.map((item) => item.id === id ? saved : item));
      } catch (cause) {
        setCompletionUpdates((current) => ({ ...current, [id]: {
          pending: false, error: cause instanceof Error ? cause.message : "保存提交标记失败，请重试",
        } }));
      } finally {
        completionFlights.current.delete(id);
        setCompletionUpdates((current) => ({ ...current, [id]: { ...current[id], pending: false } }));
      }
    })();
    completionFlights.current.set(id, task);
    return task;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ready || !p.setupDone || launchHandled.current) return;
    launchHandled.current = true;
    if (p.settings.showLaunchSummary !== false) setSummaryOpen(true);
    setP((prev) => ({ ...prev, lastOpenedAt: Date.now() }));
  }, [ready, p.setupDone, p.settings.showLaunchSummary]);

  const courses = useMemo(() => coursesOf(items), [items]);

  const patchSource = (id: SourceId, patch: Partial<SourceState>) =>
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const syncFull = () => {
    if (fullSyncFlight.current) return;
    const gradeGeneration = moodleGradesQuery.getGeneration();
    const connected = sources.filter((source) => source.connected);
    const tokens = new Map(connected.map((source) => [source.id, Symbol(source.id)]));
    for (const source of connected) {
      syncFailures.current.delete(source.id);
      syncFlights.current.set(source.id, tokens.get(source.id)!);
      patchSource(source.id, { state: 'syncing', error: undefined });
    }
    const task = (async () => {
      try {
        await startFullSync();
        const deadline = Date.now() + 30 * 60_000;
        let status = await fetchSyncStatus();
        while (status.job?.status === 'running' && Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
          status = await fetchSyncStatus();
        }
        if (status.job?.status === 'running') throw new Error('全量同步仍在运行，请稍后重试');
        if (!status.job) throw new Error('无法读取全量同步任务状态，请稍后重试');
        for (const source of connected) {
          const progress = status.job.sources[source.id];
          if (progress?.status === 'error' && syncFlights.current.get(source.id) === tokens.get(source.id)) {
            const message = progress.message || status.job.message || '这个来源全量同步失败，请重试';
            syncFailures.current.set(source.id, message);
            patchSource(source.id, { state: 'error', error: message });
          }
        }
        if (status.job.sources.moodle?.status === 'done' &&
            tokens.has('moodle') && syncFlights.current.get('moodle') === tokens.get('moodle')) {
          await revalidateMoodleGrades(gradeGeneration);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '全量同步失败';
        for (const source of connected) {
          if (syncFlights.current.get(source.id) !== tokens.get(source.id)) continue;
          syncFailures.current.set(source.id, message);
          patchSource(source.id, { state: 'error', error: message });
        }
      } finally {
        for (const source of connected) {
          if (syncFlights.current.get(source.id) === tokens.get(source.id)) syncFlights.current.delete(source.id);
        }
        fullSyncFlight.current = null;
        await refresh();
      }
    })();
    fullSyncFlight.current = task;
  };

  const syncSource = useCallback(
    (id: SourceId, full = false) => {
      if (full) { syncFull(); return; }
      if (syncFlights.current.has(id) || fullSyncFlight.current) return;
      const token = Symbol(id);
      syncFailures.current.delete(id);
      syncFlights.current.set(id, token);
      patchSource(id, { state: 'syncing', error: undefined });
      void requestSourceSync(id)
        .catch((cause: unknown) => {
          if (syncFlights.current.get(id) !== token) return;
          const message = cause instanceof Error ? cause.message : '同步失败';
          syncFailures.current.set(id, message);
          patchSource(id, { state: 'error', error: message });
        })
        .finally(async () => {
          if (syncFlights.current.get(id) !== token) return;
          syncFlights.current.delete(id);
          // Success timestamps come from the service, never from an attempted request.
          await refresh();
          if (!syncFailures.current.has(id)) {
            setSources((current) => current.map((source) => source.id === id && source.state === 'syncing'
              ? { ...source, state: 'idle' } : source));
          }
        });
    },
    [refresh, sources],
  );

  const store: Store = {
    now,
    ready,
    error,
    items,
    changes,
    courses,
    marks: p.marks,
    sources,
    settings: p.settings,
    attendance: p.attendance,
    setupDone: p.setupDone,
    lastViewedAt: p.lastViewedAt,
    openedSince,
    summaryOpen,
    setSummaryOpen,
    openItemId,
    paletteOpen,
    setPaletteOpen,
    openItem: setOpenItemId,
    completionUpdates,
    setCompleted,
    setMark: (id, patch) =>
      setP((prev) => {
        const next = { ...prev.marks[id], ...patch };
        (Object.keys(next) as (keyof UserMark)[]).forEach((k) => next[k] === undefined && delete next[k]);
        return { ...prev, marks: { ...prev.marks, [id]: next } };
      }),
    markWindowViewed: () => setP((prev) => ({ ...prev, lastViewedAt: Date.now() })),
    syncSource,
    syncAll: (full = false) => {
      // 全量同步在服务端是单实例任务，逐个来源发起会 409，所以只发一次。
      if (full) {
        syncFull();
        return;
      }
      sources.filter((s) => s.connected).forEach((s) => syncSource(s.id, false));
    },
    connectSource: (id) => {
      invalidateSourceQueries(id);
      patchSource(id, { state: "syncing" });
      void refresh();
    },
    disconnectSource: (id) => {
      invalidateSourceQueries(id);
      syncFailures.current.delete(id);
      syncFlights.current.delete(id);
      patchSource(id, { connected: false, state: "disconnected", error: undefined });
    },
    completeSetup: () => {
      const at = Date.now();
      launchHandled.current = true;
      setOpenedSince(p.lastViewedAt);
      setSummaryOpen(p.settings.showLaunchSummary !== false);
      setP((prev) => ({ ...prev, setupDone: true, lastOpenedAt: at }));
      void refresh();
    },
    restartSetup: () => setP((prev) => ({ ...prev, setupDone: false })),
    clearAllData: () => {
      invalidateQueryCache();
      syncFailures.current.clear();
      syncFlights.current.clear();
      void fetch("/api/data", { method: "DELETE" }).then(() => refresh());
      setP((prev) => ({ ...prev, marks: {}, attendance: {}, lastViewedAt: Date.now() }));
    },
    clearMarks: () => setP((prev) => ({ ...prev, marks: {} })),
    updateSettings: (s) => setP((prev) => ({ ...prev, settings: { ...prev.settings, ...s } })),
    setAttendance: (id, s) => setP((prev) => ({ ...prev, attendance: { ...prev.attendance, [id]: s } })),
    refresh,
  };

  return <TimezoneContext.Provider value={p.settings.timezone}><Ctx.Provider value={store}>{children}</Ctx.Provider></TimezoneContext.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}
