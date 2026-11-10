const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const pad = (n: number) => String(n).padStart(2, '0')

function dayDiff(ts: number, now: number) {
  const a = new Date(ts)
  const b = new Date(now)
  a.setHours(0, 0, 0, 0)
  b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

export function hm(ts: number) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 今天 13:42 / 昨天 22:05 / 5月12日 16:30 */
export function fmtWhen(ts: number, now = Date.now()) {
  const diff = dayDiff(ts, now)
  if (diff === 0) return `今天 ${hm(ts)}`
  if (diff === -1) return `昨天 ${hm(ts)}`
  if (diff === 1) return `明天 ${hm(ts)}`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm(ts)}`
}

/** 5月16日 周五 23:55 */
export function fmtDue(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]} ${hm(ts)}`
}

export function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`
}

/** 还剩 1 天 9 小时 / 已截止 6 小时 */
export function fmtCountdown(ts: number, now = Date.now()) {
  const ms = ts - now
  const abs = Math.abs(ms)
  const d = Math.floor(abs / 86_400_000)
  const h = Math.floor((abs % 86_400_000) / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const span = d > 0 ? `${d} 天 ${h} 小时` : h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`
  return ms >= 0 ? `还剩 ${span}` : `已截止 ${span}`
}
