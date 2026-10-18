import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { db } from '@/db'
import { services, therapistServices, therapists, workingHours } from '@/db/schema'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { TherapistForm } from '@/components/staff/therapist-form'
import { Alert, PageHeader } from '@/components/ui/primitives'
import { requireStaff } from '@/server/dal'

export const metadata: Metadata = { title: 'Therapist' }

export default function TherapistPage({ params, searchParams }: PageProps<'/admin/therapists/[id]'>) {
  return (
    <>
      <Link href="/admin/therapists" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-green">
        <ArrowLeft aria-hidden className="size-4" /> Therapists
      </Link>
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <Editor params={params} searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Editor({ params, searchParams }: Pick<PageProps<'/admin/therapists/[id]'>, 'params' | 'searchParams'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  await connection()
  await requireStaff('admin')
  const serviceList = await db.select({ id: services.id, name: services.name }).from(services).orderBy(asc(services.sortOrder))

  if (id === 'new') {
    return (
      <>
        <PageHeader title="Add therapist" description="Creates their profile and a staff login." />
        <TherapistForm services={serviceList} />
      </>
    )
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [t] = await db.select().from(therapists).where(eq(therapists.id, id))
  if (!t) notFound()
  const [links, hours] = await Promise.all([
    db.select().from(therapistServices).where(eq(therapistServices.therapistId, id)),
    db.select().from(workingHours).where(eq(workingHours.therapistId, id)).orderBy(asc(workingHours.weekday), asc(workingHours.startTime)),
  ])
  return (
    <>
      <PageHeader title={t.name} description={t.title} />
      {sp.created && <Alert tone="success" className="mb-4" title="Therapist created — they can sign in with the temporary password." />}
      <TherapistForm
        services={serviceList}
        therapist={{
          id: t.id,
          name: t.name,
          title: t.title,
          bio: t.bio,
          email: t.email,
          accent: t.accent,
          active: t.active,
          serviceIds: links.map((l) => l.serviceId),
          hours: hours.map((h) => ({ weekday: h.weekday, start: h.startTime.slice(0, 5), end: h.endTime.slice(0, 5) })),
        }}
      />
    </>
  )
}
