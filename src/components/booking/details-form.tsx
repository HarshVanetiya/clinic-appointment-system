'use client'

import { CalendarClock, Loader2, Lock, UserRound } from 'lucide-react'
import Link from 'next/link'
import type { Route } from 'next'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { bookAppointment } from '@/app/(site)/book/actions'
import type { BookState } from '@/lib/booking-state'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Alert, Card } from '@/components/ui/primitives'
import { Field, Input, Textarea } from '@/components/ui/form'

interface Props {
  serviceId: string
  serviceSlug: string
  serviceName: string
  priceLabel: string
  durationLabel: string
  therapist: string
  therapistLabel: string
  start: string
  whenLabel: string
  changeHref: Route
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} aria-disabled={pending}>
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

export function DetailsForm(p: Props) {
  const [state, action] = useActionState<BookState, FormData>(bookAppointment, { status: 'idle' })
  const [start, setStart] = useState(p.start)
  const [whenLabel, setWhenLabel] = useState(p.whenLabel)
  const alertRef = useRef<HTMLDivElement>(null)
  const errors = state.status === 'error' ? state.errors : {}
  const values = state.status === 'error' || state.status === 'taken' ? state.values : undefined

  // Move focus to the problem so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (state.status === 'taken' || state.status === 'rate_limited' || (state.status === 'error' && state.errors.form)) alertRef.current?.focus()
    else if (state.status === 'error') document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [state])

  const err = (k: 'name' | 'email' | 'phone' | 'notes') =>
    errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : { 'aria-describedby': `${k}-hint` }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <form action={action} className="order-2 space-y-5 lg:order-1" noValidate>
        <input type="hidden" name="serviceId" value={p.serviceId} />
        <input type="hidden" name="therapist" value={p.therapist} />
        <input type="hidden" name="start" value={start} />
        {/* Honeypot (hidden from people and assistive tech) */}
        <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
          <label>
            Company <input name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div ref={alertRef} tabIndex={-1} className="outline-none">
          {state.status === 'taken' && (
            <Alert tone="warn" title="That time was just taken — here are the nearest options">
              {state.alternatives.length ? (
                <div role="radiogroup" aria-label="Alternative times" className="mt-3 flex flex-wrap gap-2">
                  {state.alternatives.map((a) => (
                    <button
                      key={a.start}
                      type="button"
                      role="radio"
                      aria-checked={a.start === start}
                      onClick={() => {
                        setStart(a.start)
                        setWhenLabel(a.label)
                      }}
                      className={cn(
                        'rounded-full px-3.5 py-2 text-sm font-semibold transition-colors active:scale-[0.97]',
                        a.start === start ? 'bg-green text-white' : 'bg-card text-ink ring-1 ring-warn/30 hover:ring-green',
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1">
                  No nearby times are free.{' '}
                  <Link className="font-semibold underline" href={p.changeHref}>
                    Choose another time
                  </Link>
                  .
                </p>
              )}
              {state.alternatives.length > 0 && <p className="mt-3 text-xs">Pick one, then confirm again — your details are kept.</p>}
            </Alert>
          )}
          {state.status === 'rate_limited' && (
            <Alert tone="danger" title="Too many attempts">
              Please wait a few minutes and try again, or call the clinic.
            </Alert>
          )}
          {errors.form && <Alert tone="danger" title={errors.form} />}
        </div>

        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <UserRound aria-hidden className="size-5 text-green" /> Your details
          </h2>
          <Field label="Full name" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" autoComplete="name" required defaultValue={values?.name} {...err('name')} />
          </Field>
          <Field label="Email" htmlFor="email" hint="We'll send your confirmation and calendar invite here." error={errors.email}>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={values?.email} {...err('email')} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" hint="10-digit Indian mobile. We'll only call if something changes." error={errors.phone}>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-medium text-muted">
                +91
              </span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="98765 43210"
                required
                className="pl-13"
                defaultValue={values?.phone}
                {...err('phone')}
              />
            </div>
          </Field>
          <Field label="Anything we should know?" htmlFor="notes" optional hint="E.g. what's bothering you, or a recent surgery." error={errors.notes}>
            <Textarea id="notes" name="notes" maxLength={500} rows={3} defaultValue={values?.notes} {...err('notes')} />
          </Field>
        </Card>

        <SubmitButton />
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <Lock aria-hidden className="size-3.5" /> Your details are only shared with your therapist.
        </p>
      </form>

      <aside aria-label="Booking summary" className="order-1 lg:sticky lg:top-24 lg:order-2">
        <Card className="bg-sage-50 p-5">
          <p className="eyebrow">Your booking</p>
          <p className="mt-2 text-lg font-bold">{p.serviceName}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <dt className="sr-only">When</dt>
              <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-green" />
              <dd className="font-medium" aria-live="polite">
                {whenLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Therapist</dt>
              <dd className="text-right font-medium">{p.therapistLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Duration</dt>
              <dd className="font-medium">{p.durationLabel}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-line pt-2">
              <dt className="text-muted">Pay at clinic</dt>
              <dd className="font-display text-base font-bold text-green">{p.priceLabel}</dd>
            </div>
          </dl>
          <Link href={p.changeHref} className="mt-4 inline-block text-sm font-semibold text-green underline-offset-4 hover:underline">
            Change time
          </Link>
        </Card>
      </aside>
    </div>
  )
}
