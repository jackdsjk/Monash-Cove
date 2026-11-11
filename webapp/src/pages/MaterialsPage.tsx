import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, RefreshCw } from 'lucide-react'
import { Button, EmptyLine, PageTitle, Panel, Select, Tag } from '../components/ui'
import { getMoodleContentQuery, moodleCoursesQuery, syncMoodleContent } from '../data/repository'
import type { MoodleContentItem, MoodleCourse } from '../types'
import { useResourceQuery } from '../lib/use-resource-query'
import { CacheStatus } from '../components/CacheStatus'
import { CourseSyncScope } from '../components/CourseSyncScope'
import { courseMatchesRegion, defaultRegionForCourses, loadRegion, type CampusRegion } from '../lib/region'
import { navigate } from '../lib/router'
import { matchesLearningSearch } from '../lib/learning-filters'

type MaterialKind = '资料' | '作业' | '公告'

interface MaterialEntry {
  id: string
  name: string
  kind: MaterialKind
  // The local service does not expose a byte size for Moodle resources, so this
  // column stays "—" rather than showing an invented number.
  size: string | null
  downloadable: boolean
}

interface MaterialWeek {
  number: number
  /** Bold heading: "Week 5" when Moodle says so, otherwise the section name. */
  label: string
  /** Muted rest of the heading, e.g. "Operating Systems, Input/Output". */
  title: string
  entries: MaterialEntry[]
}

type DownloadStatus = {
  state: 'idle' | 'busy' | 'done' | 'error'
  count: number
  message?: string
}

/** Gradable activities, content files and announcements, as Moodle reports them. */
const ASSIGNMENT_MODULES = new Set(['assign', 'quiz', 'questionnaire', 'choice', 'groupselect', 'hvp', 'lesson', 'scorm'])
const ANNOUNCEMENT_MODULES = new Set(['forum', 'hsuforum'])

function kindOf(module: string): MaterialKind {
  if (ASSIGNMENT_MODULES.has(module)) return '作业'
  if (ANNOUNCEMENT_MODULES.has(module)) return '公告'
  return '资料'
}

/** Moodle section numbers are indices, not weeks; the title carries the week. */
function weekHeading(section: MoodleContentItem): { label: string; title: string } {
  const title = section.sectionTitle.trim()
  const match = /^week\s*(\d+)\s*[-–—:·]?\s*(.*)$/i.exec(title)
  if (match) return { label: `Week ${match[1]}`, title: match[2].trim() }
  return { label: title || '未命名板块', title: '' }
}

/** Only files the local service can fetch back through a Moodle session. */
function isDownloadable(item: MoodleContentItem) {
  return item.module === 'resource' || item.module === 'url'
}

/** Same preference order the old page used, so the default course stays put. */
const COURSE_PREFERENCE = [/FIT1047/i, /FIT1045/i, /MPU3312/i, /ETW2001/i]

function preferredCourse(courses: MoodleCourse[]): MoodleCourse | undefined {
  for (const pattern of COURSE_PREFERENCE) {
    const hit = courses.find((course) => pattern.test(course.shortname))
    if (hit) return hit
  }
  return courses[0]
}

/** Honour the campus picked elsewhere, but never leave the page with no course. */
function resolveRegion(courses: MoodleCourse[]): CampusRegion {
  const stored = loadRegion()
  if (stored && courses.some((course) => courseMatchesRegion(course, stored))) return stored
  return defaultRegionForCourses(courses)
}

