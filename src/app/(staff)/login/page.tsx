import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Logo } from '@/components/site/logo'
import { LoginForm } from '@/components/staff/login-form'
import { Card, Skeleton } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'Staff sign in', robots: { index: false } }

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-sage)_0%,transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold">Staff sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted">For Northside therapists and clinic admins.</p>
          <Suspense fallback={<Skeleton className="h-56" />}>
            <Form searchParams={searchParams} />
          </Suspense>
        </Card>
        <p className="mt-6 text-center text-xs text-muted">
          Demo: admin@northside.example.com · password <span className="font-mono">northside-demo</span>
        </p>
      </div>
    </main>
  )
}

async function Form({ searchParams }: { searchParams: PageProps<'/login'>['searchParams'] }) {
  const sp = await searchParams
  return <LoginForm next={typeof sp.next === 'string' ? sp.next : undefined} />
}
