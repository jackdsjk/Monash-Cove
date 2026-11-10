import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ItemDrawer } from './ItemDrawer'
import { DeadlinesPage } from '../pages/DeadlinesPage'
import { useStore } from '../store'
import type { Item } from '../data/model'

vi.mock('../store', () => ({ useStore: vi.fn() }))

const now = Date.parse('2026-11-10T10:00:00Z')
const item: Item = {
  id: 'assignment', source: 'moodle', course: 'NEW1234', title: 'New course assignment',
  objectType: 'assessment', author: { name: '', role: 'system' },
  publishedAt: now, firstSeenAt: now, dueAt: now + 3600_000,
  excerpt: 'Fixture only', body: '', url: 'https://moodle.example.invalid/assignment', location: '',
}

function show(completed: boolean, pending = false, error: string | null = null): void {
  // Include an obsolete browser mark to verify it cannot override saved evidence.
  const store = {
    now, openItemId: item.id, openItem: vi.fn(), items: [{ ...item, completedAt: completed ? now : undefined }],
    changes: [], courses: [{ code: item.course, name: 'Newly connected course' }],
    marks: { [item.id]: { submitted: !completed } }, setMark: vi.fn(),
    completionUpdates: { [item.id]: { pending, error } }, setCompleted: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(useStore).mockReturnValue(store as unknown as ReturnType<typeof useStore>)
}

beforeEach(() => vi.clearAllMocks())

describe('shared saved completion state', () => {
  it('shows saved completion in both drawer and deadlines even without a local submitted mark', () => {
    show(true)
    expect(renderToStaticMarkup(<ItemDrawer />)).toContain('aria-pressed="true"')
    expect(renderToStaticMarkup(<DeadlinesPage />)).toContain('撤销已提交标记')
  })

  it('ignores an obsolete browser-only submitted flag when the service says incomplete', () => {
    show(false)
    expect(renderToStaticMarkup(<ItemDrawer />)).not.toContain('aria-pressed="true"')
    const deadlines = renderToStaticMarkup(<DeadlinesPage />)
    expect(deadlines).toContain('标记已提交')
    expect(deadlines).not.toContain('撤销已提交标记')
  })

  it('shows save failures in both views and disables a pending write', () => {
    show(false, false, 'Fixture connection failed')
    expect(renderToStaticMarkup(<ItemDrawer />)).toContain('保存失败：Fixture connection failed')
    expect(renderToStaticMarkup(<DeadlinesPage />)).toContain('保存失败：Fixture connection failed')
    show(false, true)
    expect(renderToStaticMarkup(<ItemDrawer />)).toMatch(/aria-pressed="false"[^>]*disabled=""/)
    expect(renderToStaticMarkup(<DeadlinesPage />)).toContain('保存中…')
  })

  it('uses the connected course list instead of the four hardcoded sample courses', () => {
    show(false)
    expect(renderToStaticMarkup(<ItemDrawer />)).toContain('NEW1234 · Newly connected course')
  })
})
