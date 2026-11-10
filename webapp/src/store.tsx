import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchBrief, fetchChanges, fetchSources, startFullSync } from "./data/repository";
import { coursesOf, toChange, toItem, toSource } from "./data/adapter";
import type { Course, Item, ItemChange, SourceId, SourceState, UserMark } from "./data/model";
import { SOURCE_ORDER } from "./data/model";

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
    if (raw) return { ...initial(), ...JSON.parse(raw) };
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
    try {
      const [brief, sourceList, changeList] = await Promise.all([
        fetchBrief(),
        fetchSources().catch(() => []),
        fetchChanges().catch(() => []),
      ]);
      const at = Date.now();
      const mapped = brief.items.map((item) => toItem(item, at));
      setItems(mapped);
      setChanges(changeList.map(toChange));
      setSources(
        sourceList.length > 0
          ? sourceList.map((s) => toSource(s, mapped.filter((i) => i.source === s.id).length))
          : SOURCE_ORDER.map((id) => ({
              id,
              connected: mapped.some((i) => i.source === id),
              state: mapped.some((i) => i.source === id) ? "idle" : "disconnected",
              itemCount: mapped.filter((i) => i.source === id).length,
              account: "",
            })),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取本地数据");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (ready && sources.some((s) => s.connected) && !p.setupDone) {
      setP((prev) => ({ ...prev, setupDone: true }));
    }
  }, [ready, sources, p.setupDone]);

  const courses = useMemo(() => coursesOf(items), [items]);

  const patchSource = (id: SourceId, patch: Partial<SourceState>) =>
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const syncSource = useCallback(
    (id: SourceId, full = false) => {
      patchSource(id, { state: "syncing" });
      const run = full
        ? startFullSync().then(() => undefined)
        : fetch("/api/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ source: id }),
          }).then(() => undefined);
      void run
        .catch((cause: unknown) => {
          patchSource(id, { state: "error", error: cause instanceof Error ? cause.message : "同步失败" });
        })
        .finally(() => {
          patchSource(id, { state: "idle", lastSyncAt: Date.now(), lastSuccessAt: Date.now() });
          void refresh();
        });
    },
    [refresh],
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
        sources.forEach((s) => patchSource(s.id, { state: "syncing" }));
        void startFullSync()
          .catch(() => undefined)
          .finally(() => {
            void refresh();
          });
        return;
      }
      sources.filter((s) => s.connected).forEach((s) => syncSource(s.id, false));
    },
    connectSource: (id) => {
      patchSource(id, { state: "syncing" });
      void refresh();
    },
    disconnectSource: (id) => patchSource(id, { connected: false, state: "disconnected", error: undefined }),
    completeSetup: () => {
      const at = Date.now();
      setOpenedSince(p.lastViewedAt);
      setSummaryOpen(true);
      setP((prev) => ({ ...prev, setupDone: true, lastOpenedAt: at }));
      void refresh();
    },
    restartSetup: () => setP((prev) => ({ ...prev, setupDone: false })),
    clearAllData: () => {
      void fetch("/api/data", { method: "DELETE" }).then(() => refresh());
      setP((prev) => ({ ...prev, marks: {}, attendance: {}, lastViewedAt: Date.now() }));
    },
    clearMarks: () => setP((prev) => ({ ...prev, marks: {} })),
    updateSettings: (s) => setP((prev) => ({ ...prev, settings: { ...prev.settings, ...s } })),
    setAttendance: (id, s) => setP((prev) => ({ ...prev, attendance: { ...prev.attendance, [id]: s } })),
    refresh,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}
