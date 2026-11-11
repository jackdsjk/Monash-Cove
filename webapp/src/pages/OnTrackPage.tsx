import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { fetchOnTrackComments, onTrackOverviewQuery, onTrackTasksQuery } from '../data/repository'
import type { OnTrackCommentView, OnTrackTaskView } from '../types'
import { useResourceQuery } from '../lib/use-resource-query'
import { CacheStatus } from '../components/CacheStatus'
import { fmtCountdown, useTime } from '../lib/time'
import { fetchOnTrackMaterial, type OnTrackMaterialKind } from '../lib/ontrack-materials'
import { Button, PageTitle, Panel, Tag } from '../components/ui'
import { filterOnTrackTasks, onTrackGrade, onTrackStatus, onTrackTone, sortOnTrackComments } from '../lib/ontrack-tasks'

const COLS = 'min-w-[1000px] grid-cols-[64px_minmax(0,1fr)_48px_150px_170px_170px_100px]'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** OnTrack 只返回日期（YYYY-MM-DD）；按本地时区取当天 23:59 作为倒计时基准。 */
function dueAt(value: string | null): number | null {
  if (!value) return null
  const start = Date.parse(`${value}T00:00:00`)
  if (!Number.isFinite(start)) return null
  return start + 86_400_000 - 60_000
}

