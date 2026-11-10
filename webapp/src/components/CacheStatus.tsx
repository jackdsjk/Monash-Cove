import type { CacheMetadata } from '../data/query-cache';

export function CacheStatus({ cache, loading, error }: { cache?: CacheMetadata; loading: boolean; error: string | null }) {
  const fetchedAt = cache?.fetchedAt ? new Date(cache.fetchedAt) : null;
  return (
    <div role="status" className="mb-4 space-y-1 text-xs text-slate-500">
      {fetchedAt && Number.isFinite(fetchedAt.getTime()) && (
        <p>上次成功读取：{fetchedAt.toLocaleString('zh-CN')}{cache?.stale ? ' · 当前显示已保存的数据' : ''}</p>
      )}
      {(loading || cache?.refreshing) && <p>正在后台更新，已有数据仍可查看…</p>}
      {error && <p className="text-amber-800">{error}{cache?.fetchedAt ? '；保留上次成功读取的数据，可重试刷新。' : ''}</p>}
    </div>
  );
}
