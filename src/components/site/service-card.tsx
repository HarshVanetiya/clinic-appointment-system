import { ArrowRight, Clock } from 'lucide-react'
import Link from 'next/link'
import { formatDuration, formatINR } from '@/lib/format'

export interface ServiceSummary {
  slug: string
  name: string
  description: string
  durationMin: number
  pricePaise: number
}

export function ServiceCard({ service, index = 0 }: { service: ServiceSummary; index?: number }) {
  return (
    <Link
      href={`/book/${service.slug}`}
      className="group card relative flex h-full animate-fade-up flex-col p-5 transition-[box-shadow,transform] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99] sm:p-6"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold">{service.name}</h3>
        <span className="shrink-0 font-display text-lg font-bold text-green">{formatINR(service.pricePaise)}</span>
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{service.description}</p>
      <div className="mt-5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-soft">
          <Clock aria-hidden className="size-3.5" /> {formatDuration(service.durationMin)}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-green">
          Book <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
