'use client'

import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { AvailabilityDTO, TherapistOption } from '@/lib/booking-types'
import { formatLocalDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { SlotPicker } from './slot-picker'

export function BookTimeStep(props: {
  serviceSlug: string
  therapists: TherapistOption[]
  initialTherapist: string
  initial: AvailabilityDTO
  initialStart?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <SlotPicker
      {...props}
      syncUrl
      footer={(sel) => {
        const who = sel ? (sel.therapist === 'any' ? 'any available therapist' : props.therapists.find((t) => t.id === sel.therapist)?.name) : null
        return (
          <div className="sticky bottom-0 z-30 -mx-4 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm" aria-live="polite">
                {sel ? (
                  <>
                    <span className="block font-semibold text-ink">
                      {formatLocalDate(sel.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {sel.label}
                    </span>
                    <span className="block truncate text-muted">with {who}</span>
                  </>
                ) : (
                  <span className="text-muted">Choose a time to continue</span>
                )}
              </p>
              <Button
                size="lg"
                disabled={!sel || pending}
                onClick={() => {
                  if (!sel) return
                  const q = new URLSearchParams({ start: sel.start, therapist: sel.therapist })
                  startTransition(() => router.push(`/book/${props.serviceSlug}/details?${q}`))
                }}
              >
                {pending ? 'Loading…' : 'Continue'} <ArrowRight aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
        )
      }}
    />
  )
}
