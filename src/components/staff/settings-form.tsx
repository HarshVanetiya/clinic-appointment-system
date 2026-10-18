'use client'

import { Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { saveSettings, type FormResult } from '@/app/(staff)/admin/actions'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Card } from '@/components/ui/primitives'
import { formatIndianMobile } from '@/lib/phone'
import { FormResultAlert } from './form-result'

export interface SettingsValues {
  name: string
  phone: string
  email: string
  addressLine: string
  timeZone: string
  slotIntervalMin: number
  minNoticeMin: number
  bookingWindowDays: number
  cancellationCutoffHours: number
}

export function SettingsForm({ s }: { s: SettingsValues }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(saveSettings, null)
  return (
    <form action={action} className="grid gap-6 xl:grid-cols-2">
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-bold">Booking rules</h2>
        <Field label="Slot interval" htmlFor="slotIntervalMin" hint="How often start times are offered.">
          <Select id="slotIntervalMin" name="slotIntervalMin" defaultValue={s.slotIntervalMin}>
            {[5, 10, 15, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                Every {n} minutes
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Minimum notice (minutes)" htmlFor="minNoticeMin" hint="E.g. 120 = patients can't book within the next 2 hours.">
          <Input id="minNoticeMin" name="minNoticeMin" type="number" min={0} step={15} defaultValue={s.minNoticeMin} />
        </Field>
        <Field label="Booking window (days ahead)" htmlFor="bookingWindowDays">
          <Input id="bookingWindowDays" name="bookingWindowDays" type="number" min={1} max={365} defaultValue={s.bookingWindowDays} />
        </Field>
        <Field label="Cancellation cutoff (hours)" htmlFor="cancellationCutoffHours" hint="Patients can't cancel or reschedule online after this.">
          <Input id="cancellationCutoffHours" name="cancellationCutoffHours" type="number" min={0} max={168} defaultValue={s.cancellationCutoffHours} />
        </Field>
        <p className="rounded-xl bg-sage-50 px-3 py-2 text-sm text-muted">
          Time zone: <span className="font-mono text-ink">{s.timeZone}</span>. All times are stored in UTC and shown in this zone.
        </p>
      </Card>
      <Card className="h-fit space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-bold">Clinic details</h2>
        <Field label="Clinic name" htmlFor="name">
          <Input id="name" name="name" required defaultValue={s.name} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" required defaultValue={formatIndianMobile(s.phone)} />
        </Field>
        <Field label="Email (reply-to & calendar organiser)" htmlFor="email">
          <Input id="email" name="email" type="email" required defaultValue={s.email} />
        </Field>
        <Field label="Address" htmlFor="addressLine">
          <Input id="addressLine" name="addressLine" required defaultValue={s.addressLine} />
        </Field>
        <FormResultAlert state={state} />
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Save settings
        </Button>
      </Card>
    </form>
  )
}
