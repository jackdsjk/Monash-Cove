import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ResourceQuery } from '../data/query-cache';

export function useResourceQuery<T>(query: ResourceQuery<T>, enabled = true) {
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => {
    if (enabled) void query.load().catch(() => undefined);
  }, [query, enabled]);
  const refresh = useCallback(() => { void query.load(true).catch(() => undefined); }, [query]);
  return { ...snapshot, refresh };
}
