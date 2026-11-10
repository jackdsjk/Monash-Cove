import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, ChevronDown, ChevronRight, Filter, GraduationCap, History, ListChecks, Mail, MessagesSquare, PlugZap, RefreshCw, Search, UserCheck, WifiOff, X } from 'lucide-react'
import { useStore } from '../store'
import { FIELD_LABEL, JUDGMENT_LABEL, SOURCE_LABEL, SOURCE_ORDER, type Item } from '../data/model'
import { EMPTY_FILTERS, isHiddenByUser, lastActivity, matchesNonSource, pickSuggestions, type BriefFilters, type View } from '../lib/brief'
import { useTime } from '../lib/time'
import { formatChangeValue } from '../components/ItemDrawer'
import { navigate } from '../lib/router'
import { Button, Course, DuePill, EmptyLine, IconTile, PageTitle, Panel, Role, Row, SectionHeader, Segmented, Select, Source, Tag } from '../components/ui'
import type { SourceId } from '../data/model'

const CHANGE_COLS = 'grid-cols-[96px_80px_72px_minmax(0,1fr)_72px_minmax(0,320px)]'

const SOURCE_ICON: Record<SourceId, { icon: typeof Mail; color: string }> = {
  gmail: { icon: Mail, color: 'text-[#c5221f]' },
  ed: { icon: MessagesSquare, color: 'text-[#6d4bc3]' },
  moodle: { icon: GraduationCap, color: 'text-[#d9730d]' },
  ontrack: { icon: ListChecks, color: 'text-[#0f766e]' },
}

