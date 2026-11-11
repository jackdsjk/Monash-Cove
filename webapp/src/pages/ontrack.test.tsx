import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OnTrackPage } from './OnTrackPage'
import { SettingsPage } from './SettingsPage'
import { useStore } from '../store'
import { useResourceQuery } from '../lib/use-resource-query'
import type { OnTrackTaskView } from '../types'

vi.mock('../store', () => ({ useStore: vi.fn() }))
vi.mock('../lib/use-resource-query', () => ({ useResourceQuery: vi.fn() }))

const task: OnTrackTaskView = {
  id: null, isInstantiated: false, visibility: 'within_target',
  projectId: 1, taskDefinitionId: 10, unitCode: 'TEST1001', unitName: 'Fixture course',
  abbreviation: '1.1P', name: 'Unstarted definition task', description: '',
  status: 'not_instantiated', dueDate: null, targetDueDate: null,
  submissionDate: null, completionDate: null, weighting: null,
  timesAssessed: 0, numNewComments: 0,
}

function showTasks(tasks: OnTrackTaskView[]): string {
  vi.mocked(useResourceQuery)
    .mockReturnValueOnce({ data: { connected: true, account: null, projects: [] }, loading: false, error: null, refresh: vi.fn() })
    .mockReturnValueOnce({ data: { projects: [], tasks }, loading: false, error: null, refresh: vi.fn() })
  return renderToStaticMarkup(<OnTrackPage />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network in fixture rendering') }))
  const store = {
    now: Date.parse('2026-11-11T00:00:00Z'), settings: { name: '', timezone: 'Asia/Kuala_Lumpur' },
    items: [], changes: [], marks: {}, sources: [],
  }
  vi.mocked(useStore).mockReturnValue(store as unknown as ReturnType<typeof useStore>)
})

afterEach(() => vi.unstubAllGlobals())

describe('OnTrack definition-first display', () => {
  it('displays tasks which have no instance without showing an invented status', () => {
    const html = showTasks([task, { ...task, taskDefinitionId: 11, name: 'Second definition task' }])
    expect(html).toContain('Unstarted definition task')
    expect(html).toContain('Second definition task')
    expect(html.match(/尚未开始/g)).toHaveLength(2)
    expect(html).not.toContain('Not instantiated')
    expect(html).not.toContain('适用性待确认')
  })

  it('keeps uncertain applicability visible and asks the student to verify it', () => {
    const html = showTasks([{ ...task, visibility: 'unknown' }])
    expect(html).toContain('Unstarted definition task')
    expect(html).toContain('适用性待确认，请在 OnTrack 核对')
  })

  it('preserves unfamiliar upstream statuses', () => {
    expect(showTasks([{ ...task, id: 42, isInstantiated: true, status: 'awaiting_review' }]))
      .toContain('Awaiting review')
  })

  it('describes the accessible OnTrack history scope in settings', () => {
    const html = renderToStaticMarkup(<SettingsPage />)
    expect(html).toContain('Gmail、Ed、Moodle 和 OnTrack')
    expect(html).toContain('当前账号可访问项目的任务和全部反馈')
    expect(html).toContain('无法恢复服务器已隐藏或删除的内容')
    expect(html).not.toContain('OnTrack 请在来源页增量同步')
  })
})
