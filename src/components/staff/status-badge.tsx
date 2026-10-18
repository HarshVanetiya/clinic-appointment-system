import { Badge } from '@/components/ui/primitives'

const MAP = {
  confirmed: { tone: 'green', label: 'Confirmed' },
  completed: { tone: 'info', label: 'Completed' },
  no_show: { tone: 'warn', label: 'No-show' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
} as const

export function StatusBadge({ status }: { status: keyof typeof MAP }) {
  const m = MAP[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}

export const SOURCE_LABEL = { online: 'Online', phone: 'Phone', walk_in: 'Walk-in' } as const
