'use client'

import { Loader2 } from 'lucide-react'
import { useActionState, useState } from 'react'
import { addTimeOff, type ActionResult } from '@/app/(staff)/staff/actions'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/form'
import { Alert, Card } from '@/components/ui/primitives'

export function TimeOffForm({ therapists, defaultTherapistId, today }: { therapists?: { id: string; name: string }[]; defaultTherapistId?: string; today: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addTimeOff, null)
  const [allDay, setAllDay] = useState(true)
  const [from, setFrom] = useState(today)
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-bold">Block time off</h2>
      <p className="mt-1 text-sm text-muted">Patients won&apos;t be able to book these times.</p>
      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        {therapists && (
          <Field label="Therapist" htmlFor="therapistId" className="sm:col-span-2">
            <Select id="therapistId" name="therapistId" defaultValue={defaultTherapistId} required>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="From" htmlFor="from">
          <Input id="from" name="from" type="date" min={today} required value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="to">
          <Input id="to" name="to" type="date" min={from} required defaultValue={today} key={from} />
        </Field>
        <Checkbox name="allDay" label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="sm:col-span-2" />
        {!allDay && (
          <>
            <Field label="Start time" htmlFor="startTime">
              <Input id="startTime" name="startTime" type="time" step={900} required defaultValue="13:00" />
            </Field>
            <Field label="End time" htmlFor="endTime">
              <Input id="endTime" name="endTime" type="time" step={900} required defaultValue="17:00" />
            </Field>
          </>
        )}
        <Field label="Reason" htmlFor="reason" optional hint="Only visible to staff." className="sm:col-span-2">
          <Input id="reason" name="reason" maxLength={120} placeholder="e.g. Conference, personal leave" />
        </Field>
        <div className="flex flex-col gap-3 sm:col-span-2">
          {state && (state.ok ? <Alert tone={state.message?.includes('existing') ? 'warn' : 'success'} title={state.message} /> : <Alert tone="danger" title={state.error} />)}
          <Button type="submit" disabled={pending} className="self-start">
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Save time off
          </Button>
        </div>
      </form>
    </Card>
  )
}
