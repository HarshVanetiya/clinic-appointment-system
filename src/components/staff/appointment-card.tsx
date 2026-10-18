import { Phone } from 'lucide-react'
import { Avatar } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { formatDuration, formatTime } from '@/lib/format'
import { formatIndianMobile } from '@/lib/phone'
import type { BookingRow } from '@/server/staff-queries'
import { BookingActions } from './booking-actions'
import { SOURCE_LABEL, StatusBadge } from './status-badge'

export function AppointmentCard({ b, timeZone, now, showTherapist }: { b: BookingRow; timeZone: string; now: number; showTherapist?: boolean }) {
  const isPast = b.startsAt.getTime() < now
  return (
    <article
      className={cn('flex gap-4 rounded-2xl bg-card p-4 ring-1 ring-line transition-shadow hover:shadow-soft', b.status === 'cancelled' && 'opacity-60')}
      aria-label={`${formatTime(b.startsAt, timeZone)} ${b.patientName}, ${b.serviceName}`}
    >
      <div className="w-16 shrink-0 text-right">
        <p className="font-display text-base font-bold tabular-nums">{formatTime(b.startsAt, timeZone)}</p>
        <p className="font-mono text-[0.68rem] text-muted">{formatDuration(b.durationMin)}</p>
      </div>
      <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: b.therapistAccent }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('font-semibold', b.status === 'cancelled' && 'line-through')}>{b.patientName}</p>
          <StatusBadge status={b.status} />
          {b.source !== 'online' && <span className="font-mono text-[0.66rem] text-muted uppercase">{SOURCE_LABEL[b.source]}</span>}
        </div>
        <p className="text-sm text-ink-soft">{b.serviceName}</p>
        {showTherapist && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Avatar name={b.therapistName} accent={b.therapistAccent} size={18} /> {b.therapistName}
          </p>
        )}
        {b.notes && <p className="mt-1.5 rounded-lg bg-sage-50 px-2.5 py-1.5 text-sm text-ink-soft">“{b.notes}”</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <a href={`tel:${b.patientPhone}`} className="inline-flex items-center gap-1.5 text-sm text-green hover:underline">
            <Phone aria-hidden className="size-3.5" /> {formatIndianMobile(b.patientPhone)}
          </a>
          <BookingActions id={b.id} status={b.status} isPast={isPast} />
        </div>
      </div>
    </article>
  )
}
