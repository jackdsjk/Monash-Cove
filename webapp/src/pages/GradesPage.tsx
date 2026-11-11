import { useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import { Button, EmptyLine, PageTitle, Panel, SectionHeader, Tag } from '../components/ui'
import { moodleGradesQuery } from '../data/repository'
import { useResourceQuery } from '../lib/use-resource-query'
import { CacheStatus } from '../components/CacheStatus'
import type { MoodleGradeCourse, MoodleGradeItem } from '../types'
import { BAND_LABEL, band, courseSummary, gradeBreakdown, gradeItemWeights, isGradeReleased, parseMoodleDate, percentage, splitCourseName, type CourseSummary, type GradeBand } from '../lib/grades'
import { useTime } from '../lib/time'

const BAND_TONE: Record<GradeBand, string> = {
  HD: 'bg-brand-50 text-brand-800 ring-brand-200',
  D: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  C: 'bg-amber-50 text-amber-800 ring-amber-200',
  P: 'bg-slate-100 text-slate-700 ring-slate-200',
  N: 'bg-red-50 text-red-700 ring-red-200',
}

function BandBadge({ band, size = 'md' }: { band: GradeBand; size?: 'md' | 'lg' }) {
  return (
    <span
      title={BAND_LABEL[band]}
      className={`inline-flex items-center justify-center rounded-lg font-bold ring-1 ring-inset ${BAND_TONE[band]} ${
        size === 'lg' ? 'h-9 min-w-11 px-2 text-base' : 'h-7 min-w-9 px-1.5 text-[13px]'
      }`}
    >
      {band}
    </span>
  )
}

function ProgressBar({ s }: { s: CourseSummary }) {
  const pct = (value: number) => `${s.total > 0 ? Math.max(0, Math.min(100, (value / s.total) * 100)) : 0}%`
  return (
    <div className="relative h-2.5 w-full overflow-visible">
      <div className="flex h-full w-full overflow-hidden rounded-full bg-slate-100">
        <span className="h-full bg-brand-500" style={{ width: pct(s.earned) }} />
        <span className="h-full bg-slate-300" style={{ width: pct(s.lost) }} />
        <span className="h-full bg-amber-300" style={{ width: pct(s.ungraded) }} />
        <span className="h-full bg-violet-300" style={{ width: pct(s.hidden) }} />
      </div>
      <span aria-hidden className="absolute -top-1 -bottom-1 left-1/2 w-0.5 rounded-full bg-slate-700" title="及格线 50%" />
    </div>
  )
}

function Legend({ hasWeights }: { hasWeights: boolean }) {
  const items: Array<[string, string]> = hasWeights
    ? [
        ['bg-brand-500', '已得分'],
        ['bg-slate-300', '已扣分'],
        ['bg-amber-300', '尚未评分'],
        ['bg-violet-300', '已发布但无法换算'],
      ]
    : [['bg-slate-100', '权重未知，暂不推算']]
  return (
    <div className="flex flex-wrap items-center gap-4 text-[13px] text-slate-600">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={`h-2 w-5 rounded-full ${color}`} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-slate-700" />
        及格线 50%
      </span>
    </div>
  )
}

function StatCard({ label, value, unit, children }: { label: string; value: string; unit?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[32px] leading-none font-bold tracking-tight text-slate-900">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      <div className="mt-3 text-xs text-slate-500">{children}</div>
    </div>
  )
}

/** 「代码 · 名称」；Moodle 没给代码时退回全名。 */
function courseLabel(course: MoodleGradeCourse) {
  const { code, name } = splitCourseName(course.courseName)
  return code ? `${code} · ${name}` : name
}

function scoreLabel(item: MoodleGradeItem) {
  if (item.grade === null) return isGradeReleased(item) ? item.gradeText ?? null : null
  return item.gradeMax === null ? String(item.grade) : `${item.grade} / ${item.gradeMax}`
}

export function GradesPage() {
  const { fmtWhen } = useTime()
  const query = useResourceQuery(moodleGradesQuery)
  const courses = query.data ?? null
  const error = query.error
  const load = query.refresh
  const [courseId, setCourseId] = useState<string | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)
  const [showMethod, setShowMethod] = useState(false)

  const summaries = useMemo(() => new Map((courses ?? []).map((course) => [course.courseId, courseSummary(course)])), [courses])
  const entries = useMemo(
    () => (courses ?? []).flatMap((course) => course.items.map((item) => ({ item, course }))),
    [courses],
  )
  const gradedEntries = useMemo(() => entries.filter(({ item }) => isGradeReleased(item)), [entries])
  const gradedItems = gradedEntries.length
  const totalItems = entries.length
  const progressPct = totalItems === 0 ? 0 : Math.round((gradedItems / totalItems) * 100)
  const latest = useMemo(
    () =>
      [...gradedEntries].sort((a, b) => (parseMoodleDate(b.item.gradedAt) ?? 0) - (parseMoodleDate(a.item.gradedAt) ?? 0))[0] ?? null,
    [gradedEntries],
  )
  const hasWeights = (courses ?? []).some((course) => summaries.get(course.courseId)?.hasWeights)

  const course = (courses ?? []).find((c) => c.courseId === courseId) ??
    courses?.find((c) => c.items.some(isGradeReleased)) ?? courses?.find((c) => c.items.length > 0) ?? courses?.[0] ?? null
  const summary = course ? summaries.get(course.courseId) ?? courseSummary(course) : null
  const firstItem = course?.items[0] ?? null
  const item = course?.items.find((candidate) => candidate.id === itemId) ?? firstItem
  const itemPct = item ? percentage(item) : null
  const itemBand = itemPct === null ? null : band(itemPct)
  const latestAt = latest ? parseMoodleDate(latest.item.gradedAt) : null

  const header = (
    <>
      <PageTitle
        title="成绩"
        description="来自 Moodle 成绩册。成绩和反馈以 Moodle 原文为准。"
        actions={<Button disabled={query.loading} onClick={load}>刷新成绩</Button>}
      />
      <CacheStatus cache={query.cache} loading={query.loading} error={error} />
    </>
  )

  if (courses === null && !error) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {header}
        <Panel className="p-8">
          <p className="text-sm font-semibold text-slate-900">正在读取 Moodle 成绩册…</p>
          <p className="mt-1.5 text-sm text-slate-600">成绩册按课程逐页读取，可能需要十几秒。</p>
        </Panel>
      </div>
    )
  }

  if (courses === null) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {header}
        <Panel className="p-8">
          <p className="text-sm font-semibold text-slate-900">没能读到 Moodle 成绩册</p>
          <p className="mt-1.5 text-sm text-slate-600">{error ?? '本地服务没有返回数据。'}</p>
          <p className="mt-1.5 text-sm text-slate-500">如果是会话失效，请到「来源」页重新连接 Moodle，然后回到这里重试。</p>
          <Button className="mt-4" onClick={load}>
            重试
          </Button>
        </Panel>
      </div>
    )
  }

  if (courses.length === 0 || !course || !summary) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {header}
        <Panel className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">Moodle 成绩册里还没有可显示的成绩</p>
          <p className="mt-1.5 text-sm text-slate-600">读取成功，但已选课程的评分表里没有评分项，或成绩尚未发布。</p>
          <Button className="mt-4" onClick={load}>
            重新读取
          </Button>
        </Panel>
      </div>
    )
  }

  const { code, name } = splitCourseName(course.courseName)
  const breakdown = gradeBreakdown(course)
  const itemWeights = gradeItemWeights(course, breakdown)
  // 及格线按整门课的 100% 算。Moodle 没给全权重时算不出差距，按设计稿的空态显示「—」。
  const weightsKnown = summary.weightsComplete && breakdown.hiddenWeight === 0
  // 「已得多少」只需要已评分项的权重，是事实；「还差多少及格」才需要完整权重，是推断。两者分开。
  const earnedKnown = summary.hasWeights

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      {header}

      {/* 概览 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="WAM" value="—">
          Moodle 成绩册不提供历史学期与学分，无法计算。
        </StatCard>
        <StatCard label="GPA" value="—">
          同样缺历史学期与学分，不做估算。
        </StatCard>
        <StatCard label="评分进度" value={`${progressPct}%`}>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${progressPct}%` }} />
          </div>
          已评分 {gradedItems} / {totalItems} 项
        </StatCard>
        <StatCard label="已发布成绩" value={String(gradedItems)} unit="项">
          {latest ? (
            <>
              最近：{courseLabel(latest.course)} · {latest.item.name}
              {latestAt !== null ? (
                <span className="mt-0.5 block">{fmtWhen(latestAt, Date.now())}</span>
              ) : (
                latest.item.gradedAt && <span className="mt-0.5 block">{latest.item.gradedAt}</span>
              )}
            </>
          ) : (
            '还没有已发布的成绩。'
          )}
        </StatCard>
      </div>

      <button onClick={() => setShowMethod((v) => !v)} aria-expanded={showMethod} className="mt-3 inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-brand-700">
        <Info className="h-3.5 w-3.5" />
        WAM、GPA 和等级是怎么算的
      </button>
      {showMethod && (
        <div className="mt-2 rounded-xl border border-line bg-slate-50 px-5 py-3.5 text-[13px] leading-relaxed text-slate-700">
          <p>WAM 和 GPA 需要历史学期的成绩与学分。Moodle 成绩册接口不提供这两项，所以这里不做估算，只显示「—」。</p>
          <p>当前平均：沿用 Muster 的权重折算，只算已知评估中已发布且可换算的分数。Assessments 分类内优先保留名称明确的百分比，其余均分剩余权重。缺少权重或满分时保留原始成绩；未评分不当 0 分。</p>
          <p>当前等级：把当前平均对应到 Monash 等级区间（HD ≥ 80、D ≥ 70、C ≥ 60、P ≥ 50），只代表已评分部分，不是最终成绩。</p>
          <p>
            进度条按整门课 100% 展示已得分、已扣分和待评分权重；未公开的权重留空，不拉伸成完整总评。只有权重完整且已评分分数可读时才推算距 50 分还差多少；课程 hurdle 仍需查阅原要求。
          </p>
        </div>
      )}

      {/* 各课程 */}
      <section className="mt-9">
        <SectionHeader title="各课程" right={<Legend hasWeights={hasWeights} />} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {courses.map((entry) => {
            const s = summaries.get(entry.courseId) ?? courseSummary(entry)
            const on = entry.courseId === course.courseId
            const label = splitCourseName(entry.courseName)
            return (
              <button
                key={entry.courseId}
                aria-pressed={on}
                onClick={() => {
                  setCourseId(entry.courseId)
                  setItemId(null)
                }}
                className={`rounded-2xl border p-5 text-left transition-all ${
                  on ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500' : 'border-line bg-white hover:border-slate-300 hover:shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-slate-900">
                      {label.code && <>{label.code} <span className="font-semibold text-slate-700">· </span></>}
                      <span className="font-semibold text-slate-700">{label.name}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-slate-500">
                      已评分 {s.gradedCount} / {s.count} 项{s.hasWeights ? ` · 已评占 ${Number(s.gradedWeight.toFixed(2))}%` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {s.current !== null && (
                      <span className="text-right">
                        <span className="block text-[15px] font-bold text-slate-900">{s.current.toFixed(1)}%</span>
                        <span className="block text-[11px] text-slate-500">已知评估均分</span>
                      </span>
                    )}
                    {s.band && <BandBadge band={s.band} size="lg" />}
                  </div>
                </div>
                <div className="mt-4">
                  <ProgressBar s={s} />
                </div>
                <p className="mt-3 truncate text-[13px] text-slate-600">
                  已得 {s.hasWeights ? `${s.earned.toFixed(1)} 个总评分${s.weightsComplete ? '' : '（仅已知权重）'}` : s.count === 0 ? '—（暂无评分项）' : '—（未取得评估权重，见原始成绩）'}
                  {s.hasWeights && ` / 已评 ${Number(s.gradedWeight.toFixed(2))}%`}
                  {s.ungradedCount > 0 && (
                    <>
                      <span className="mx-1.5 text-slate-300">·</span>
                      未评分 {s.ungradedCount} 项
                    </>
                  )}
                </p>
                {s.reported !== null && <p className="mt-1 text-xs text-slate-500">Moodle 公布总评：{s.reported.toFixed(1)}%（以原成绩册为准）</p>}
              </button>
            )
          })}
        </div>
      </section>

      {/* 选中课程的明细 */}
      <section className="mt-9">
        <SectionHeader title={code ? `${code} 评估项目` : `${name} 评估项目`} count={course.items.length} hint={code ? name : undefined} />
        <p className="mb-3 text-[13px] text-slate-500">
          {course.assessmentStructure?.some((row) => (row.categoryWeight ?? row.weight ?? 0) > 0)
            ? '权重来自 Assessments，分类内按 Muster 规则分摊；以课程要求为准。未关联到 Grades 的资料不作为已发布成绩。'
            : summary.hasWeights ? '权重来自 Moodle 成绩册。' : '尚未取得可用权重，无法推算总评；下方仍显示 Moodle 已发布的原始成绩。'}
        </p>
        {course.assessmentWarning && <p role="status" className="mb-3 text-[13px] text-amber-800">{course.assessmentWarning}</p>}
        <Panel className="grid grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 overflow-x-auto border-r border-line">
            <div className="grid min-w-[600px] grid-cols-[minmax(0,1fr)_56px_120px_96px_20px] gap-3 border-b border-line bg-slate-50/70 px-5 py-2.5 text-xs font-medium text-slate-500">
              <span>项目</span>
              <span className="text-right">权重</span>
              <span>评分状态</span>
              <span className="text-right">成绩</span>
              <span />
            </div>
            {course.items.length === 0 ? (
              <EmptyLine>这门课的评分表里没有评分项。</EmptyLine>
            ) : (
              <ul className="divide-y divide-line">
                {course.items.map((row) => {
                  const on = row.id === item?.id
                  const score = scoreLabel(row)
                  const weight = itemWeights.get(row.id) ?? null
                  return (
                    <li key={row.id}>
                      <button
                        onClick={() => setItemId(row.id)}
                        aria-current={on ? 'true' : undefined}
                        className={`grid min-w-[600px] w-full grid-cols-[minmax(0,1fr)_56px_120px_96px_20px] items-center gap-3 px-5 py-3 text-left text-sm transition-colors ${
                          on ? 'bg-brand-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className={`block truncate ${on ? 'font-semibold text-brand-900' : 'text-slate-800'}`}>{row.name}</span>
                          {row.gradedAt && <span className="block truncate text-xs text-slate-500">评分于 {row.gradedAt}</span>}
                        </span>
                        <span className="text-right text-slate-600">{weight === null ? '—' : `${Number(weight.toFixed(2))}%`}</span>
                        <span>
                          <Tag tone={isGradeReleased(row) ? 'green' : 'slate'}>{isGradeReleased(row) ? '已评分' : '未评分'}</Tag>
                        </span>
                        <span className="text-right font-semibold text-slate-900">
                          {score === null ? <span className="font-normal text-slate-400">—</span> : score}
                        </span>
                        <ChevronRight className={`h-4 w-4 ${on ? 'text-brand-600' : 'text-slate-300'}`} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-line bg-slate-50/50 px-5 py-3 text-[13px] text-slate-600">
              <span>
                本课程已得 <strong className="font-semibold text-slate-900">{earnedKnown ? `${breakdown.earned.toFixed(1)} / 100` : '—'}</strong>
                {earnedKnown && !summary.weightsComplete && <span>（已知权重 {breakdown.totalWeight.toFixed(1)}%）</span>}
              </span>
              <span>
                距及格线还差 <strong className="font-semibold text-slate-900">{weightsKnown ? `${breakdown.needed.toFixed(1)}%` : '—'}</strong>
                {weightsKnown && breakdown.requiredAverage !== null && (
                  <span className="text-slate-500">
                    ，剩余 {Number(breakdown.pendingWeight.toFixed(2))}% 中需拿到 {breakdown.requiredAverage.toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
          </div>

          {item ? (
            <ItemDetail item={item} course={course} weight={itemWeights.get(item.id) ?? null} band={itemBand} code={code} name={name} />
          ) : (
            <div className="flex flex-col p-6">
              <p className="text-sm text-slate-500">这门课没有可显示的评分项。</p>
            </div>
          )}
        </Panel>
        {summary.hasWeights && <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          {breakdown.categories.map((category) => <span key={category.key} className="rounded-lg border border-line px-3 py-2">
            {category.name} · {Number(category.weight.toFixed(2))}%
            {category.items.some((entry) => entry.placeholder) && ' · 评分项目尚未发布'}
          </span>)}
          {breakdown.hiddenWeight > 0 && <span>紫色：成绩已发布但无法换算，共 {Number(breakdown.hiddenWeight.toFixed(2))}% 权重。</span>}
        </div>}
      </section>
    </div>
  )
}

function ItemDetail({ item, course, weight, band, code, name }: { item: MoodleGradeItem; course: MoodleGradeCourse; weight: number | null; band: GradeBand | null; code: string; name: string }) {
  const pct = percentage(item)
  const graded = isGradeReleased(item)

  return (
    <div className="flex flex-col p-6">
      <p className="text-xs text-slate-500">
        {code || splitCourseName(course.courseName).name}
        {code ? ` · ${name}` : ''} · 占总评 {weight === null ? '—' : `${Number(weight.toFixed(2))}%`}
      </p>
      <h3 className="mt-1 text-[15px] leading-snug font-bold text-slate-900">{item.name}</h3>

      {graded ? (
        <>
          <div className="mt-4 flex items-end justify-between rounded-xl bg-slate-50 px-4 py-3.5">
            <div>
              <p className="text-[28px] leading-none font-bold tracking-tight text-slate-900">
                {item.grade ?? item.gradeText}
                {item.grade !== null && <span className="ml-1 text-base font-semibold text-slate-500">/ {item.gradeMax === null ? '—' : item.gradeMax}</span>}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                {pct === null ? '已发布原始成绩，无法换算百分比' : `${pct.toFixed(1)}%`}
                {pct !== null && weight !== null && ` · 计入总评 ${((pct / 100) * weight).toFixed(2)}%`}
              </p>
            </div>
            {band && <BandBadge band={band} />}
          </div>

          {item.feedback && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-slate-500">老师反馈</p>
              <blockquote className="rounded-r-lg border-l-2 border-brand-400 bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-800">
                {item.feedback}
              </blockquote>
            </div>
          )}

          {item.gradedAt && (
            <p className="mt-4 text-xs text-slate-500">评分时间（Moodle 原文）：{item.gradedAt}</p>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-[13px] text-slate-600">
          <p className="font-medium text-slate-800">未评分</p>
          <p className="mt-1.5 text-slate-500">成绩发布后会出现在这里。</p>
        </div>
      )}

      <p className="mt-6 rounded-lg border border-line px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">
        成绩和反馈以 Moodle 成绩册原文为准。本页不提供直达链接，避免连到错误的课程或学期。
      </p>
    </div>
  )
}
