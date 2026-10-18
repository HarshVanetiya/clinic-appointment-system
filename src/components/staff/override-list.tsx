'use client'

import { Trash2 } from 'lucide-react'
import { useTransition } from 'react'
import { deleteOverride } from '@/app/(staff)/staff/actions'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { formatLocalDate } from '@/lib/format'

export interface OverrideItem {
  id: string
  date: string
  kind: 'closed' | 'time_off' | 'extra_hours'
  startTime: string | null
  endTime: string | null
  reason: string
  therapistName: string | null
}

const KIND = { closed: ['Clinic closed', 'danger'], time_off: ['Time off', 'warn'], extra_hours: ['Extra hours', 'green'] } as const

export function OverrideList({ items, showTherapist, emptyText }: { items: OverrideItem[]; showTherapist?: boolean; emptyText: string }) {
  const [pending, start] = useTransition()
  if (!items.length) return <EmptyState title="Nothing scheduled" body={emptyText} />
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line" aria-busy={pending}>
      {items.map((o) => (
        <li key={o.id} className="flex items-center gap-4 px-4 py-3">
          <div className="w-24 shrink-0">
            <p className="font-semibold">{formatLocalDate(o.date, { day: 'numeric', month: 'short' })}</p>
            <p className="font-mono text-[0.68rem] text-muted uppercase">{formatLocalDate(o.date, { weekday: 'short', year: 'numeric' })}</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={KIND[o.kind][1]}>{KIND[o.kind][0]}</Badge>
              <span className="text-sm text-ink-soft">{o.startTime ? `${o.startTime.slice(0, 5)}–${o.endTime?.slice(0, 5)}` : 'All day'}</span>
            </div>
            <p className="truncate text-sm text-muted">
              {showTherapist && (o.therapistName ?? 'Whole clinic')}
              {showTherapist && o.reason && ' · '}
              {o.reason}
            </p>
          </div>
          <button
            type="button"
            onClick={() => start(async () => void (await deleteOverride(o.id)))}
            disabled={pending}
            aria-label={`Remove ${KIND[o.kind][0].toLowerCase()} on ${formatLocalDate(o.date, { day: 'numeric', month: 'long' })}`}
            className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger active:scale-95"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}