export function MaterialsPage() {
  const courseQuery = useResourceQuery(moodleCoursesQuery)
  const courses = courseQuery.data ?? []
  const [courseId, setCourseId] = useState<number | null>(null)
  const [region, setRegion] = useState<CampusRegion>(() => loadRegion() ?? 'malaysia')
  const contentResource = getMoodleContentQuery(courseId ?? -1)
  const contentQuery = useResourceQuery(contentResource, courseId !== null)
  const items = contentQuery.data ?? []
  const loading = courseQuery.data === undefined && !courseQuery.error || courseId !== null && contentQuery.data === undefined && !contentQuery.error
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<DownloadStatus>({ state: 'idle', count: 0 })
  const [sectionFilter, setSectionFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setSectionFilter('all')
    setKindFilter('all')
    setSearch('')
    setSelected(new Set())
    setStatus({ state: 'idle', count: 0 })
    setError(null)
  }, [courseId])

  useEffect(() => {
    setSelected(new Set())
    setStatus({ state: 'idle', count: 0 })
  }, [sectionFilter, kindFilter, search])

  useEffect(() => {
    if (!courseQuery.data) return
    const effective = resolveRegion(courseQuery.data)
    setRegion(effective)
    const visible = courseQuery.data.filter((course) => courseMatchesRegion(course, effective))
    setCourseId((current) => visible.some((course) => course.id === current) ? current : preferredCourse(visible)?.id ?? null)
  }, [courseQuery.data])

  const visibleCourses = useMemo(
    () => courses.filter((course) => courseMatchesRegion(course, region)),
    [courses, region],
  )

  /**
   * The campus preference only narrows which courses are offered. Items inside the
   * chosen course stay visible: Moodle stores most of them as "shared", and hiding
   * real announcements on a campus guess would lose content with no way to undo it.
   */
  // Reuse the legacy page's section/type/title filtering over cached local content.
  const sectionOptions = useMemo(() => [...new Map(items.map((item) =>
    [item.sectionNumber, item.sectionTitle.trim() || '未命名板块'] as const,
  )).entries()].sort(([a], [b]) => a - b), [items])
  const filteredItems = useMemo(() => items.filter((item) =>
    (sectionFilter === 'all' || String(item.sectionNumber) === sectionFilter) &&
    (kindFilter === 'all' || kindOf(item.module) === kindFilter) &&
    matchesLearningSearch(search, item.title, item.sectionTitle),
  ), [items, sectionFilter, kindFilter, search])
  const weeks = useMemo<MaterialWeek[]>(() => {
    const map = new Map<number, MaterialWeek>()
    for (const item of filteredItems) {
      let week = map.get(item.sectionNumber)
      if (!week) {
        const heading = weekHeading(item)
        week = { number: item.sectionNumber, label: heading.label, title: heading.title, entries: [] }
        map.set(item.sectionNumber, week)
      }
      week.entries.push({
        id: item.id,
        name: item.title,
        kind: kindOf(item.module),
        size: null,
        downloadable: isDownloadable(item),
      })
    }
    return [...map.values()].sort((a, b) => a.number - b.number)
  }, [filteredItems])

  const course = courses.find((entry) => entry.id === courseId)

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      return next
    })

  const sync = async () => {
    if (courseId === null) return
    setSyncing(true)
    setError(null)
    try {
      await syncMoodleContent(courseId)
      await contentResource.load(true)
      setSelected(new Set())
      setStatus({ state: 'idle', count: 0 })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const download = async () => {
    const chosen = filteredItems.filter((item) => isDownloadable(item) && selected.has(item.id))
    if (chosen.length === 0) return
    const count = chosen.length
    const archiveName = `${course?.shortname || 'Moodle'}-Materials.zip`
    setStatus({ state: 'busy', count })
    try {
      const response = await fetch('/api/moodle/download-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          archiveName,
          items: chosen.map((item) => ({ url: item.url, name: item.title })),
        }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `下载失败：HTTP ${response.status}`)
      }
      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = archiveName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      const packed = Number(response.headers.get('x-cove-batch-count') ?? count)
      const skipped = Number(response.headers.get('x-cove-batch-skipped') ?? 0)
      setStatus({
        state: 'done',
        count: Number.isFinite(packed) ? packed : count,
        message: skipped > 0 ? `已打包 ${packed} 个文件，跳过 ${skipped} 个；未下载原因见压缩包内的下载说明` : undefined,
      })
      setSelected(new Set())
    } catch (cause) {
      setStatus({ state: 'error', count, message: cause instanceof Error ? cause.message : '批量下载失败' })
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageTitle
        title="每周资料"
        description="按 Moodle 板块列出资料、作业和公告。资料文件可以批量下载到本机。"
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={courseId === null || syncing} onClick={() => void sync()}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? '正在同步' : '同步资料'}
            </Button>
            <Button size="sm" disabled={courseQuery.loading} onClick={courseQuery.refresh}>刷新课程</Button>
          </>
        }
      />
      {visibleCourses.length > 0 && (
        <div className="mb-5 max-w-full sm:max-w-xl">
          <Select label="课程" value={courseId === null ? '' : String(courseId)}
            onChange={(value) => setCourseId(Number(value))}
            options={visibleCourses.map((c) => ({ value: String(c.id), label: c.shortname || c.fullname }))} />
        </div>
      )}
      <CacheStatus cache={courseQuery.cache} loading={courseQuery.loading || contentQuery.loading} error={courseQuery.error ?? contentQuery.error} />
      <CourseSyncScope courses={courses} />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
        <Select label="周 / 板块" value={sectionFilter} onChange={setSectionFilter}
          options={[{ value: 'all', label: '全部周与板块' }, ...sectionOptions.map(([number, title]) => ({ value: String(number), label: title }))]} />
        <Select label="类型" value={kindFilter} onChange={setKindFilter}
          options={['all', '资料', '作业', '公告'].map((value) => ({ value, label: value === 'all' ? '全部类型' : value }))} />
        <label className="flex min-w-0 flex-1 basis-full items-center gap-2 text-[13px] text-slate-600 sm:basis-48">
          <span className="shrink-0">搜索</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="资料名称或板块"
            className="h-9 min-w-0 w-full rounded-lg border border-line bg-white px-3 text-slate-800 outline-none focus:border-brand-500" />
        </label>
        <p className="text-xs text-slate-500">显示 {filteredItems.length} / {items.length} 条</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{error}</div>
      )}

      <div className="mb-4 flex min-h-10 flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-2 text-[13px]">
        <span className="text-slate-600">
          {status.state === 'done' ? (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {status.message ?? `已打包 ${status.count} 个文件到下载文件夹`}
            </span>
          ) : status.state === 'error' ? (
            <span className="text-red-700">{status.message}</span>
          ) : (
            `已选 ${selected.size} 个文件`
          )}
        </span>
        <Button
          variant="primary"
          size="sm"
          disabled={selected.size === 0 || status.state === 'busy'}
          onClick={() => void download()}
        >
          <Download className="h-3.5 w-3.5" />
          {status.state === 'busy' ? `正在下载 ${status.count} 个文件` : '下载所选'}
        </Button>
      </div>

      <div className="space-y-5">
        {weeks.map((w) => {
          const ids = w.entries.filter((e) => e.downloadable).map((e) => e.id)
          const all = ids.length > 0 && ids.every((id) => selected.has(id))
          return (
            <Panel key={w.number} className="overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/70 px-5 py-3">
                <h2 className="text-[15px] font-bold text-slate-900">
                  {w.label} {w.title && <span className="font-normal text-slate-500">· {w.title}</span>}
                </h2>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={all}
                    disabled={ids.length === 0}
                    onChange={(e) => toggle(ids, e.target.checked)}
                    className="accent-brand-600 disabled:opacity-30"
                  />
                  选择本板块显示的资料
                </label>
              </div>
              <ul className="divide-y divide-line">
                {w.entries.map((e) => (
                  <li key={e.id} className="grid min-w-[480px] grid-cols-[24px_56px_minmax(0,1fr)_80px] items-center gap-3 px-5 py-3 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${e.name}`}
                      disabled={!e.downloadable}
                      checked={selected.has(e.id)}
                      onChange={(ev) => toggle([e.id], ev.target.checked)}
                      className="accent-brand-600 disabled:opacity-30"
                    />
                    <Tag tone={e.kind === '作业' ? 'brand' : e.kind === '公告' ? 'amber' : 'slate'}>{e.kind}</Tag>
                    <span className="truncate text-slate-800">{e.name}</span>
                    <span className="text-right text-xs text-slate-500">{e.size ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )
        })}
      </div>

      {loading && (
        <Panel>
          <EmptyLine>正在读取 Moodle 板块…</EmptyLine>
        </Panel>
      )}

      {!loading && weeks.length === 0 && items.length > 0 && (
        <Panel><EmptyLine>没有匹配的资料。请调整周 / 板块、类型或搜索条件。</EmptyLine></Panel>
      )}

      {!loading && items.length === 0 && (
        <Panel>
          <EmptyLine>
            <p className="font-semibold text-slate-700">
              {courses.length === 0 ? '还没有 Moodle 课程' : syncing ? '正在同步资料…' : '还没有这门课的资料'}
            </p>
            <p className="mt-1">
              {courses.length === 0
                ? '先到「来源」连接 Moodle，再回来同步课程资料。'
                : '点击「同步资料」读取 Moodle 板块；不会下载或提交作业。'}
            </p>
            <div className="mt-3 flex justify-center">
              {courses.length === 0 ? (
                <Button variant="secondary" size="sm" onClick={() => navigate('/sources')}>
                  打开来源
                </Button>
              ) : (
                <Button variant="primary" size="sm" disabled={courseId === null || syncing} onClick={() => void sync()}>
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> 同步资料
                </Button>
              )}
            </div>
          </EmptyLine>
        </Panel>
      )}
    </div>
  )
}
