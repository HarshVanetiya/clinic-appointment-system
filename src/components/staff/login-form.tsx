'use client'

import { Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { login, type LoginState } from '@/app/(staff)/login/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Alert } from '@/components/ui/primitives'

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {})
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="danger" title={state.error} />}
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Sign in
      </Button>
    </form>
  )
}
