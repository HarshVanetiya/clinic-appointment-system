import { Check } from 'lucide-react'
import Link from 'next/link'
import type { Route } from 'next'
import { cn } from '@/lib/cn'

const STEPS = ['Service', 'Time', 'Details'] as const

/** 3-step progress indicator. Completed steps link back. */
export function Stepper({ current, links = {} }: { current: 1 | 2 | 3; links?: Partial<Record<1 | 2, Route>> }) {
  return (
    <nav aria-label="Booking progress" className="mb-8">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const done = n < current
          const active = n === current
          const href = links[n as 1 | 2]
          const inner = (
            <>
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold transition-colors duration-300',
                  done && 'bg-green text-white',
                  active && 'bg-ink text-white',
                  !done && !active && 'bg-sage-100 text-muted ring-1 ring-line',
                )}
              >
                {done ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span className={cn('text-sm font-semibold', active ? 'text-ink' : 'text-muted', !active && 'hidden sm:inline')}>{label}</span>
            </>
          )
          return (
            <li key={label} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={active ? 'step' : undefined}>
              {done && href ? (
                <Link href={href} className="flex items-center gap-2 rounded-full pr-1" aria-label={`Step ${n}: ${label} (completed, go back)`}>
                  {inner}
                </Link>
              ) : (
                <span className="flex items-center gap-2" aria-label={`Step ${n}: ${label}${active ? ' (current)' : ''}`}>
                  {inner}
                </span>
              )}
              {n < 3 && <span aria-hidden className={cn('h-px flex-1 transition-colors duration-300', done ? 'bg-green' : 'bg-line-strong')} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
