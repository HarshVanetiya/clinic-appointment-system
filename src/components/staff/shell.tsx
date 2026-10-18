import { Suspense, type ReactNode } from 'react'
import { connection } from 'next/server'
import { Logo } from '@/components/site/logo'
import { Skeleton } from '@/components/ui/primitives'
import { requireStaff } from '@/server/dal'
import { MobileSignOut, StaffNav } from './nav'

async function NavSlot() {
  await connection()
  const staff = await requireStaff()
  return <StaffNav role={staff.role} name={staff.name} />
}

function NavSkeleton() {
  return (
    <div className="flex gap-2 lg:flex-col">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-28 rounded-full lg:w-full lg:rounded-xl" />
      ))}
    </div>
  )
}

export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo href="/staff" />
          <span className="hidden font-mono text-[0.68rem] tracking-wider text-muted uppercase sm:inline">Clinic workspace</span>
          <MobileSignOut />
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[14rem_1fr] lg:py-8">
        <aside className="lg:sticky lg:top-22 lg:self-start">
          <Suspense fallback={<NavSkeleton />}>
            <NavSlot />
          </Suspense>
        </aside>
        <main id="main" className="min-w-0 pb-16">
          {children}
        </main>
      </div>
    </div>
  )
}
