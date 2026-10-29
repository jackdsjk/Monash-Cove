import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BriefItem, DemoState, Feedback } from "../types";

const STORAGE_KEY = "cove-webapp-state-v1";

function freshState(): DemoState {
  return {
    version: 1,
    corrections: {},
    read: {},
    windowHours: 24,
  };
}

function loadState(): DemoState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<DemoState> | null;
    if (!raw || raw.version !== 1) return freshState();
    return { ...freshState(), windowHours: typeof raw.windowHours === "number" ? raw.windowHours : 24 };
  } catch {
    return freshState();
  }
}

export interface DemoStore {
  state: DemoState;
  hydrate: (items: BriefItem[]) => void;
  toggleCorrection: (id: string, key: "pinned" | "dismissed") => void;
  saveFeedback: (id: string, feedback: Feedback) => void;
  markRead: (id: string) => void;
  markChecked: (ids: string[]) => void;
  reset: () => void;
}

const DemoStateContext = createContext<DemoStore | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, windowHours: state.windowHours }));
    } catch {
      // The app still works when storage is unavailable; state is in memory.
    }
  }, [state]);

  const hydrate = useCallback((items: BriefItem[]) => {
    setState((previous) => {
      const corrections = { ...previous.corrections };
      const read = { ...previous.read };
      for (const item of items) {
        if (item.read) read[item.id] = true;
        if (item.correction) corrections[item.id] = item.correction;
      }
      return { ...previous, corrections, read };
    });
  }, []);

  const toggleCorrection = useCallback((id: string, key: "pinned" | "dismissed") => {
    setState((previous) => {
      const current = previous.corrections[id] ?? {};
      const next = { ...current, [key]: !current[key] };
      if (key === "pinned" && next.pinned) next.dismissed = false;
      if (key === "dismissed" && next.dismissed) next.pinned = false;
      void fetch(`/api/items/${encodeURIComponent(id)}/correction`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: Boolean(next[key]) }),
      }).catch(() => undefined);
      return { ...previous, corrections: { ...previous.corrections, [id]: next } };
    });
  }, []);

  const saveFeedback = useCallback((id: string, feedback: Feedback) => {
    setState((previous) => ({
      ...previous,
      corrections: {
        ...previous.corrections,
        [id]: { ...previous.corrections[id], feedback },
      },
    }));
    void fetch(`/api/items/${encodeURIComponent(id)}/correction`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback }),
    }).catch(() => undefined);
  }, []);

  const markRead = useCallback((id: string) => {
    setState((previous) => (previous.read[id] ? previous : { ...previous, read: { ...previous.read, [id]: true } }));
    void fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => undefined);
  }, []);

  const markChecked = useCallback((ids: string[]) => {
    setState((previous) => {
      const read = { ...previous.read };
      for (const id of ids) read[id] = true;
      return { ...previous, windowHours: 0, read };
    });
    void fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    void fetch("/api/data", { method: "DELETE" }).catch(() => undefined);
    setState(freshState());
  }, []);

  const value = useMemo<DemoStore>(
    () => ({ state, hydrate, toggleCorrection, saveFeedback, markRead, markChecked, reset }),
    [state, hydrate, toggleCorrection, saveFeedback, markRead, markChecked, reset],
  );

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>;
}

export function useDemoStore(): DemoStore {
  const value = useContext(DemoStateContext);
  if (!value) throw new Error("useDemoStore must be used inside DemoProvider");
  return value;
}
