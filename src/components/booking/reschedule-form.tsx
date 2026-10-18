'use client'

import { Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { rescheduleAction, type RescheduleState } from '@/app/(site)/manage/actions'
import type { AvailabilityDTO, TherapistOption } from '@/lib/booking-types'
import { formatLocalDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/primitives'
import { SlotPicker } from './slot-picker'

export function RescheduleForm(props: {
  token: string
  serviceSlug: string
  therapists: TherapistOption[]
  initialTherapist: string
  initial: AvailabilityDTO
}) {
  const [state, setState] = useState<RescheduleState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-4">
      {state.status === 'error' && <Alert tone="danger" title={state.message} />}
      {state.status === 'taken' && (
        <Alert tone="warn" title="That time was just taken">
          {state.alternatives.length ? `Nearest options: ${state.alternatives.map((a) => a.label).join(', ')}. We've refreshed the times below.` : "We've refreshed the times below."}
        </Alert>
      )}
      <SlotPicker
        refreshKey={refreshKey}
        serviceSlug={props.serviceSlug}
        therapists={props.therapists}
        initialTherapist={props.initialTherapist}
        initial={props.initial}
        token={props.token}
        footer={(sel) => (
          <div className="sticky bottom-0 z-30 -mx-4 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm" aria-live="polite">
                {sel ? (
                  <span className="font-semibold">
                    New time: {formatLocalDate(sel.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {sel.label}
                  </span>
                ) : (
                  <span className="text-muted">Choose a new time</span>
                )}
              </p>
              <Button
                size="lg"
                disabled={!sel || pending}
                onClick={() =>
                  sel &&
                  startTransition(async () => {
                    const r = await rescheduleAction(props.token, { therapist: sel.therapist, start: sel.start })
                    setState(r)
                    if (r.status === 'taken') setRefreshKey((k) => k + 1)
                  })
                }
              >
                {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                {pending ? 'Moving…' : 'Confirm new time'}
              </Button>
            </div>
          </div>
        )}
      />
    </div>
  )
}
