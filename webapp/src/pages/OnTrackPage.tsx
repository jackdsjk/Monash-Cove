import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { onTrackOverviewQuery, onTrackTasksQuery } from '../data/repository'
import type { OnTrackTaskView } from '../types'
import { useResourceQuery } from '../lib/use-resource-query'
import { CacheStatus } from '../components/CacheStatus'
import { fmtCountdown } from '../lib/time'
import { fetchOnTrackMaterial, type OnTrackMaterialKind } from '../lib/ontrack-materials'
import { Button, PageTitle, Panel, Tag } from '../components/ui'

type OnTrackStatus =
  | '尚未开始'
  | 'Not Started'
  | 'Working On It'
  | 'Ready for Feedback'
  | 'Fix and Resubmit'
  | 'Discuss'
  | 'Complete'
  | 'Need Help'
  | 'Ready to Mark'
  | 'Assess in Portfolio'

const TONE: Record<OnTrackStatus, 'slate' | 'brand' | 'green' | 'amber' | 'red'> = {
  '尚未开始': 'slate',
  'Not Started': 'slate',
  'Working On It': 'brand',
  'Ready for Feedback': 'brand',
  'Fix and Resubmit': 'amber',
  Discuss: 'amber',
  Complete: 'green',
  'Need Help': 'amber',
  'Ready to Mark': 'brand',
  'Assess in Portfolio': 'amber',
}

/** Doubtfire 的状态码 → 界面文案；未知状态按原始状态码显示，不伪造状态。 */
const STATUS: Record<string, OnTrackStatus> = {
  not_instantiated: '尚未开始',
  not_started: 'Not Started',
  working_on_it: 'Working On It',
  need_help: 'Need Help',
  ready_for_feedback: 'Ready for Feedback',
  ready_to_mark: 'Ready to Mark',
  discuss: 'Discuss',
  assess_in_portfolio: 'Assess in Portfolio',
  fix_and_resubmit: 'Fix and Resubmit',
  complete: 'Complete',
}

const COLS = 'min-w-[1000px] grid-cols-[64px_minmax(0,1fr)_48px_150px_170px_170px_56px]'

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

/** OnTrack 的缩写以等级字母结尾，如 1.1P / 5.1D / 2.1HD。 */
function gradeOf(task: OnTrackTaskView): string {
  const match = /(HD|[PCD])$/i.exec(task.abbreviation.trim())
  return match ? match[1].toUpperCase() : '—'
}

function humanize(status: string): string {
  const text = status.replace(/_/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—'
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

export function OnTrackPage() {
  const { now } = useStore()
  const overviewQuery = useResourceQuery(onTrackOverviewQuery)
  const taskQuery = useResourceQuery(onTrackTasksQuery)
  const overview = overviewQuery.data
  const tasks = taskQuery.data?.tasks ?? []
  const error = overviewQuery.error ?? overview?.error ?? (overview?.connected ? taskQuery.error : null)
  const loading = !error && (overview === undefined || overview.connected && taskQuery.data === undefined)
  const refresh = () => { overviewQuery.refresh(); taskQuery.refresh() }

  const units = Array.from(new Set(tasks.map((t) => t.unitCode)))

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageTitle title="OnTrack 任务" description="查看任务状态、日期、Worksheet 和任务资料，下载已有提交文件。在 OnTrack 中修改后，下次同步会更新到这里。"
        actions={<Button disabled={overviewQuery.loading || taskQuery.loading} onClick={refresh}>刷新任务</Button>} />
      <CacheStatus cache={overviewQuery.cache ?? taskQuery.cache} loading={overviewQuery.loading || taskQuery.loading} error={error ?? null} />
      {loading ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">正在读取 OnTrack…</Panel>
      ) : error && !overview && tasks.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">OnTrack 暂时不可用：{error}。到「来源」页可以查看登录方式。</Panel>
      ) : !overview?.connected ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">OnTrack 未连接。请先在「来源」中连接。</Panel>
      ) : units.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-[13px] text-slate-500">OnTrack 里还没有任务。</Panel>
      ) : (
        <div className="space-y-5">
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
                <span className="text-right">评论</span>
              </div>
              <ul className="divide-y divide-line">
                {tasks.filter((t) => t.unitCode === u).map((t) => {
                  const due = dueAt(t.dueDate)
                  const status = STATUS[t.status]
                  return (
                    <li key={`${t.projectId}:${t.taskDefinitionId}`} className={`grid ${COLS} items-center gap-3 px-5 py-3 text-sm`}>
                      <span className="font-medium text-slate-800">{t.abbreviation || '—'}</span>
                      <div className="min-w-0 text-slate-800">
                        <span className="block break-words">{t.name || '未命名任务'}</span>
                        {t.visibility === 'unknown' && <span className="block text-[11px] text-amber-700">适用性待确认，请在 OnTrack 核对</span>}
                        {t.description && <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer">任务说明</summary><p className="mt-1 whitespace-pre-wrap break-words">{t.description}</p></details>}
                        <TaskMaterials task={t} identity={overviewQuery.cache?.identity ?? taskQuery.cache?.identity} />
                      </div>
                      <span className="text-slate-600">{gradeOf(t)}</span>
                      <span>
                        <Tag tone={status ? TONE[status] : 'slate'}>{status ?? humanize(t.status)}</Tag>
                      </span>
                      <span className="text-slate-600">{fmtDay(t.targetDueDate)}</span>
                      <span className="text-slate-600">
                        {fmtDay(t.dueDate)}
                        {status !== 'Complete' && due !== null && <span className="block text-[11px] text-slate-500">{fmtCountdown(due, now)}</span>}
                      </span>
                      <span className="text-right text-slate-600">{t.numNewComments}</span>
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
