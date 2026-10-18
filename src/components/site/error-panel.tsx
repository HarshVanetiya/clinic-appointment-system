'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export function ErrorPanel({ error, reset, title = 'Something went wrong' }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div role="alert" className="mx-auto my-16 max-w-md rounded-[var(--radius-card)] bg-card px-6 py-10 text-center shadow-soft ring-1 ring-line">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted">Please try again. If it keeps happening, call the clinic and we&apos;ll sort it out.</p>
      {error.digest && <p className="mt-3 font-mono text-xs text-muted">Ref: {error.digest}</p>}
      <Button variant="secondary" className="mt-5" onClick={reset}>
        <RefreshCw aria-hidden className="size-4" /> Try again
      </Button>
    </div>
  )
}
