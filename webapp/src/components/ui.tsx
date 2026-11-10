import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { ROLE_LABEL, SOURCE_LABEL, type AuthorRole, type SourceId } from '../data/model'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 border border-brand-600 shadow-[0_1px_2px_rgba(29,90,161,0.25)]',
  secondary: 'bg-white text-slate-700 border border-line hover:bg-slate-50 hover:border-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm'
      } ${VARIANT[variant]} ${className}`}
    />
  )
}

export const SOURCE_MARK: Record<SourceId, string> = {
  gmail: 'bg-[#c5221f]',
  ed: 'bg-[#6d4bc3]',
  moodle: 'bg-[#d9730d]',
  ontrack: 'bg-[#0f766e]',
}

export function Source({ id, className = '' }: { id: SourceId; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-slate-600 ${className}`}>
      <span aria-hidden className={`h-2 w-2 rounded-[2px] ${SOURCE_MARK[id]}`} />
      {SOURCE_LABEL[id]}
    </span>
  )
}

export function Course({ code }: { code: string }) {
  if (!code) return <span className="text-slate-400">—</span>
  return <span className="font-medium text-slate-800">{code}</span>
}

export function Role({ role }: { role: AuthorRole }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
        role === 'staff' ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 ring-inset' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {ROLE_LABEL[role]}
    </span>
  )
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'brand' | 'green' | 'amber' | 'red' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 max-w-full rounded-2xl border border-line bg-white ${className}`}>{children}</div>
}

export function SectionHeader({
  title,
  count,
  hint,
  right,
}: {
  title: string
  count?: number
  hint?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="max-w-full shrink-0 break-words text-[17px] font-bold tracking-tight text-slate-900">{title}</h2>
        {count !== undefined && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{count}</span>
        )}
        {hint && <span className="min-w-0 max-w-full break-words text-[13px] text-slate-500">{hint}</span>}
      </div>
      {right}
    </div>
  )
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="px-5 py-7 text-center text-sm text-slate-500">{children}</div>
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-6">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1.5 break-words text-[15px] text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 text-[13px] transition-colors ${
            value === o.value ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <label className="inline-flex min-w-0 max-w-full items-center gap-2 text-[13px] text-slate-600">
      <span className="shrink-0 whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 min-w-0 max-w-full flex-1 rounded-lg border border-line bg-white px-2.5 text-[13px] text-slate-800 outline-none focus:border-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** 表格样式的一行一条 */
export function Row({
  onClick,
  children,
  dim,
  label,
}: {
  onClick?: () => void
  children: ReactNode
  dim?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`block min-w-[800px] w-full px-5 py-3 text-left text-sm transition-colors hover:bg-brand-50/50 ${
        dim ? 'text-slate-500' : 'text-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

const TILE_TONE = {
  brand: 'bg-brand-50 text-brand-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-500',
}

/** 圆角图标底块 */
export function IconTile({ icon: Icon, tone = 'brand', size = 'md' }: { icon: ComponentType<{ className?: string }>; tone?: keyof typeof TILE_TONE; size?: 'sm' | 'md' }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-xl ${TILE_TONE[tone]} ${size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'}`}>
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
    </span>
  )
}

const HOUR = 3600_000

/** 截止倒计时标签：按剩余时间着色，文字本身也说明状态 */
export function DuePill({ due, now }: { due: number; now: number }) {
  const ms = due - now
  const days = Math.floor(Math.abs(ms) / (24 * HOUR))
  const hours = Math.floor((Math.abs(ms) % (24 * HOUR)) / HOUR)
  const label = ms <= 0 ? (days > 0 ? `已截止 ${days} 天` : `已截止 ${Math.max(1, hours)} 小时`) : days > 0 ? `${days} 天后` : `${Math.max(1, hours)} 小时后`
  const tone = ms <= 0 ? 'bg-slate-100 text-slate-600' : ms <= 48 * HOUR ? 'bg-red-50 text-red-700' : ms <= 7 * 24 * HOUR ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tone}`}>{label}</span>
}

export function MoreLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-slate-600 hover:text-brand-700">
      {children}
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  )
}
