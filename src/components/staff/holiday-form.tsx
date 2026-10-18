'use client'

import { Loader2 } from 'lucide-react'
import { useActionState, useState } from 'react'
import { addHoliday, type FormResult } from '@/app/(staff)/admin/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Card } from '@/components/ui/primitives'
import { FormResultAlert } from './form-result'

export function HolidayForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(addHoliday, null)
  const [from, setFrom] = useState(today)
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-bold">Close the clinic</h2>
      <p className="mt-1 text-sm text-muted">Public holidays and closures apply to every therapist.</p>
      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="h-from">
          <Input id="h-from" name="from" type="date" min={today} required value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="h-to">
          <Input id="h-to" name="to" type="date" min={from} required defaultValue={from} key={from} />
        </Field>
        <Field label="Name" htmlFor="h-reason" className="sm:col-span-2">
          <Input id="h-reason" name="reason" required maxLength={80} placeholder="e.g. Holi, Independence Day" />
        </Field>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <FormResultAlert state={state} />
          <Button type="submit" disabled={pending} className="self-start">
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Add closure
          </Button>
        </div>
      </form>
    </Card>
  )
}
