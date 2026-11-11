import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CircleAlert, Copy, Download, FileJson, FileText, RefreshCw } from 'lucide-react'
import { Button, DuePill, EmptyLine, PageTitle, Panel, Segmented } from '../components/ui'
import { fetchPack } from '../data/repository'
import {
  DEFAULT_OPTIONS,
  MISSING_DATA,
  assignmentPackStatus,
  filterAssignmentPacks,
  toAssignmentPacks,
  toJSON,
  toMarkdown,
  type PackOptions,
  type PackStatus,
} from '../lib/pack'
import { navigate } from '../lib/router'
import { useTime } from '../lib/time'
import { useStore } from '../store'
import type { PackResponse } from '../types'

type Scope = 'one' | 'course' | 'all'

const OPTION_LABELS: { key: keyof PackOptions; label: string; hint: string }[] = [
  { key: 'spec', label: '作业要求与附件清单', hint: 'Moodle 原文 · 附件未提供' },
  { key: 'rubric', label: '评分标准', hint: 'Moodle 没有提供' },
  { key: 'changes', label: '变更记录', hint: '截止时间、正文等改动' },
]

export function PackPage() {
  const { fmtDue, timezone } = useTime()
  const { now } = useStore()
  const [payload, setPayload] = useState<PackResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [id, setId] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('one')
  const [format, setFormat] = useState<'md' | 'json'>('md')
  const [opts, setOpts] = useState<PackOptions>(DEFAULT_OPTIONS)
  const [copied, setCopied] = useState(false)
  const [courseFilter, setCourseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<PackStatus>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPayload(await fetchPack())
    } catch (cause) {
      // Keep whatever was already on screen; only the banner changes.
      setError(cause instanceof Error ? cause.message : '无法读取作业资料')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const packs = useMemo(() => (payload ? toAssignmentPacks(payload) : []), [payload])
  const visiblePacks = useMemo(() => filterAssignmentPacks(packs, { courseId: courseFilter, status: statusFilter, query: search }, now), [packs, courseFilter, statusFilter, search, now])
  const current = visiblePacks.find((p) => p.id === id) ?? visiblePacks[0] ?? null
  const courses = useMemo(() => [...new Map(packs.map((pack) => [pack.courseId, pack.courseName || pack.course])).entries()], [packs])

  const scoped = useMemo(() => {
    if (!current) return []
    if (scope === 'one') return [current]
    if (scope === 'course') return visiblePacks.filter((p) => p.courseId === current.courseId)
    return visiblePacks
  }, [visiblePacks, current, scope])

  const output = useMemo(() => {
    if (!current) return ''
    return format === 'md' ? toMarkdown(scoped, opts, now, timezone) : toJSON(scoped, opts, now)
  }, [scoped, opts, format, now, current, timezone])

  const filename = current
    ? `cove-${scope === 'all' ? 'all-assignments' : scope === 'course' ? current.course.toLowerCase() : current.id.replace(/[^A-Za-z0-9._-]+/g, '-')}.${format}`
    : `cove-pack.${format}`

  const download = () => {
    const url = URL.createObjectURL(new Blob([output], { type: format === 'md' ? 'text/markdown' : 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const copy = () => {
    const writing = navigator.clipboard?.writeText(output)
    void writing?.catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const banner = error && (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  )
  const verification = payload?.verificationWarning && (
    <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>{payload.verificationWarning}</p>
      <Button className="mt-2" size="sm" onClick={() => navigate('/grades')}>查看成绩册</Button>
    </div>
  )

  if (packs.length === 0) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <PageTitle
          title="Moodle 作业资料"
          description="仅列出 Grades 成绩册确认的 Moodle 评分作业与测验，支持按课程和状态筛选及导出。"
        />
        {banner}
        {verification}
        <Panel>
          <EmptyLine>
            <p className="font-semibold text-slate-700">
              {loading ? '正在读取 Moodle 作业…' : error ? '读取作业失败，见上方提示。' : '还没有可以打包的作业'}
            </p>
            {!loading && (
              <p className="mx-auto mt-1 max-w-[52ch]">
                {error
                  ? '稍后重试，或到「成绩」检查成绩册读取情况。'
                  : '只显示能与 Grades 评分项关联的作业或测验。请同步课程资料并读取成绩册；普通练习和资料不会列入。'}
              </p>
            )}
            {!loading && (
              <div className="mt-3 flex justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => navigate('/sources')}>
                  打开来源
                </Button>
                <Button variant="primary" size="sm" onClick={() => void load()}>
                  <RefreshCw className="h-3.5 w-3.5" /> 重新读取
                </Button>
              </div>
            )}
          </EmptyLine>
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <PageTitle
        title="Moodle 作业资料"
        description="仅列出 Grades 成绩册确认的 Moodle 评分作业与测验，支持按课程和状态筛选及导出。"
      />

      {banner}
      {verification}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel className="overflow-hidden">
            <p className="border-b border-line bg-slate-50/70 px-5 py-3 text-sm font-bold text-slate-900">选择作业</p>
            <div className="space-y-3 border-b border-line px-5 py-4">
              <label className="block text-xs font-medium text-slate-600">
                搜索作业
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="作业名称或课程" className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-800" />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="block text-xs font-medium text-slate-600">
                  课程
                  <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="">全部课程</option>
                    {courses.map(([courseId, name]) => <option key={courseId} value={courseId}>{name}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  作业状态
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PackStatus)} className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="all">全部状态</option>
                    <option value="upcoming">未截止</option>
                    <option value="overdue">已截止</option>
                    <option value="completed">已提交</option>
                    <option value="undated">无截止时间</option>
                  </select>
                </label>
              </div>
              <p aria-live="polite" className="text-xs text-slate-500">显示 {visiblePacks.length} / {packs.length} 项作业，导出范围遵循当前筛选。</p>
            </div>
            <ul aria-label="Moodle 作业列表" className="scroll-y h-[clamp(420px,65vh,760px)] divide-y divide-line">
              {visiblePacks.map((p) => {
                const on = p.id === current?.id
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setId(p.id)}
                      aria-current={on ? 'true' : undefined}
                      className={`w-full px-5 py-3 text-left transition-colors ${on ? 'bg-brand-50/70' : 'hover:bg-slate-50'}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-brand-700">{p.course}</span>
                        {assignmentPackStatus(p, now) === 'completed' ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-700">已提交</span>
                        ) : p.dueAt === null ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-slate-500">
                            无截止时间
                          </span>
                        ) : (
                          <DuePill due={p.dueAt} now={now} />
                        )}
                      </span>
                      <span className={`mt-1 block break-words text-sm ${on ? 'font-semibold text-brand-900' : 'text-slate-800'}`}>
                        {p.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {p.changes.length} 处变更 ·{' '}
                        {p.dueAt === null ? 'Moodle 未提供截止时间' : `截止 ${fmtDue(p.dueAt)}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {visiblePacks.length === 0 && <div className="border-t border-line px-5 py-5 text-sm text-slate-500">
              <p>没有符合筛选条件的作业。</p>
              <Button className="mt-3" size="sm" onClick={() => { setCourseFilter(''); setStatusFilter('all'); setSearch('') }}>清除筛选</Button>
            </div>}
          </Panel>

          <Panel className="p-5">
            <p className="text-sm font-bold text-slate-900">包含内容</p>
            <div className="mt-3 space-y-2.5">
              {OPTION_LABELS.map((o) => (
                <label key={o.key} className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={opts[o.key]}
                    onChange={(e) => setOpts({ ...opts, [o.key]: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="text-slate-800">{o.label}</span>
                    <span className="ml-1.5 text-slate-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              评分标准：{MISSING_DATA}。勾选后导出内容会如实写明。OnTrack 的任务书和资料请在「OnTrack 任务」中查看。
            </p>
          </Panel>
        </div>

        <Panel className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="范围"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'one', label: '当前作业' },
                  { value: 'course', label: current ? `${current.course} 筛选结果` : '当前课程' },
                  { value: 'all', label: '全部筛选结果' },
                ]}
              />
              <Segmented
                label="格式"
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'md', label: 'Markdown' },
                  { value: 'json', label: 'JSON' },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button disabled={!current} onClick={copy}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? '已复制' : '复制'}
              </Button>
              <Button variant="primary" disabled={!current} onClick={download}>
                <Download className="h-4 w-4" />
                下载 .{format}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 break-all border-b border-line bg-slate-50/60 px-5 py-2 text-xs text-slate-500">
            {format === 'md' ? <FileText className="h-3.5 w-3.5" /> : <FileJson className="h-3.5 w-3.5" />}
            {filename} · {scoped.length} 项作业 · {output.length.toLocaleString()} 字符
          </div>
          <pre className="scroll-y h-[calc(100vh-290px)] min-h-[620px] px-6 py-5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-slate-800">
            {output || '请调整筛选条件，选择要查看的 Moodle 作业。'}
          </pre>
        </Panel>
      </div>
    </div>
  )
}
