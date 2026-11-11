import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CacheStatus } from './CacheStatus'
import type { CacheMetadata } from '../data/query-cache'

const saved: CacheMetadata = { identity: 'fixture', fetchedAt: '2026-11-11T00:00:00Z', checkedAt: '2026-11-11T01:00:00Z', refreshing: false, stale: true, error: null }

describe('resource failure messages', () => {
  it('shows the course reason separately without duplicate retention text or punctuation', () => {
    const html = renderToStaticMarkup(<CacheStatus cache={{ ...saved, failedIds: ['2'] }} loading={false} error="部分课程成绩刷新失败（课程 2：Moodle 返回 HTTP 500）。" />)
    expect(html).toContain('课程 2：Moodle 返回 HTTP 500')
    expect(html).toContain('失败课程尚未更新')
    expect(html).not.toContain('保留上次成功')
    expect(html).not.toContain('。；')
  })

  it('does not claim old data exists after an initial failure', () => {
    const html = renderToStaticMarkup(<CacheStatus loading={false} error="读取失败" />)
    expect(html).toContain('读取失败')
    expect(html).not.toContain('已保存的数据')
  })

  it('explains the saved fallback after a complete refresh failure', () => {
    const html = renderToStaticMarkup(<CacheStatus cache={saved} loading={false} error="读取超时" />)
    expect(html).toContain('当前显示已保存的数据，可重试刷新。')
  })
})
