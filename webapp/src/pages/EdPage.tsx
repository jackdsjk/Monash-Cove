import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, CircleHelp, Download, FileText, Paperclip, PlayCircle } from 'lucide-react'
import { edCoursesQuery } from '../data/repository'
import type { EdLessonDetail, EdMaterialFile, EdMaterialSlide } from '../types'
import { Button, EmptyLine, PageTitle, Panel, Select } from '../components/ui'
import { CacheStatus } from '../components/CacheStatus'
import { useResourceQuery } from '../lib/use-resource-query'
import { useEdLessons } from '../lib/use-ed-lessons'
import { compareLearningTitles, learningWeek, matchesLearningSearch } from '../lib/learning-filters'

const KIND_LABEL: Record<EdMaterialSlide['type'], string> = { video: '视频', text: '文字', slides: 'PPT', file: '文件', quiz: 'Quiz' }
const KIND_ICON: Record<EdMaterialSlide['type'], typeof FileText> = { video: PlayCircle, text: FileText, slides: Paperclip, file: Paperclip, quiz: CircleHelp }

type Slide = EdMaterialSlide & { lesson: EdLessonDetail }
type Job =
  | { state: 'idle' }
  | { state: 'busy' | 'done'; label: string; count: number; mode: 'bundle' | 'file' }
  | { state: 'error'; label: string; message: string }

const safeName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'ed-material'

function downloadBlob(name: string, blob: Blob) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  return body?.error?.message ?? fallback
}

function filesOf(lessons: EdLessonDetail[]): { name: string; url: string }[] {
  return lessons.flatMap((lesson) => lesson.slides.flatMap((slide) => slide.files.map((file) => ({ name: file.name, url: file.url }))))
}

const lessonMarkdown = (lesson: EdLessonDetail) => `# ${lesson.title}\n\n${lesson.slides.map((s) => s.markdown).join('\n\n---\n\n')}`.trim()
const courseMarkdown = (lessons: EdLessonDetail[]) => lessons.map(lessonMarkdown).join('\n\n---\n\n')

async function fetchBundle(title: string, markdown: string, files: { name: string; url: string }[]): Promise<Blob> {
  const response = await fetch('/api/ed/download-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lessonTitle: title, markdown, files }),
  })
  if (!response.ok) throw new Error(await readError(response, `打包下载失败：HTTP ${response.status}`))
  return response.blob()
}

async function fetchAttachment(file: EdMaterialFile): Promise<Blob> {
  const response = await fetch(`/api/ed/download?url=${encodeURIComponent(file.url)}&name=${encodeURIComponent(file.name)}`)
  if (!response.ok) throw new Error(await readError(response, `下载失败：HTTP ${response.status}`))
  return response.blob()
}

function metaOf(slide: Slide) {
  if (slide.videoUrls.length > 0) return `${slide.videoUrls.length} 个视频`
  if (slide.files.length > 0) return slide.files.map((file) => file.name).join('、')
  const chars = slide.text.replace(/\s+/g, '').length
  return chars > 0 ? `${chars} 字` : '无正文'
}

function primaryName(slide: Slide) {
  if (slide.files.length === 1) return slide.files[0].name
  if (slide.files.length > 1) return `${safeName(slide.title)}.zip`
  return `${safeName(slide.title)}.md`
}

function lessonFileCount(lesson: EdLessonDetail) {
  return lesson.slides.reduce((n, slide) => n + slide.files.length, 0)
}

function jobInfo(job: Job, course: string): { tone: 'busy' | 'done' | 'error'; text: string } | null {
  if (job.state === 'idle') return null
  const head = `${course} · ${job.label}`
  if (job.state === 'error') return { tone: 'error', text: `下载 ${head} 失败：${job.message}` }
  if (job.state === 'done') {
    return {
      tone: 'done',
      text: job.mode === 'bundle' ? `已打包 ${head}：${job.count} 个附件和 lesson.md，保存在浏览器下载目录` : `已下载 ${head}，保存在浏览器下载目录`,
    }
  }
  return { tone: 'busy', text: job.mode === 'bundle' ? `正在打包 ${head}：${job.count} 个附件…` : `正在下载 ${head}…` }
}

