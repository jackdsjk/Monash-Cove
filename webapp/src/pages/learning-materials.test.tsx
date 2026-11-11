import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EdPage } from './EdPage'
import { MaterialsPage } from './MaterialsPage'
import { useResourceQuery } from '../lib/use-resource-query'
import { useEdLessons } from '../lib/use-ed-lessons'
import type { EdLessonDetail } from '../types'

vi.mock('../lib/use-resource-query', () => ({ useResourceQuery: vi.fn() }))
vi.mock('../lib/use-ed-lessons', () => ({ useEdLessons: vi.fn() }))
vi.mock('../components/CourseSyncScope', () => ({ CourseSyncScope: () => null }))

const loaded = (data: unknown) => ({ data, loading: false, error: null, refresh: vi.fn() })
const lesson = (id: number, title: string): EdLessonDetail => ({
  id, courseId: 1, title,
  slides: [{ id: id * 10, title: `Content ${title}`, type: 'text', url: 'https://ed.example.invalid', text: 'Fixture text', markdown: 'Fixture text', videoUrls: [], files: [] }],
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network blocked') }))
  vi.stubGlobal('window', { localStorage: { getItem: () => null } })
})
afterEach(() => vi.unstubAllGlobals())

describe('learning material pages', () => {
  it('renders Ed weeks earliest first even when the upstream index is reversed', () => {
    const lessons = [lesson(10, 'Week 10'), lesson(2, 'Week 2'), lesson(1, 'Week 1')]
    vi.mocked(useResourceQuery).mockReturnValue(loaded([{ id: 1, code: 'TEST1001', name: 'Fixture course' }]) as ReturnType<typeof useResourceQuery>)
    vi.mocked(useEdLessons).mockReturnValue({
      ...loaded(lessons.map(({ id, title }) => ({ id, title, slideCount: 1 }))),
      summaries: lessons.map(({ id, title }) => ({ id, title, slideCount: 1 })), lessons, complete: true, detailsLoading: false,
    } as ReturnType<typeof useEdLessons>)
    const html = renderToStaticMarkup(<EdPage />)
    const content = html.slice(html.indexOf('grid grid-cols-1 gap-5'))
    expect(content.indexOf('Content Week 1')).toBeLessThan(content.indexOf('Content Week 2'))
    expect(content.indexOf('Content Week 2')).toBeLessThan(content.indexOf('Content Week 10'))
    expect(html).toContain('全部周')
    expect(html).toContain('全部类型')
    expect(html).toContain('lesson、内容标题或正文')
  })

  it('retains empty Ed lessons rather than presenting them as failed or filtered out', () => {
    vi.mocked(useResourceQuery).mockReturnValue(loaded([{ id: 1, code: 'TEST1001', name: 'Fixture course' }]) as ReturnType<typeof useResourceQuery>)
    vi.mocked(useEdLessons).mockReturnValue({
      ...loaded([]), summaries: [{ id: 1, title: 'Week 1 Empty', slideCount: 0 }],
      lessons: [{ id: 1, courseId: 1, title: 'Week 1 Empty', slides: [] }], complete: true, detailsLoading: false,
    } as ReturnType<typeof useEdLessons>)
    const html = renderToStaticMarkup(<EdPage />)
    expect(html).toContain('Week 1 Empty')
    expect(html).not.toContain('没有匹配的内容')
    expect(html).not.toContain('内容读取失败')
  })

  it('keeps long Moodle course names outside the page header and exposes section filters', () => {
    vi.mocked(useResourceQuery)
      .mockReturnValueOnce(loaded([{ id: 1, shortname: 'LONG COURSE NAME WITH MANY WORDS', fullname: 'Fixture course' }]) as ReturnType<typeof useResourceQuery>)
      .mockReturnValueOnce(loaded([
        { id: 'one', sectionNumber: 1, sectionTitle: 'Week 1', module: 'resource', title: 'Reading', url: 'https://moodle.example.invalid/file' },
      ]) as ReturnType<typeof useResourceQuery>)
    const html = renderToStaticMarkup(<MaterialsPage />)
    expect(html.slice(0, html.indexOf('</header>'))).not.toContain('LONG COURSE NAME')
    expect(html).toContain('LONG COURSE NAME WITH MANY WORDS')
    expect(html).toContain('全部周与板块')
    expect(html).toContain('Week 1')
    expect(html).toContain('资料名称或板块')
  })
})
