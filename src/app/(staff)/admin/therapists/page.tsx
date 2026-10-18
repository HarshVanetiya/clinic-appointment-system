import { ChevronRight, Plus } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { db } from '@/db'
import { therapists, workingHours } from '@/db/schema'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { ButtonLink } from '@/components/ui/button'
import { Avatar, Badge, PageHeader } from '@/components/ui/primitives'
import { requireStaff } from '@/server/dal'

export const metadata: Metadata = { title: 'Therapists' }

export default function TherapistsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Therapists"
        actions={
          <ButtonLink href={'/admin/therapists/new' as Route}>
            <Plus aria-hidden className="size-4" /> Add therapist
          </ButtonLink>
        }
      />
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <List />
      </Suspense>
    </>
  )
}

async function List() {
  await connection()
  await requireStaff('admin')
  const [rows, hours] = await Promise.all([db.select().from(therapists).orderBy(asc(therapists.name)), db.select().from(workingHours)])
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((t) => {
        const h = hours.filter((x) => x.therapistId === t.id)
        const weeklyMin = h.reduce((m, x) => m + (Number(x.endTime.slice(0, 2)) * 60 + Number(x.endTime.slice(3, 5)) - Number(x.startTime.slice(0, 2)) * 60 - Number(x.startTime.slice(3, 5))), 0)
        return (
          <li key={t.id}>
            <Link href={`/admin/therapists/${t.id}` as Route} className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-lift">
              <Avatar name={t.name} accent={t.accent} size={48} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-bold">
                  {t.name} {!t.active && <Badge tone="warn">Inactive</Badge>}
                </p>
                <p className="truncate text-sm text-muted">{t.title}</p>
                <p className="mt-1 font-mono text-[0.68rem] text-muted uppercase">
                  {new Set(h.map((x) => x.weekday)).size} days · {Math.round(weeklyMin / 60)} h / week
                </p>
              </div>
              <ChevronRight aria-hidden className="size-5 text-muted" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
