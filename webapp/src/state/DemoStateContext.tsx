import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DemoState, Feedback } from "../types";

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
    return {
      ...freshState(),
      ...raw,
      corrections: raw.corrections && typeof raw.corrections === "object" ? raw.corrections : {},
      read: raw.read && typeof raw.read === "object" ? raw.read : {},
      windowHours: typeof raw.windowHours === "number" ? raw.windowHours : 24,
    };
  } catch {
    return freshState();
  }
}

export interface DemoStore {
  state: DemoState;
  toggleCorrection: (id: string, key: "pinned" | "dismissed") => void;
  saveFeedback: (id: string, feedback: Feedback) => void;
  markRead: (id: string) => void;
  markChecked: (ids: string[]) => void;
  simulateSync: () => void;
  reset: () => void;
}

const DemoStateContext = createContext<DemoStore | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The app still works when storage is unavailable; state is in memory.
    }
  }, [state]);

  const toggleCorrection = useCallback((id: string, key: "pinned" | "dismissed") => {
    setState((previous) => {
      const current = previous.corrections[id] ?? {};
      const next = { ...current, [key]: !current[key] };
      if (key === "pinned" && next.pinned) next.dismissed = false;
      if (key === "dismissed" && next.dismissed) next.pinned = false;
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
  }, []);

  const markRead = useCallback((id: string) => {
    setState((previous) => (previous.read[id] ? previous : { ...previous, read: { ...previous.read, [id]: true } }));
  }, []);

  const markChecked = useCallback((ids: string[]) => {
    setState((previous) => {
      const read = { ...previous.read };
      for (const id of ids) read[id] = true;
      return { ...previous, windowHours: 0, read };
    });
  }, []);

  const simulateSync = useCallback(() => {
    setState((previous) => ({ ...previous, windowHours: 1.5 }));
  }, []);

  const reset = useCallback(() => setState(freshState()), []);

  const value = useMemo<DemoStore>(
    () => ({ state, toggleCorrection, saveFeedback, markRead, markChecked, simulateSync, reset }),
    [state, toggleCorrection, saveFeedback, markRead, markChecked, simulateSync, reset],
  );

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>;
}

export function useDemoStore(): DemoStore {
  const value = useContext(DemoStateContext);
  if (!value) throw new Error("useDemoStore must be used inside DemoProvider");
  return value;
}
