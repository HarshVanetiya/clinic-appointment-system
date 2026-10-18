'use client'

import { Loader2, Plus, X } from 'lucide-react'
import { useActionState, useState } from 'react'
import { saveTherapist, type FormResult } from '@/app/(staff)/admin/actions'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form'
import { Card } from '@/components/ui/primitives'
import { FormResultAlert } from './form-result'

type Range = { weekday: number; start: string; end: string }
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const WEEKDAY = [1, 2, 3, 4, 5, 6, 0] // display Monday-first, store 0 = Sunday

export interface TherapistFormValues {
  id: string
  name: string
  title: string
  bio: string
  email: string
  accent: string
  active: boolean
  serviceIds: string[]
  hours: Range[]
}

export function TherapistForm({ therapist, services }: { therapist?: TherapistFormValues; services: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(saveTherapist, null)
  const [hours, setHours] = useState<Range[]>(therapist?.hours ?? [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })))
  const update = (i: number, patch: Partial<Range>) => setHours((h) => h.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-2">
      <input type="hidden" name="id" value={therapist?.id ?? ''} />
      <input type="hidden" name="hours" value={JSON.stringify(hours)} />
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-bold">Profile</h2>
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required defaultValue={therapist?.name} />
        </Field>
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" required defaultValue={therapist?.title} placeholder="e.g. Sports Physiotherapist" />
        </Field>
        <Field label="Short bio" htmlFor="bio" optional>
          <Textarea id="bio" name="bio" rows={3} maxLength={400} defaultValue={therapist?.bio} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Login email" htmlFor="email" hint="Also receives booking notifications.">
            <Input id="email" name="email" type="email" required defaultValue={therapist?.email} />
          </Field>
          <Field label="Colour" htmlFor="accent">
            <Input id="accent" name="accent" type="color" className="w-16 cursor-pointer p-1.5" defaultValue={therapist?.accent ?? '#2D6A4F'} />
          </Field>
        </div>
        <Field label={therapist ? 'Reset password' : 'Temporary password'} htmlFor="password" optional={!!therapist} hint="At least 10 characters. Share it securely.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required={!therapist} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-soft">Services offered</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <Checkbox key={s.id} name="serviceIds" value={s.id} label={s.name} defaultChecked={therapist?.serviceIds.includes(s.id)} />
            ))}
          </div>
        </fieldset>
        <Checkbox name="active" label="Active (bookable)" defaultChecked={therapist?.active ?? true} />
      </Card>

      <Card className="h-fit space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-bold">Weekly working hours</h2>
          <p className="text-sm text-muted">Clinic time (IST). Add several ranges for split shifts.</p>
        </div>
        <ul className="divide-y divide-line">
          {WEEKDAY.map((wd, di) => {
            const ranges = hours.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === wd)
            return (
              <li key={wd} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <span className="w-28 pt-2 text-sm font-semibold">{DAYS[di]}</span>
                <div className="flex-1 space-y-2">
                  {ranges.length === 0 && <p className="pt-2 text-sm text-muted">Not working</p>}
                  {ranges.map(({ r, i }) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input aria-label={`${DAYS[di]} start`} type="time" step={900} value={r.start} onChange={(e) => update(i, { start: e.target.value })} className="h-10 w-32" />
                      <span aria-hidden className="text-muted">–</span>
                      <Input aria-label={`${DAYS[di]} end`} type="time" step={900} value={r.end} onChange={(e) => update(i, { end: e.target.value })} className="h-10 w-32" />
                      <button type="button" aria-label={`Remove ${DAYS[di]} ${r.start}–${r.end}`} onClick={() => setHours((h) => h.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-danger-bg hover:text-danger">
                        <X aria-hidden className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setHours((h) => [...h, { weekday: wd, start: ranges.length ? '14:00' : '09:00', end: ranges.length ? '18:00' : '13:00' }])}
                  className="inline-flex items-center gap-1 self-start rounded-full px-3 py-2 text-sm font-medium text-green hover:bg-sage-100"
                  aria-label={`Add hours on ${DAYS[di]}`}
                >
                  <Plus aria-hidden className="size-4" /> Add
                </button>
              </li>
            )
          })}
        </ul>
        <FormResultAlert state={state} />
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} {therapist ? 'Save therapist' : 'Create therapist'}
        </Button>
      </Card>
    </form>
  )
}
