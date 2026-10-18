'use client'

import { CheckCircle2, Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { cancelAction, type CancelState } from '@/app/(site)/manage/actions'
import { Button, ButtonLink } from '@/components/ui/button'
import { Alert } from '@/components/ui/primitives'

export function CancelForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelAction.bind(null, token), { status: 'idle' })

  if (state.status === 'done') {
    return (
      <div role="status" className="animate-fade-up text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-sage text-green">
          <CheckCircle2 aria-hidden className="size-7" />
        </span>
        <h2 className="mt-4 text-2xl font-extrabold">Your appointment is cancelled</h2>
        <p className="mt-1 text-muted">The time has been released and we&apos;ve emailed you a confirmation.</p>
        <ButtonLink href="/book" className="mt-6">
          Book another time
        </ButtonLink>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' && <Alert tone="danger" title={state.message} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="danger" size="lg" disabled={pending} className="sm:flex-1">
          {pending ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" /> Cancelling…
            </>
          ) : (
            'Yes, cancel my appointment'
          )}
        </Button>
        <ButtonLink href="/" variant="secondary" size="lg" className="sm:flex-1">
          Keep my booking
        </ButtonLink>
      </div>
    </form>
  )
}
