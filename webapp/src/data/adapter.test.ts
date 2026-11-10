import { describe, expect, it } from 'vitest'
import type { BriefItem } from '../types'
import { toItem } from './adapter'
import { lastActivity } from '../lib/brief'

const now = Date.parse('2026-11-10T12:00:00Z')
const item: BriefItem = {
  id: 'new-old-item', source: 'moodle', course: 'FIT1000', title: 'Assignment',
  authorRole: 'staff', text: 'Details', ageHours: 60, contentType: 'required_action',
  importance: 'important', actionRequired: 'yes', openOriginal: 'required', evidenceQuote: 'Details',
  publishedAt: '2026-11-08T00:00:00Z', firstSeenAt: new Date(now).toISOString(),
}

describe('first discovery time', () => {
  it('includes newly synchronized older publications in the since window', () => {
    const mapped = toItem(item, now)
    expect(mapped.publishedAt).toBe(Date.parse(item.publishedAt!))
    expect(mapped.firstSeenAt).toBe(now)
    expect(lastActivity(mapped, [])).toBeGreaterThan(now - 3_600_000)
  })

  it('preserves compatibility when an older service has no discovery timestamp', () => {
    expect(toItem({ ...item, firstSeenAt: undefined }, now).firstSeenAt).toBe(Date.parse(item.publishedAt!))
    expect(toItem({ ...item, firstSeenAt: 'invalid' }, now).firstSeenAt).toBe(Date.parse(item.publishedAt!))
  })
})
