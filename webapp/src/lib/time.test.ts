import { describe, expect, it } from 'vitest'
import { fmtDate, fmtDue, fmtWhen, hm } from './time'

describe('configured display time zone', () => {
  const at = Date.parse('2026-11-10T12:00:00Z')

  it('formats the same instant in the requested IANA zone regardless of host zone', () => {
    expect(hm(at, 'Asia/Kuala_Lumpur')).toBe('20:00')
    expect(hm(at, 'UTC')).toBe('12:00')
    expect(fmtDue(at, 'Asia/Kuala_Lumpur')).toBe('11月10日 周二 20:00')
    expect(fmtDue(at, 'Australia/Melbourne')).toBe('11月10日 周二 23:00')
  })

  it('uses the selected calendar date when crossing midnight', () => {
    const midnight = Date.parse('2026-11-10T16:30:00Z')
    expect(fmtDate(midnight, 'Asia/Kuala_Lumpur')).toBe('2026年11月11日 周三')
    expect(fmtWhen(midnight, at, 'Asia/Kuala_Lumpur')).toBe('明天 00:30')
    expect(fmtWhen(midnight, at, 'UTC')).toBe('今天 16:30')
  })

  it('compares calendar days correctly across daylight saving changes', () => {
    expect(fmtWhen(Date.parse('2026-10-04T00:30:00Z'), Date.parse('2026-10-03T00:30:00Z'), 'Australia/Melbourne')).toBe('明天 11:30')
  })

  it('falls back safely when an old saved setting contains an invalid zone', () => {
    expect(hm(at, 'invalid-zone')).toBe('20:00')
  })
})
