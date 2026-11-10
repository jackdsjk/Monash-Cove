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
  toggleCorrection: (id: string, key: "pinned" | "dismissed") => Promise<boolean>;
  saveFeedback: (id: string, feedback: Feedback) => Promise<boolean>;
  markRead: (id: string) => void;
  markChecked: (ids: string[]) => void;
  reset: () => Promise<boolean>;
}

const DemoStateContext = createContext<DemoStore | null>(null);

async function patchCorrection(id: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch(`/api/items/${encodeURIComponent(id)}/correction`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

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

  // Corrections are written before the UI changes: a silent failure used to
  // leave the card pinned until the next reload, which looks like data loss.
  const toggleCorrection = useCallback(async (id: string, key: "pinned" | "dismissed"): Promise<boolean> => {
    const current = state.corrections[id] ?? {};
    const next: { pinned?: boolean; dismissed?: boolean } = { ...current, [key]: !current[key] };
    if (key === "pinned" && next.pinned) next.dismissed = false;
    if (key === "dismissed" && next.dismissed) next.pinned = false;

    const saved = await patchCorrection(id, { [key]: Boolean(next[key]) });
    if (!saved) return false;
    setState((previous) => ({ ...previous, corrections: { ...previous.corrections, [id]: next } }));
    return true;
  }, [state.corrections]);

  const saveFeedback = useCallback(async (id: string, feedback: Feedback): Promise<boolean> => {
    const saved = await patchCorrection(id, { feedback });
    if (!saved) return false;
    setState((previous) => ({
      ...previous,
      corrections: {
        ...previous.corrections,
        [id]: { ...previous.corrections[id], feedback },
      },
    }));
    return true;
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

  const reset = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/data", { method: "DELETE" });
      if (!response.ok) return false;
    } catch {
      return false;
    }
    setState(freshState());
    return true;
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
