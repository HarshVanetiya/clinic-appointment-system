import type { FormResult } from '@/app/(staff)/admin/actions'
import { Alert } from '@/components/ui/primitives'

export function FormResultAlert({ state }: { state: FormResult }) {
  if (!state) return null
  return state.ok ? <Alert tone="success" title={state.message} /> : <Alert tone="danger" title={state.error} />
}
