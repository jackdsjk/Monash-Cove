import type { Item, ItemChange, SourceId, UserMark } from '../data/model'

export type View = 'since' | 'all'

export interface BriefFilters {
  source: SourceId | null
  course: string
  range: 'any' | '24h' | '7d'
  query: string
}

export const EMPTY_FILTERS: BriefFilters = { source: null, course: 'all', range: 'any', query: '' }

const H = 3600_000

export function lastActivity(item: Item, changes: ItemChange[]) {
  return Math.max(item.firstSeenAt, ...changes.filter((c) => c.itemId === item.id).map((c) => c.detectedAt))
}

/** 除来源外的筛选（来源计数要在来源筛选之前计算） */
export function matchesNonSource(item: Item, f: BriefFilters, activity: number, now: number) {
  if (f.course !== 'all' && item.course !== f.course) return false
  if (f.range === '24h' && activity < now - 24 * H) return false
  if (f.range === '7d' && activity < now - 7 * 24 * H) return false
  const q = f.query.trim().toLowerCase()
  if (q && !`${item.course} ${item.title} ${item.author.name} ${item.excerpt}`.toLowerCase().includes(q)) return false
  return true
}

export interface Suggestion {
  item: Item
  reason: string
}

/**
 * PRD 9.3：只有三条规则，按优先级取，同一理由最多一次，最多 3 条，不足就少放。
 */
export function pickSuggestions(pool: Item[], changes: ItemChange[], windowStart: number, now: number): Suggestion[] {
  const out: Suggestion[] = []
  const used = new Set<string>()
  const take = (item: Item | undefined, reason: string) => {
    if (item && !used.has(item.id)) {
      used.add(item.id)
      out.push({ item, reason })
    }
  }

  const within48 = pool
    .filter((i) => i.dueAt && i.dueAt > now && i.dueAt - now <= 48 * H)
    .sort((a, b) => a.dueAt! - b.dueAt!)
  take(within48[0], '截止时间在 48 小时内')

  const dueChanged = pool
    .filter((i) => !used.has(i.id))
    .map((i) => ({
      i,
      at: Math.max(0, ...changes.filter((c) => c.itemId === i.id && c.field === 'due_at' && c.detectedAt >= windowStart).map((c) => c.detectedAt)),
    }))
    .filter((x) => x.at > 0)
    .sort((a, b) => b.at - a.at)
  take(dueChanged[0]?.i, '截止时间刚被改过')

  const staff = pool
    .filter((i) => !used.has(i.id) && i.author.role === 'staff')
    .sort((a, b) => lastActivity(b, changes) - lastActivity(a, changes))
  take(staff[0], '教学人员发布')

  return out
}

export function isHiddenByUser(mark: UserMark | undefined) {
  return !!mark?.judgment
}
