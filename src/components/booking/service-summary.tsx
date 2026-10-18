import { Clock, IndianRupee } from 'lucide-react'
import { formatDuration, formatINR } from '@/lib/format'

export function ServiceSummary({ service }: { service: { name: string; durationMin: number; pricePaise: number; description?: string } }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold sm:text-4xl">{service.name}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Clock aria-hidden className="size-4" /> {formatDuration(service.durationMin)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <IndianRupee aria-hidden className="size-4" /> {formatINR(service.pricePaise)} · pay at clinic
        </span>
      </p>
    </div>
  )
}