const REASON_ICON: Record<string, { icon: typeof Mail; tone: 'red' | 'amber' | 'brand' }> = {
  '截止时间在 48 小时内': { icon: CalendarClock, tone: 'red' },
  '截止时间刚被改过': { icon: History, tone: 'amber' },
  教学人员发布: { icon: UserCheck, tone: 'brand' },
}
const ITEM_COLS = 'grid-cols-[96px_80px_72px_minmax(0,1fr)_240px]'
const NOCOURSE_COLS = 'grid-cols-[96px_80px_minmax(0,1fr)_240px]'

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function BriefPage() {
  const { fmtDate, fmtWhen, hm, timezone } = useTime()
  const { items, changes, marks, now, lastViewedAt, sources, courses, markWindowViewed, syncAll, syncSource, openItem, connectSource, restartSetup } = useStore()
  const online = useOnline()
  const [view, setView] = useState<View>('since')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [f, setF] = useState<BriefFilters>(EMPTY_FILTERS)
  const [pastShown, setPastShown] = useState(0)
  const [allShown, setAllShown] = useState(20)

  const windowStart = view === 'since' ? lastViewedAt : 0
  const syncing = sources.some((s) => s.state === 'syncing')
  const failed = sources.filter((s) => s.state === 'error')
  const unconnected = sources.filter((s) => !s.connected)
  const openSetup = () => {
    restartSetup()
    navigate('/setup')
  }

  const d = useMemo(() => {
    const act = new Map(items.map((i) => [i.id, lastActivity(i, changes)]))
    const a = (i: Item) => act.get(i.id) ?? i.firstSeenAt
    const visible = view === 'all' ? items : items.filter((i) => !isHiddenByUser(marks[i.id]))
    const hiddenCount = view === 'all' ? 0 : items.filter((i) => isHiddenByUser(marks[i.id]) && a(i) >= windowStart).length
    const filtered = visible.filter((i) => matchesNonSource(i, f, a(i), now))
    const windowItems = filtered.filter((i) => a(i) >= windowStart)
    const counts = Object.fromEntries(SOURCE_ORDER.map((s) => [s, windowItems.filter((i) => i.source === s).length])) as Record<string, number>
    const scoped = f.source ? windowItems.filter((i) => i.source === f.source) : windowItems
    const scopedIds = new Set(scoped.map((i) => i.id))
    const byId = new Map(items.map((i) => [i.id, i]))
    const windowChanges = changes
      .filter((c) => c.detectedAt >= windowStart && scopedIds.has(c.itemId))
      .sort((x, y) => y.detectedAt - x.detectedAt)
    const newItems = scoped
      .filter((i) => i.course !== '' && i.firstSeenAt >= windowStart)
      .sort((x, y) => y.firstSeenAt - x.firstSeenAt)
    const noCourse = scoped.filter((i) => i.course === '').sort((x, y) => y.firstSeenAt - x.firstSeenAt)
    const past =
      view === 'since'
        ? filtered
            .filter((i) => a(i) < windowStart && (!f.source || i.source === f.source))
            .sort((x, y) => a(y) - a(x))
        : []
    const suggestions = pickSuggestions(windowItems, changes, windowStart, now)

    // 一句话副标题所需的统计（不受来源筛选影响）
    const changedItemCount = new Set(changes.filter((c) => c.detectedAt >= windowStart && windowItems.some((i) => i.id === c.itemId)).map((c) => c.itemId)).size
    const newCount = windowItems.filter((i) => i.course !== '' && i.firstSeenAt >= windowStart).length
    const noCourseCount = windowItems.filter((i) => i.course === '').length

    return { windowItems, counts, windowChanges, byId, newItems, noCourse, past, suggestions, hiddenCount, changedItemCount, newCount, noCourseCount }
  }, [items, changes, marks, view, windowStart, f, now])

  const activeFilterCount = (f.course !== 'all' ? 1 : 0) + (f.range !== 'any' ? 1 : 0) + (f.query.trim() ? 1 : 0)

  const subtitle =
    items.length === 0
      ? '本地还没有数据。连接来源并完成同步后，这里会列出变化。'
      : view === 'since'
        ? d.windowItems.length === 0
          ? `自${fmtWhen(lastViewedAt, now)}以来没有新的变化。`
          : `自${fmtWhen(lastViewedAt, now)}以来，共 ${d.windowItems.length} 条有变化：${d.changedItemCount} 条有字段变更，${d.newCount} 条新增，${d.noCourseCount} 条没能归到课程。`
        : `本地共 ${d.windowItems.length} 条记录，${d.windowChanges.length} 处字段变更。`

  const markTags = (i: Item) => {
    const m = marks[i.id]
    return (
      <>
        {i.merged && <Tag tone="brand">合并 {i.merged.length + 1} 个来源</Tag>}
        {m?.read && <Tag>已读</Tag>}
        {i.completedAt && <Tag tone="green">已提交</Tag>}
        {m?.judgment && <Tag tone="amber">{JUDGMENT_LABEL[m.judgment]}</Tag>}
      </>
    )
  }

  const itemRow = (i: Item, withCourse = true) => (
    <Row key={i.id} onClick={() => openItem(i.id)} dim={marks[i.id]?.read}>
      <div className={`grid items-center gap-3 ${withCourse ? ITEM_COLS : NOCOURSE_COLS}`}>
        <span className="text-slate-500">{fmtWhen(i.firstSeenAt, now)}</span>
        <Source id={i.source} />
        {withCourse && <Course code={i.course} />}
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{i.title}</span>
          {markTags(i)}
        </span>
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-slate-600">{i.author.name}</span>
          <Role role={i.author.role} />
        </span>
      </div>
    </Row>
  )

  const tableHead = (cols: string, labels: string[]) => (
    <div className={`grid ${cols} gap-3 border-b border-line bg-slate-50/70 px-5 py-2.5 text-xs font-medium text-slate-500`}>
      {labels.map((l, idx) => (
        <span key={l} className={idx === labels.length - 1 && cols !== CHANGE_COLS ? 'text-right' : ''}>
          {l}
        </span>
      ))}
    </div>
  )

  return (
    <div className="mx-auto max-w-[1240px] px-10 py-8">
      {sources.some((source) => source.isFixture) && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          当前包含示例数据，不代表真实账号同步结果。请到来源页连接账号。
        </p>
      )}
      <p className="mb-1.5 text-[13px] font-medium text-brand-700">{fmtDate(now)}</p>
      <PageTitle
        title={view === 'since' ? '自上次查看' : '全部记录'}
        description={subtitle}
        actions={
          <>
            {!online && (
              <span className="mr-1 inline-flex items-center gap-1 text-xs text-slate-500">
                <WifiOff className="h-3.5 w-3.5" /> 离线，显示本地数据
              </span>
            )}
            <Segmented
              label="视图"
              value={view}
              onChange={(v) => {
                setView(v)
                setPastShown(0)
                setAllShown(20)
              }}
              options={[
                { value: 'since', label: '自上次查看' },
                { value: 'all', label: '全部' },
              ]}
            />
            <Button aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} variant={filtersOpen || activeFilterCount ? 'primary' : 'secondary'}>
              <Filter className="h-3.5 w-3.5" />
              筛选{activeFilterCount ? ` · ${activeFilterCount}` : ''}
            </Button>
            <Button onClick={() => syncAll()} disabled={syncing || !online || unconnected.length === sources.length}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同步中' : '同步'}
            </Button>
            <Button variant="primary" onClick={markWindowViewed} disabled={view !== 'since' || d.windowItems.length === 0}>
              标记本次已查看
            </Button>
          </>
        }
      />

      {filtersOpen && (
        <Panel className="mb-6 flex flex-wrap items-center gap-4 px-5 py-3.5">
          <Select
            label="课程"
            value={f.course}
            onChange={(v) => setF({ ...f, course: v })}
            options={[{ value: 'all', label: '全部课程' }, ...courses.map((c) => ({ value: c.code, label: c.code })), { value: '', label: '没能归到课程' }]}
          />
          <Select
            label="时间范围"
            value={f.range}
            onChange={(v) => setF({ ...f, range: v })}
            options={[
              { value: 'any', label: '不限' },
              { value: '24h', label: '24 小时内' },
              { value: '7d', label: '7 天内' },
            ]}
          />
          <label className="relative flex-1">
            <span className="sr-only">关键词</span>
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={f.query}
              onChange={(e) => setF({ ...f, query: e.target.value })}
              placeholder="关键词：标题、发布者、原文"
              className="h-9 w-full rounded-lg border border-line bg-slate-50 pr-3 pl-8 text-[13px] outline-none focus:border-brand-500 focus:bg-white"
            />
          </label>
          <Button variant="ghost" onClick={() => setF({ ...EMPTY_FILTERS, source: f.source })} disabled={!activeFilterCount}>
            清除
          </Button>
        </Panel>
      )}

      {failed.map((s) => (
        <div key={s.id} role="status" className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-[13px] text-red-900">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              <strong className="font-semibold">{SOURCE_LABEL[s.id]} 同步失败：</strong>
              {s.error}。{s.lastSuccessAt ? `${fmtWhen(s.lastSuccessAt, now)} 之后的内容可能不完整。` : ''}
            </span>
          </span>
          <Button size="sm" onClick={() => syncSource(s.id)} className="border-red-300 text-red-800">
            重新同步 {SOURCE_LABEL[s.id]}
          </Button>
        </div>
      ))}

      {unconnected.length === sources.length ? (
        <Panel className="mb-8 flex items-center gap-5 px-6 py-5">
          <IconTile icon={PlugZap} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-slate-900">还没有连接任何来源</p>
            <p className="mt-0.5 text-[13px] text-slate-600">连接 Gmail、Ed、Moodle 或 OnTrack 后，Cove 会在后台同步，并在这里列出变化。</p>
          </div>
          <Button onClick={() => navigate('/sources')}>在来源页连接</Button>
          <Button variant="primary" onClick={openSetup}>
            继续设置
          </Button>
        </Panel>
      ) : (
        unconnected.length > 0 && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-line bg-slate-50/70 px-5 py-2.5 text-[13px] text-slate-600">
            <span>
              还有 {unconnected.length} 个来源未连接：{unconnected.map((s) => SOURCE_LABEL[s.id]).join('、')}。它们的内容不会出现在这里。
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {unconnected.map((s) => (
                <Button key={s.id} size="sm" disabled={s.state === 'syncing'} onClick={() => connectSource(s.id)}>
                  {s.state === 'syncing' ? '连接中…' : `连接 ${SOURCE_LABEL[s.id]}`}
                </Button>
              ))}
            </span>
          </div>
        )
      )}

      <div className="space-y-9">
        {/* 2. 建议先看 */}
        {d.suggestions.length > 0 && (
          <section aria-labelledby="sg">
            <SectionHeader title="建议先看" hint="可能值得先看，理由都可以在原文中核对" />
            <div className="grid grid-cols-3 gap-4">
              {d.suggestions.map(({ item, reason }) => {
                const r = REASON_ICON[reason]
                return (
                  <button
                    key={item.id}
                    onClick={() => openItem(item.id)}
                    className="group flex flex-col rounded-2xl border border-line bg-white p-5 text-left transition-all hover:border-brand-300 hover:shadow-[0_4px_16px_-6px_rgba(36,111,196,0.25)]"
                  >
                    <span className="flex items-start gap-3.5">
                      <IconTile icon={r.icon} tone={r.tone} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] leading-snug font-semibold text-slate-900 group-hover:text-brand-800">{item.title}</span>
                        <span className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                          <Course code={item.course} />
                          <span className="text-slate-300">·</span>
                          <Source id={item.source} />
                        </span>
                      </span>
                    </span>
                    <span className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                      <Tag tone={r.tone === 'brand' ? 'brand' : r.tone}>{reason}</Tag>
                      {item.dueAt && <DuePill due={item.dueAt} now={now} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* 3. 按来源计数 */}
        <section>
          <SectionHeader
            title="按来源"
            right={
              f.source && (
                <button onClick={() => setF({ ...f, source: null })} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                  <X className="h-3 w-3" /> 取消仅看 {SOURCE_LABEL[f.source]}
                </button>
              )
            }
          />
          <div className="grid grid-cols-4 gap-4">
            {SOURCE_ORDER.map((s) => {
              const st = sources.find((x) => x.id === s)!
              const on = f.source === s
              const { icon: Icon, color } = SOURCE_ICON[s]
              return (
                <button
                  key={s}
                  aria-pressed={on}
                  onClick={() => setF({ ...f, source: on ? null : s })}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    on ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-line bg-white hover:border-slate-300 hover:shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)]'
                  }`}
                >
                  <span className="flex items-center justify-between text-sm font-medium text-slate-600">
                    {SOURCE_LABEL[s]}
                    <Icon className={`h-[18px] w-[18px] ${color}`} aria-hidden />
                  </span>
                  <span className="mt-3 block text-[32px] leading-none font-bold tracking-tight text-slate-900">{d.counts[s] ?? 0}</span>
                  <span className={`mt-3 flex items-center justify-between text-xs ${st.state === 'error' ? 'font-medium text-red-700' : 'text-slate-500'}`}>
                    <span>
                      {!st.connected
                        ? '未连接'
                        : st.state === 'syncing'
                          ? '同步中…'
                          : st.state === 'error'
                            ? '同步失败'
                            : st.lastSyncAt
                              ? `同步于 ${hm(st.lastSyncAt)}`
                              : '尚未同步'}
                    </span>
                    {on && <span className="font-medium text-brand-700">仅看此来源</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 4. 变更记录 */}
        <section>
          <SectionHeader title="变更记录" count={d.windowChanges.length} hint="字段前后对比" />
          <Panel className="overflow-hidden">
            {d.windowChanges.length === 0 ? (
              <EmptyLine>{view === 'since' ? '自上次查看没有字段级变更' : '没有字段级变更'}</EmptyLine>
            ) : (
              <>
                {tableHead(CHANGE_COLS, ['检测时间', '来源', '课程', '条目', '字段', '变更前 → 变更后'])}
                <div className="divide-y divide-line">
                  {d.windowChanges.map((c) => {
                    const i = d.byId.get(c.itemId)!
                    return (
                      <Row key={c.id} onClick={() => openItem(i.id)} dim={marks[i.id]?.read}>
                        <div className={`grid items-center gap-3 ${CHANGE_COLS}`}>
                          <span className="text-slate-500">{fmtWhen(c.detectedAt, now)}</span>
                          <Source id={i.source} />
                          <Course code={i.course} />
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{i.title}</span>
                            {markTags(i)}
                          </span>
                          <span className="text-slate-600">{FIELD_LABEL[c.field]}</span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-slate-500 line-through decoration-slate-400">{formatChangeValue(c, c.before, timezone)}</span>
                            <span className="text-slate-400" aria-label="改为">→</span>
                            <span className="truncate font-medium text-slate-900">{formatChangeValue(c, c.after, timezone)}</span>
                          </span>
                        </div>
                      </Row>
                    )
                  })}
                </div>
              </>
            )}
          </Panel>
        </section>

        {/* 5. 本次新增 / 全部条目 */}
        <section>
          <SectionHeader title={view === 'since' ? '本次新增' : '全部条目'} count={d.newItems.length} hint="按时间倒序" />
          <Panel className="overflow-hidden">
            {d.newItems.length === 0 ? (
              <EmptyLine>这段时间没有新增内容</EmptyLine>
            ) : (
              <>
                {tableHead(ITEM_COLS, ['同步时间', '来源', '课程', '标题', '发布者'])}
                <div className="divide-y divide-line">{(view === 'all' ? d.newItems.slice(0, allShown) : d.newItems).map((i) => itemRow(i))}</div>
                {view === 'all' && d.newItems.length > allShown && (
                  <div className="border-t border-line px-5 py-2.5 text-center">
                    <Button variant="ghost" size="sm" onClick={() => setAllShown((n) => n + 20)}>
                      再显示 20 条（还有 {d.newItems.length - allShown} 条）
                    </Button>
                  </div>
                )}
              </>
            )}
          </Panel>
        </section>

        {/* 6. 没能归到课程（默认展开；为空不渲染） */}
        {d.noCourse.length > 0 && (
          <section>
            <SectionHeader title="没能归到课程" count={d.noCourse.length} hint="没有匹配到你的课程，需要你自己判断是否相关" />
            <Panel className="overflow-hidden">
              {tableHead(NOCOURSE_COLS, ['同步时间', '来源', '标题', '发布者'])}
              <div className="divide-y divide-line">{d.noCourse.map((i) => itemRow(i, false))}</div>
            </Panel>
          </section>
        )}

        {/* 7. 过去的内容（默认折叠，每次 20 条） */}
        {view === 'since' && d.past.length > 0 && (
          <section>
            <button
              aria-expanded={pastShown > 0}
              onClick={() => setPastShown((n) => (n > 0 ? 0 : 20))}
              className={`flex w-full items-center gap-2.5 rounded-2xl border border-line px-5 py-3.5 text-left transition-colors hover:bg-slate-50 ${pastShown > 0 ? 'mb-3' : ''}`}
            >
              {pastShown > 0 ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
              <span className="text-[17px] font-bold tracking-tight text-slate-900">过去的内容</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{d.past.length}</span>
              <span className="text-[13px] text-slate-500">上次查看之前</span>
              <span className="ml-auto text-[13px] font-medium text-slate-600">{pastShown > 0 ? '收起' : '展开'}</span>
            </button>
            {pastShown > 0 && (
              <Panel className="overflow-hidden">
                {tableHead(ITEM_COLS, ['同步时间', '来源', '课程', '标题', '发布者'])}
                <div className="divide-y divide-line">{d.past.slice(0, pastShown).map((i) => itemRow(i))}</div>
                <div className="flex items-center justify-center gap-2 border-t border-line px-5 py-2.5">
                  {d.past.length > pastShown && (
                    <Button variant="ghost" size="sm" onClick={() => setPastShown((n) => n + 20)}>
                      再显示 20 条（还有 {d.past.length - pastShown} 条）
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setPastShown(0)}>
                    收起
                  </Button>
                </div>
              </Panel>
            )}
          </section>
        )}

        {d.hiddenCount > 0 && (
          <p className="text-[13px] text-slate-500">
            另有 {d.hiddenCount} 条你标记为「不重要」或「不是给我的」，已从此视图移除，
            <button onClick={() => setView('all')} className="text-brand-700 hover:underline">
              在「全部」中查看
            </button>
            。
          </p>
        )}
      </div>
    </div>
  )
}
