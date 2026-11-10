import { createContext, useContext } from 'react'

export const DEFAULT_TIMEZONE = 'Asia/Kuala_Lumpur'
export const TimezoneContext = createContext(DEFAULT_TIMEZONE)

function dateParts(ts: number, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }
  let formatter: Intl.DateTimeFormat
  try { formatter = new Intl.DateTimeFormat('zh-CN', options) }
  catch { formatter = new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: DEFAULT_TIMEZONE }) }
  return Object.fromEntries(formatter.formatToParts(ts).map((part) => [part.type, part.value]))
}

function dayDiff(ts: number, now: number, timeZone: string) {
  const day = (value: number) => {
    const p = dateParts(value, timeZone)
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))
  }
  return (day(ts) - day(now)) / 86_400_000
}

export function hm(ts: number, timeZone = DEFAULT_TIMEZONE) {
  const p = dateParts(ts, timeZone)
  return `${p.hour}:${p.minute}`
}

/** 今天 13:42 / 昨天 22:05 / 5月12日 16:30 */
export function fmtWhen(ts: number, now = Date.now(), timeZone = DEFAULT_TIMEZONE) {
  const diff = dayDiff(ts, now, timeZone)
  if (diff === 0) return `今天 ${hm(ts, timeZone)}`
  if (diff === -1) return `昨天 ${hm(ts, timeZone)}`
  if (diff === 1) return `明天 ${hm(ts, timeZone)}`
  const p = dateParts(ts, timeZone)
  return `${p.month}月${p.day}日 ${p.hour}:${p.minute}`
}

/** 5月16日 周五 23:55 */
export function fmtDue(ts: number, timeZone = DEFAULT_TIMEZONE) {
  const p = dateParts(ts, timeZone)
  return `${p.month}月${p.day}日 ${p.weekday} ${p.hour}:${p.minute}`
}

export function fmtDate(ts: number, timeZone = DEFAULT_TIMEZONE) {
  const p = dateParts(ts, timeZone)
  return `${p.year}年${p.month}月${p.day}日 ${p.weekday}`
}

/** Bound to the active setting, so changing it updates every consumer immediately. */
export function useTime() {
  const timezone = useContext(TimezoneContext)
  return {
    timezone,
    hm: (ts: number) => hm(ts, timezone),
    fmtDue: (ts: number) => fmtDue(ts, timezone),
    fmtDate: (ts: number) => fmtDate(ts, timezone),
    fmtWhen: (ts: number, now = Date.now()) => fmtWhen(ts, now, timezone),
  }
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
