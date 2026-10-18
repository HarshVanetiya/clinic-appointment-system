'use client'

import { Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { saveService, type FormResult } from '@/app/(staff)/admin/actions'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form'
import { FormResultAlert } from './form-result'

export interface ServiceFormValues {
  id?: string
  name: string
  slug: string
  description: string
  durationMin: number
  bufferAfterMin: number
  pricePaise: number
  active: boolean
  therapistIds: string[]
}

export function ServiceForm({ service, therapists }: { service?: ServiceFormValues; therapists: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(saveService, null)
  const p = service?.id ?? 'new'
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={service?.id ?? ''} />
      <Field label="Name" htmlFor={`${p}-name`}>
        <Input id={`${p}-name`} name="name" required defaultValue={service?.name} />
      </Field>
      <Field label="URL slug" htmlFor={`${p}-slug`} hint="Used in booking links, e.g. sports-massage">
        <Input id={`${p}-slug`} name="slug" required pattern="[a-z0-9-]+" defaultValue={service?.slug} />
      </Field>
      <Field label="Description" htmlFor={`${p}-desc`} className="sm:col-span-2">
        <Textarea id={`${p}-desc`} name="description" rows={2} required defaultValue={service?.description} />
      </Field>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <Field label="Duration (min)" htmlFor={`${p}-dur`}>
          <Input id={`${p}-dur`} name="durationMin" type="number" min={5} max={480} step={5} required defaultValue={service?.durationMin ?? 45} />
        </Field>
        <Field label="Buffer after (min)" htmlFor={`${p}-buf`} hint="Cleanup / notes time">
          <Input id={`${p}-buf`} name="bufferAfterMin" type="number" min={0} max={120} step={5} required defaultValue={service?.bufferAfterMin ?? 15} />
        </Field>
        <Field label="Price (₹)" htmlFor={`${p}-price`}>
          <Input id={`${p}-price`} name="priceRupees" type="number" min={0} step={50} required defaultValue={service ? service.pricePaise / 100 : 1200} />
        </Field>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-semibold text-ink-soft">Offered by</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {therapists.map((t) => (
            <Checkbox key={t.id} name="therapistIds" value={t.id} label={t.name} defaultChecked={service?.therapistIds.includes(t.id) ?? true} />
          ))}
        </div>
      </fieldset>
      <Checkbox name="active" label="Bookable online" defaultChecked={service?.active ?? true} className="sm:col-span-2" />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormResultAlert state={state} />
        <Button type="submit" disabled={pending} className="self-start">
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} {service ? 'Save changes' : 'Add service'}
        </Button>
      </div>
    </form>
  )
}
