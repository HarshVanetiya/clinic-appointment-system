'use client'

import { Loader2 } from 'lucide-react'
import { useActionState, useState } from 'react'
import { staffCreateBooking } from '@/app/(staff)/admin/actions'
import type { BookState } from '@/lib/booking-state'
import type { AvailabilityDTO, TherapistOption } from '@/lib/booking-types'
import { formatLocalDate } from '@/lib/format'
import { SlotPicker, type SlotSelection } from '@/components/booking/slot-picker'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Alert, Card } from '@/components/ui/primitives'

export function StaffBookingForm(props: { serviceId: string; serviceSlug: string; therapists: TherapistOption[]; initial: AvailabilityDTO }) {
  const [state, action, pending] = useActionState<BookState, FormData>(staffCreateBooking, { status: 'idle' })
  const [sel, setSel] = useState<SlotSelection | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const errors = state.status === 'error' ? state.errors : {}
  // A conflict means our picker is stale — refetch the week (adjusting state during render, not in an effect).
  const [seenState, setSeenState] = useState(state)
  if (state !== seenState) {
    setSeenState(state)
    if (state.status === 'taken') setRefreshKey((k) => k + 1)
  }
  const values = state.status === 'error' || state.status === 'taken' ? state.values : undefined

  return (
    <form
      action={action}
      className="grid gap-6 xl:grid-cols-[1fr_24rem]"
    >
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-bold">Time</h2>
        <SlotPicker
          serviceSlug={props.serviceSlug}
          therapists={props.therapists}
          initialTherapist="any"
          initial={props.initial}
          mode="staff"
          refreshKey={refreshKey}
          onChange={setSel}
          footer={() => null}
        />
      </Card>
      <Card className="h-fit space-y-4 p-5 sm:p-6 xl:sticky xl:top-22">
        <h2 className="text-lg font-bold">Patient</h2>
        <input type="hidden" name="serviceId" value={props.serviceId} />
        <input type="hidden" name="therapist" value={sel?.therapist ?? 'any'} />
        <input type="hidden" name="start" value={sel?.start ?? ''} />
        {state.status === 'taken' && <Alert tone="warn" title="That time was just taken">Nearest: {state.alternatives.map((a) => a.label).join(', ') || 'none nearby'}.</Alert>}
        {errors.form && <Alert tone="danger" title={errors.form} />}
        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-2 font-semibold text-ink-soft">Source</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="source" value="phone" defaultChecked className="size-4 accent-green" /> Phone call
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="source" value="walk_in" className="size-4 accent-green" /> Walk-in
          </label>
        </fieldset>
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" required defaultValue={values?.name} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Mobile" htmlFor="phone" error={errors.phone}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" required placeholder="98765 43210" defaultValue={values?.phone} aria-invalid={!!errors.phone} />
        </Field>
        <Field label="Email" htmlFor="email" hint="For the confirmation and calendar invite." error={errors.email}>
          <Input id="email" name="email" type="email" required defaultValue={values?.email} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Notes" htmlFor="notes" optional error={errors.notes}>
          <Textarea id="notes" name="notes" rows={2} defaultValue={values?.notes} />
        </Field>
        <div className="rounded-2xl bg-sage-50 px-4 py-3 text-sm" aria-live="polite">
          {sel ? (
            <>
              <span className="font-semibold">{formatLocalDate(sel.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {sel.label}</span>
              <span className="block text-muted">{sel.therapist === 'any' ? 'Least-busy available therapist' : props.therapists.find((t) => t.id === sel.therapist)?.name}</span>
            </>
          ) : (
            <span className="text-muted">Pick a time on the left.</span>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={!sel || pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Create booking
        </Button>
      </Card>
    </form>
  )
}
