import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { SettingsForm } from '@/components/staff/settings-form'
import { PageHeader } from '@/components/ui/primitives'
import { requireStaff } from '@/server/dal'
import { getSettings } from '@/server/queries'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Clinic" title="Settings" />
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <Settings />
      </Suspense>
    </>
  )
}

async function Settings() {
  await connection()
  await requireStaff('admin')
  const s = await getSettings()
  return <SettingsForm s={s} />
}