/** 5月16日 周五 */
function fmtDay(value: string | null): string {
  const at = dueAt(value)
  if (at === null) return '—'
  const d = new Date(at)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`
}

const MATERIALS: Array<{ kind: OnTrackMaterialKind; label: string }> = [
  { kind: 'task', label: '任务书 / Worksheet' },
  { kind: 'resources', label: '任务资料' },
  { kind: 'submission', label: '已提交文件' },
]

function TaskMaterials({ task, identity }: { task: OnTrackTaskView; identity: string | undefined }) {
  const [pending, setPending] = useState<OnTrackMaterialKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null)
  useEffect(() => {
    setPending(null)
    setError(null)
    return () => { active.current?.abort(); active.current = null }
  }, [identity, task.projectId, task.taskDefinitionId])

  const download = async (kind: OnTrackMaterialKind): Promise<void> => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setPending(kind)
    setError(null)
    try {
      const file = await fetchOnTrackMaterial(task.projectId, task.taskDefinitionId, kind, controller.signal)
      if (controller.signal.aborted || active.current !== controller) return
      const href = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = href
      link.download = file.filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch (cause) {
      if (!controller.signal.aborted && active.current === controller) {
        setError(cause instanceof Error ? cause.message : 'OnTrack 文件读取失败')
      }
    } finally {
      if (active.current === controller) { active.current = null; setPending(null) }
    }
  }

  return <div className="mt-2 space-y-1.5">
    <div className="flex flex-wrap gap-1.5" aria-label={`${task.abbreviation || task.name} 资料`}>
      {MATERIALS.map(({ kind, label }) => <Button key={kind} size="sm" disabled={pending !== null || kind === 'submission' && task.id === null}
        title={kind === 'submission' && task.id === null ? '此任务还没有个人实例，暂无提交文件' : undefined}
        onClick={() => void download(kind)}>{pending === kind ? '正在读取…' : label}</Button>)}
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>
}

function TaskFeedback({ task }: { task: OnTrackTaskView }) {
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [thread, setThread] = useState<{ comments: OnTrackCommentView[]; viewerId: number | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { fmtWhen } = useTime()
  const panelId = `ontrack-feedback-${task.projectId}-${task.taskDefinitionId}`
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void fetchOnTrackComments(task.projectId, task.taskDefinitionId, controller.signal).then((value) => {
      if (!controller.signal.aborted) setThread({ ...value, comments: sortOnTrackComments(value.comments) })
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '反馈读取失败，请重试')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, version, task.projectId, task.taskDefinitionId])

  return <>
    <div className="text-right">
      <Button size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        {open ? '收起反馈' : '查看反馈'}{task.numNewComments > 0 ? ` (${task.numNewComments} 新)` : ''}
      </Button>
    </div>
    {open && <section id={panelId} aria-label={`${task.abbreviation} 反馈`} className="col-span-full rounded-lg border border-line bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{task.abbreviation} 任务反馈与评论</h3>
        <Button size="sm" disabled={loading} onClick={() => setVersion((value) => value + 1)}>刷新反馈</Button>
      </div>
      {loading && <p role="status" className="text-xs text-slate-500">正在读取反馈…</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {!loading && !error && thread?.comments.length === 0 && <p className="text-xs text-slate-500">此任务暂无反馈或评论。</p>}
      {thread && <ol className="space-y-3">{thread.comments.map((comment) => {
        const at = Date.parse(comment.createdAt)
        const mine = thread.viewerId !== null && comment.authorId === thread.viewerId
        return <li key={comment.id} className="rounded-lg border border-line bg-white p-3">
          <div className="mb-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{mine ? '我' : comment.authorName || '未知作者'}</span>
            <span>{comment.type === 'status' ? '状态记录' : '评论'}</span>
            {Number.isFinite(at) ? <time dateTime={comment.createdAt}>{fmtWhen(at)}</time> : comment.createdAt && <span>{comment.createdAt}</span>}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{comment.comment || '（无文本内容）'}</p>
        </li>
      })}</ol>}
    </section>}
  </>
}

export function OnTrackPage() {
  const { now } = useStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const overviewQuery = useResourceQuery(onTrackOverviewQuery)
  const taskQuery = useResourceQuery(onTrackTasksQuery)
  const overview = overviewQuery.data
  const tasks = taskQuery.data?.tasks ?? []
  const error = overviewQuery.error ?? overview?.error ?? (overview?.connected ? taskQuery.error : null)
  const loading = !error && (overview === undefined || overview.connected && taskQuery.data === undefined)
  const refresh = () => { overviewQuery.refresh(); taskQuery.refresh() }

  const identity = overviewQuery.cache?.identity ?? taskQuery.cache?.identity
  useEffect(() => { setSearch(''); setStatusFilter(''); setGradeFilter('') }, [identity])
  const visible = filterOnTrackTasks(tasks, { search, status: statusFilter, grade: gradeFilter })
  const units = Array.from(new Set(visible.map((t) => t.unitCode)))
  const statuses = Array.from(new Set(tasks.map((task) => task.status)))
  const grades = ['P', 'C', 'D', 'HD', '—'].filter((grade) => tasks.some((task) => onTrackGrade(task) === grade))

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageTitle title="OnTrack 任务" description="查看任务状态、反馈、日期、Worksheet 和任务资料，下载已有提交文件。在 OnTrack 中修改后，下次同步会更新到这里。"
        actions={<Button disabled={overviewQuery.loading || taskQuery.loading} onClick={refresh}>刷新任务</Button>} />
      <CacheStatus cache={overviewQuery.cache ?? taskQuery.cache} loading={overviewQuery.loading || taskQuery.loading} error={error ?? null} />
      {loading ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">正在读取 OnTrack…</Panel>
      ) : error && !overview && tasks.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">OnTrack 暂时不可用：{error}。到「来源」页可以查看登录方式。</Panel>
      ) : !overview?.connected ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">OnTrack 未连接。请先在「来源」中连接。</Panel>
      ) : tasks.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">OnTrack 里还没有任务。</Panel>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3" role="search" aria-label="OnTrack 任务筛选">
            <label className="min-w-48 flex-1 text-xs text-slate-600">搜索任务
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="课程、编号或任务名称" className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-900" />
            </label>
            <label className="text-xs text-slate-600">任务状态
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-900">
                <option value="">全部状态</option>
                {statuses.map((value) => <option key={value} value={value}>{onTrackStatus(value)}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">任务等级
              <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="mt-1 block rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-900">
                <option value="">全部等级</option>
                {grades.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <p role="status" className="py-2 text-xs text-slate-500">显示 {visible.length} / {tasks.length} 项</p>
          </div>
          {units.length === 0 && <Panel className="px-4 py-6 text-center text-sm text-slate-500">没有匹配的任务，请调整筛选。</Panel>}
          {units.map((u) => (
            <Panel key={u} className="overflow-x-auto">
              <div className="border-b border-line bg-slate-50/70 px-5 py-3 text-[15px] font-bold text-slate-900">{u}</div>
              <div className={`grid ${COLS} gap-3 border-b border-line px-5 py-2.5 text-xs font-medium text-slate-500`}>
                <span>编号</span>
                <span>任务</span>
                <span>等级</span>
                <span>状态</span>
                <span>目标日期</span>
                <span>截止日期</span>
                <span className="text-right">反馈 / 评论</span>
              </div>
              <ul className="divide-y divide-line">
                {visible.filter((t) => t.unitCode === u).map((t) => {
                  const due = dueAt(t.dueDate)
                  return (
                    <li key={`${t.projectId}:${t.taskDefinitionId}`} className={`grid ${COLS} items-center gap-3 px-5 py-3 text-sm`}>
                      <span className="font-medium text-slate-800">{t.abbreviation || '—'}</span>
                      <div className="min-w-0 text-slate-800">
                        <span className="block break-words">{t.name || '未命名任务'}</span>
                        {t.visibility === 'unknown' && <span className="block text-[11px] text-amber-700">适用性待确认，请在 OnTrack 核对</span>}
                        {t.description && <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer">任务说明</summary><p className="mt-1 whitespace-pre-wrap break-words">{t.description}</p></details>}
                        <TaskMaterials task={t} identity={overviewQuery.cache?.identity ?? taskQuery.cache?.identity} />
                      </div>
                      <span className="text-slate-600">{onTrackGrade(t)}</span>
                      <span>
                        <Tag tone={onTrackTone(t.status)}>{onTrackStatus(t.status)}</Tag>
                      </span>
                      <span className="text-slate-600">{fmtDay(t.targetDueDate)}</span>
                      <span className="text-slate-600">
                        {fmtDay(t.dueDate)}
                        {t.status !== 'complete' && due !== null && <span className="block text-[11px] text-slate-500">{fmtCountdown(due, now)}</span>}
                      </span>
                      <TaskFeedback key={`${identity}:${t.projectId}:${t.taskDefinitionId}`} task={t} />
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
