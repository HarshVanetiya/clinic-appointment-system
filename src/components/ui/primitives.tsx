import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('card', className)} {...props} />
}

export function Eyebrow({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('eyebrow', className)} {...props} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />
}

type Tone = 'green' | 'neutral' | 'warn' | 'danger' | 'info'
const tones: Record<Tone, string> = {
  green: 'bg-sage text-green-900',
  neutral: 'bg-sage-50 text-ink-soft ring-1 ring-inset ring-line',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[0.68rem] font-medium tracking-wide uppercase', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Avatar({ name, accent, size = 44 }: { name: string; accent: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
      style={{ width: size, height: size, backgroundColor: accent, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-card/60 px-6 py-12 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-sage text-green">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: string; children?: ReactNode; className?: string }) {
  const t = {
    info: 'bg-info-bg text-info',
    warn: 'bg-warn-bg text-warn',
    danger: 'bg-danger-bg text-danger',
    success: 'bg-sage text-green-900',
  }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-2xl px-4 py-3 text-sm animate-fade-in', t, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-0.5', 'opacity-95')}>{children}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description && <div className="mt-1.5 text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
