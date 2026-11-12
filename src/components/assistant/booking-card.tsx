'use client'

import { CalendarClock, Loader2, Lock } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { bookAppointment } from '@/app/(site)/book/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import type { BookingProposalDTO } from '@/lib/assistant-types'
import type { BookState } from '@/lib/booking-state'
import { cn } from '@/lib/cn'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending} aria-disabled={pending}>
      {pending ? (
        <>
          <Loader2 aria-hidden className="size-4 animate-spin" /> Confirming…
        </>
      ) : (
        'Confirm booking'
      )}
    </Button>
  )
}

/**
 * The last step of a chat booking. The patient types their details here, and
 * the form posts to the same Server Action as the normal booking page, so the
 * validation, double-booking protection and confirmation email are identical.
 * These details go straight to the clinic's server and are never sent to the AI.
 */
export function BookingCard({ proposal }: { proposal: BookingProposalDTO }) {
  const [state, action] = useActionState<BookState, FormData>(bookAppointment, { status: 'idle' })
  const [start, setStart] = useState(proposal.start)
  const [whenLabel, setWhenLabel] = useState(proposal.whenLabel)
  const errors = state.status === 'error' ? state.errors : {}
  const values = state.status === 'error' || state.status === 'taken' ? state.values : undefined
  const invalid = (k: 'name' | 'email' | 'phone') => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `chat-${k}-error` } : {})

  return (
    <form action={action} noValidate className="mt-2 w-full animate-fade-up space-y-3 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-line">
      <input type="hidden" name="serviceId" value={proposal.serviceId} />
      <input type="hidden" name="therapist" value={proposal.therapist} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="notes" value="Booked through the chat assistant." />

      <div className="rounded-2xl bg-sage-50 p-3.5">
        <p className="eyebrow">Your booking</p>
        <p className="mt-1 font-display text-base font-bold">{proposal.serviceName}</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-medium" aria-live="polite">
          <CalendarClock aria-hidden className="size-4 shrink-0 text-green" /> {whenLabel}
        </p>
        <p className="mt-1 text-sm text-muted">
          {proposal.therapistLabel} · {proposal.durationLabel} · <span className="font-semibold text-green">{proposal.priceLabel}</span> at the clinic
        </p>
      </div>

      <div role={state.status === 'idle' ? undefined : 'alert'} className="text-sm">
        {state.status === 'taken' && (
          <div className="rounded-2xl bg-warn-bg p-3 text-warn">
            <p className="font-semibold">That time was just taken.</p>
            {state.alternatives.length > 0 ? (
              <>
                <p className="mt-0.5">Pick another, then confirm again:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state.alternatives.map((a) => (
                    <button
                      key={a.start}
                      type="button"
                      aria-pressed={a.start === start}
                      onClick={() => {
                        setStart(a.start)
                        setWhenLabel(a.label)
                      }}
                      className={cn('rounded-full px-3 py-1.5 text-sm font-semibold', a.start === start ? 'bg-green text-white' : 'bg-card text-ink ring-1 ring-warn/30')}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-0.5">Ask me for another day and I will look again.</p>
            )}
          </div>
        )}
        {state.status === 'rate_limited' && <p className="rounded-2xl bg-danger-bg p-3 font-medium text-danger">Too many attempts. Please wait a few minutes or call the clinic.</p>}
        {errors.form && <p className="rounded-2xl bg-danger-bg p-3 font-medium text-danger">{errors.form}</p>}
      </div>

      <Field label="Full name" htmlFor="chat-name" error={errors.name}>
        <Input id="chat-name" name="name" autoComplete="name" required defaultValue={values?.name} {...invalid('name')} />
      </Field>
      <Field label="Mobile number" htmlFor="chat-phone" error={errors.phone}>
        <Input id="chat-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" required defaultValue={values?.phone} {...invalid('phone')} />
      </Field>
      <Field label="Email" htmlFor="chat-email" hint="For your confirmation and calendar invite." error={errors.email}>
        <Input id="chat-email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={values?.email} {...invalid('email')} />
      </Field>

      <Submit />
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Lock aria-hidden className="size-3.5 shrink-0" /> Sent to the clinic only, not to the AI.
      </p>
    </form>
  )
}
