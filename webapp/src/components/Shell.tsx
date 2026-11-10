import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, Award, Bell, BookOpen, CalendarClock, CheckCircle2, ClipboardCheck, FolderOpen, Inbox, ListChecks, PackageOpen, PlugZap, RefreshCw, Search, Settings, User } from 'lucide-react'
import { useStore } from '../store'
import { navigate, type Route } from '../lib/router'
import { SOURCE_LABEL } from '../data/model'
import { useTime } from '../lib/time'
import { NAV } from './nav'

const ICONS: Record<string, typeof Inbox> = {
  '/': Inbox,
  '/deadlines': CalendarClock,
  '/grades': Award,
  '/materials': FolderOpen,
  '/ed': BookOpen,
  '/pack': PackageOpen,
  '/ontrack': ListChecks,
  '/attendance': ClipboardCheck,
  '/sources': PlugZap,
  '/settings': Settings,
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { hm } = useTime()
  const { sources, setPaletteOpen, setSummaryOpen, items, changes, lastViewedAt, openedSince, marks, settings } = useStore()
  const active = (i: (typeof items)[number], since: number) =>
    !marks[i.id]?.judgment && (i.firstSeenAt >= since || changes.some((c) => c.itemId === i.id && c.detectedAt >= since))
  const windowCount = items.filter((i) => active(i, lastViewedAt)).length
  const sinceOpenCount = items.filter((i) => active(i, openedSince)).length
  const mainRef = useRef<HTMLElement>(null)
  // 切换页面时回到顶部，避免停在上一页的滚动位置
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [route])
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

  const connected = sources.filter((s) => s.connected)
  const failed = sources.filter((s) => s.state === 'error')
  const syncing = sources.some((s) => s.state === 'syncing')
  const lastSync = Math.max(0, ...connected.map((s) => s.lastSuccessAt ?? 0))

  const group = (g: 'main' | 'work' | 'system') =>
    NAV.filter((n) => n.group === g).map((n) => {
      const on = route === n.route
      const Icon = ICONS[n.route]
      return (
        <a
          key={n.route}
          href={`#${n.route}`}
          aria-current={on ? 'page' : undefined}
          className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors ${
            on ? 'bg-brand-600 font-semibold text-white shadow-[0_2px_6px_-1px_rgba(36,111,196,0.45)]' : 'text-slate-600 hover:bg-white hover:text-slate-900'
          }`}
        >
          <Icon className={`h-[18px] w-[18px] ${on ? 'text-white' : 'text-slate-400'}`} />
          <span className="flex-1">{n.label}</span>
          {n.route === '/' && windowCount > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${on ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700'}`}>{windowCount}</span>
          )}
          {n.route === '/sources' && failed.length > 0 && (
            <AlertCircle className={`h-4 w-4 ${on ? 'text-white' : 'text-red-600'}`} aria-label="有来源同步失败" />
          )}
        </a>
      )
    })

  return (
    <div className="flex h-full">
      <aside className="flex w-[256px] shrink-0 flex-col border-r border-line bg-rail">
        <div className="flex items-center gap-3 border-b border-line px-5 py-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl font-bold text-white shadow-[0_4px_10px_-3px_rgba(36,111,196,0.5)]">
            C
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[17px] font-bold text-slate-900">Cove</p>
            <p className="mt-0.5 text-xs text-slate-600">Monash 信息变更记录</p>
            <p className="text-[11px] text-slate-400">Moodle · Ed · Gmail · OnTrack</p>
          </div>
        </div>

        <nav className="scroll-y flex-1 space-y-5 px-3 py-4" aria-label="主导航">
          <div className="space-y-1">{group('main')}</div>
          <div className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400">课程工作区</p>
            {group('work')}
          </div>
          <div className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400">系统</p>
            {group('system')}
          </div>
        </nav>

        <div className="p-3">
          <a href="#/settings" className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5 hover:border-slate-300">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-brand-500 text-white">
              <User className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-slate-900">{settings.name}</span>
              <span className="block truncate text-[11px] text-slate-500">{sources.find((s) => s.id === 'gmail')?.account}</span>
            </span>
            <Settings className="h-4 w-4 text-slate-400" aria-hidden />
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-6 border-b border-line px-8">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-10 w-full max-w-[520px] items-center gap-2.5 rounded-xl bg-slate-100 px-4 text-sm text-slate-500 transition-colors hover:bg-slate-200/70"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">搜索课程、标题、发布者，或跳转页面…</span>
            <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/sources')}
              className={`flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium transition-colors ${
                failed.length ? 'bg-red-50 text-red-800 hover:bg-red-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
              }`}
              aria-label="同步状态，打开来源页"
            >
              {syncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-brand-600" /> 正在同步
                </>
              ) : connected.length === 0 ? (
                <>
                  <PlugZap className="h-4 w-4 text-slate-500" /> 尚未连接来源
                </>
              ) : failed.length ? (
                <>
                  <AlertCircle className="h-4 w-4 text-red-600" /> {failed.map((s) => SOURCE_LABEL[s.id]).join('、')} 同步失败
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {connected.length} 个来源已同步{lastSync ? ` · ${hm(lastSync)}` : ''}
                </>
              )}
            </button>
            <button
              onClick={() => setSummaryOpen(true)}
              aria-label={`本次打开摘要${sinceOpenCount ? `，${sinceOpenCount} 条更新` : ''}`}
              title="本次打开摘要"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900"
            >
              <Bell className="h-[18px] w-[18px]" />
              {sinceOpenCount > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-slate-100" />}
            </button>
          </div>
        </header>

        <main ref={mainRef} className="scroll-y stable-gutter min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