export function EdPage() {
  const courseQuery = useResourceQuery(edCoursesQuery)
  const courses = courseQuery.data ?? []
  const [selectedCourseId, setCourseId] = useState<number | null>(null)
  const courseId = courses.some((course) => course.id === selectedCourseId) ? selectedCourseId : courses[0]?.id ?? null
  const lessonQuery = useEdLessons(courseId)
  const { summaries, lessons } = lessonQuery
  const [slideId, setSlideId] = useState<number | null>(null)
  const loading = courseQuery.data === undefined && !courseQuery.error || courseId !== null && lessonQuery.data === undefined && !lessonQuery.error
  const error = courseQuery.error ?? lessonQuery.error
  const [job, setJob] = useState<Job>({ state: 'idle' })
  const [weekFilter, setWeekFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setSlideId(null)
    setJob({ state: 'idle' })
    setWeekFilter('all')
    setKindFilter('all')
    setSearch('')
  }, [courseId])

  const course = courses.find((item) => item.id === courseId) ?? null
  const orderedSummaries = useMemo(() => [...summaries].sort(compareLearningTitles), [summaries])
  const orderedLessons = orderedSummaries.flatMap((summary) => lessons.find((lesson) => lesson.id === summary.id) ?? [])
  const weeks = [...new Set(orderedSummaries.map((summary) => learningWeek(summary.title)).filter((week): week is number => week !== null))]
  const hasOtherLessons = orderedSummaries.some((summary) => learningWeek(summary.title) === null)
  const visibleLessons = orderedSummaries.flatMap((summary, index) => {
    const week = learningWeek(summary.title)
    if (weekFilter !== 'all' && (week === null ? 'other' : String(week)) !== weekFilter) return []
    const lesson = lessons.find((detail) => detail.id === summary.id)
    const matchesTitle = matchesLearningSearch(search, summary.title)
    const visibleSlides = lesson?.slides.filter((slide) =>
      (kindFilter === 'all' || slide.type === kindFilter) &&
      (matchesTitle || matchesLearningSearch(search, slide.title, slide.text)),
    ) ?? []
    // Retain unloaded lessons as placeholders, rather than treating their content as empty.
    if (!lesson && !matchesTitle) return []
    if (lesson && visibleSlides.length === 0 && (lesson.slides.length > 0 || kindFilter !== 'all' || !matchesTitle)) return []
    return [{ summary, lesson, slides: visibleSlides, index }]
  })
  const slides = visibleLessons.flatMap(({ lesson, slides }) => lesson ? slides.map((slide) => ({ ...slide, lesson })) : [])
  const current = slides.find((slide) => slide.id === slideId) ?? slides[0]
  const fileCount = lessons.reduce((n, lesson) => n + lessonFileCount(lesson), 0)
  const banner = jobInfo(job, course?.code ?? 'Ed')

  const runJob = async (label: string, count: number, mode: 'bundle' | 'file', task: () => Promise<void>) => {
    setJob({ state: 'busy', label, count, mode })
    try {
      await task()
      setJob({ state: 'done', label, count, mode })
    } catch (cause) {
      setJob({ state: 'error', label, message: cause instanceof Error ? cause.message : '下载失败' })
    }
  }

  const downloadLesson = (lesson: EdLessonDetail) => {
    const files = filesOf([lesson])
    return runJob(lesson.title, files.length, 'bundle', async () => {
      downloadBlob(`${safeName(lesson.title)}.zip`, await fetchBundle(lesson.title, lessonMarkdown(lesson), files))
    })
  }

  const downloadCourse = () => {
    if (!lessonQuery.complete) return
    const files = filesOf(orderedLessons)
    const title = course?.code ?? 'Ed course'
    return runJob(title, files.length, 'bundle', async () => {
      downloadBlob(`${safeName(title)}.zip`, await fetchBundle(title, courseMarkdown(orderedLessons), files))
    })
  }

  const downloadSlide = (slide: Slide) => {
    const mode = slide.files.length > 1 ? 'bundle' : 'file'
    return runJob(slide.title, slide.files.length, mode, async () => {
      if (slide.files.length === 0) {
        downloadBlob(`${safeName(slide.title)}.md`, new Blob([slide.markdown], { type: 'text/markdown;charset=utf-8' }))
        return
      }
      if (slide.files.length === 1) {
        downloadBlob(slide.files[0].name, await fetchAttachment(slide.files[0]))
        return
      }
      downloadBlob(
        `${safeName(slide.title)}.zip`,
        await fetchBundle(slide.title, slide.markdown, slide.files.map((file) => ({ name: file.name, url: file.url }))),
      )
    })
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageTitle
        title="Ed 学习内容"
        description="按课程和 lesson 浏览 Ed 中的视频、文字与附件，可以一键下载到本机。"
        actions={
          <>
            <Button disabled={courseQuery.loading || lessonQuery.loading || lessonQuery.detailsLoading} onClick={() => { courseQuery.refresh(); lessonQuery.refresh() }}>刷新内容</Button>
          </>
        }
      />
      {courses.length > 0 && (
        <div className="mb-5 max-w-full sm:max-w-xl">
          <Select label="课程" value={course ? String(course.id) : ''} onChange={(value) => setCourseId(Number(value))}
            options={courses.map((c) => ({ value: String(c.id), label: `${c.code} · ${c.name}` }))} />
        </div>
      )}
      <CacheStatus cache={lessonQuery.cache ?? courseQuery.cache} loading={courseQuery.loading || lessonQuery.loading || lessonQuery.detailsLoading} error={null} />

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {courses.length === 0 ? (
        <Panel>
          <EmptyLine>{loading ? '正在读取 Ed 课程…' : '没有可用的 Ed 课程。连接 Ed 并完成同步后再来看。'}</EmptyLine>
        </Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <Select label="周" value={weekFilter} onChange={setWeekFilter} options={[
              { value: 'all', label: '全部周' }, ...weeks.map((week) => ({ value: String(week), label: `Week ${week}` })),
              ...(hasOtherLessons ? [{ value: 'other', label: '其他内容（未标周）' }] : []),
            ]} />
            <Select label="类型" value={kindFilter} onChange={setKindFilter} options={[
              { value: 'all', label: '全部类型' }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
            ]} />
            <label className="flex min-w-0 flex-1 basis-full items-center gap-2 text-[13px] text-slate-600 sm:basis-48">
              <span className="shrink-0">搜索</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="lesson、内容标题或正文"
                className="h-9 min-w-0 w-full rounded-lg border border-line bg-white px-3 text-slate-800 outline-none focus:border-brand-500" />
            </label>
            <p className="text-xs text-slate-500">按周从早到晚 · 显示 {visibleLessons.length} 个 lesson</p>
          </div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-slate-500">
              {loading ? '正在读取 lesson…' : `${lessons.length} / ${summaries.length} 个 lesson 已读取 · ${slides.length} 个内容 · ${fileCount} 个附件${lessonQuery.detailsLoading ? ' · 其余内容正在加载' : ''}`}
            </p>
            <div className="flex max-w-full flex-wrap items-center gap-2">
              <Button disabled={!current || job.state === 'busy'} onClick={() => current && void downloadLesson(current.lesson)}>
                <Download className="h-4 w-4" />
                下载本课{current ? `（${lessonFileCount(current.lesson)} 个附件）` : ''}
              </Button>
              <Button variant="primary" disabled={lessons.length === 0 || !lessonQuery.complete || job.state === 'busy'} onClick={() => void downloadCourse()}>
                <Download className="h-4 w-4" />
                下载整门课（{fileCount} 个附件）
              </Button>
            </div>
          </div>

          {banner && (
            <div
              role="status"
              className={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] ${
                banner.tone === 'done'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : banner.tone === 'error'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-brand-200 bg-brand-50 text-brand-900'
              }`}
            >
              {banner.tone === 'done' ? <CheckCircle2 className="h-4 w-4" /> : banner.tone === 'error' ? <CircleAlert className="h-4 w-4" /> : <Download className="h-4 w-4 animate-pulse" />}
              {banner.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Panel className="overflow-hidden">
              {loading && lessons.length === 0 ? (
                <EmptyLine>正在读取 lesson 内容…</EmptyLine>
              ) : summaries.length === 0 ? (
                <EmptyLine>{error ? 'lesson 读取失败，见上方提示。' : '这门课还没有 Ed lesson。'}</EmptyLine>
              ) : visibleLessons.length === 0 ? (
                <EmptyLine>没有匹配的内容。请调整周、类型或搜索条件。</EmptyLine>
              ) : (
                visibleLessons.map(({ summary, lesson, slides: lessonSlides, index }) => {
                  if (!lesson) return <div key={summary.id} className="border-b border-line px-5 py-4 text-sm text-slate-600">{summary.title}<p className="mt-1 text-xs text-slate-500">{lessonQuery.detailsLoading ? '正在读取内容…' : '内容读取失败，刷新可重试。'}</p></div>
                  return (
                  <div key={lesson.id} className="border-b border-line last:border-b-0">
                    <div className="flex items-center justify-between gap-2 bg-slate-50/70 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-brand-700">
                          Lesson {index + 1} · {lesson.slides.length} 个内容
                        </p>
                        <p className="break-words text-sm font-bold text-slate-900">{lesson.title}</p>
                      </div>
                      <button
                        onClick={() => void downloadLesson(lesson)}
                        disabled={job.state === 'busy'}
                        aria-label={`下载 ${lesson.title}`}
                        title={`下载 ${lesson.title}`}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-brand-700 disabled:opacity-40"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                    <ul>
                      {lessonSlides.map((s) => {
                        const Icon = KIND_ICON[s.type]
                        const on = current?.id === s.id
                        return (
                          <li key={s.id}>
                            <button
                              aria-current={on ? 'true' : undefined}
                              onClick={() => setSlideId(s.id)}
                              className={`flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[13px] transition-colors ${on ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                              <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-brand-700' : 'text-slate-400'}`} />
                              <span className="flex-1 truncate">{s.title}</span>
                              <span className="text-[11px] text-slate-500">{KIND_LABEL[s.type]}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                  )
                })
              )}
            </Panel>

            {current ? (
              <Panel className="p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-brand-700">
                      {course?.code ?? 'Ed'} · {current.lesson.title}
                    </p>
                    <h2 className="mt-1 text-[19px] font-bold text-slate-900">{current.title}</h2>
                    <p className="mt-0.5 text-[13px] text-slate-500">
                      {KIND_LABEL[current.type]} · {metaOf(current)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => void downloadSlide(current)} disabled={job.state === 'busy'}>
                    <Download className="h-3.5 w-3.5" />
                    {primaryName(current)}
                  </Button>
                </div>

                {current.type === 'video' && (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 flex aspect-video items-center justify-center rounded-xl bg-slate-900 text-slate-300"
                  >
                    <div className="text-center">
                      <PlayCircle className="mx-auto h-11 w-11 text-slate-400" />
                      <p className="mt-2 text-xs">在 Ed 中播放 · {metaOf(current)}</p>
                    </div>
                  </a>
                )}
                {(current.type === 'slides' || current.type === 'file') && (
                  <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-line px-4 py-3 text-[13px] text-slate-800">
                    <Paperclip className="h-4 w-4 text-slate-400" />
                    {metaOf(current)}
                  </div>
                )}
                {current.text && <p className="mt-6 max-w-[68ch] text-[15px] leading-relaxed text-slate-700">{current.text}</p>}
              </Panel>
            ) : !loading ? (
              <Panel>
                <EmptyLine>选择左侧内容查看详情。</EmptyLine>
              </Panel>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
