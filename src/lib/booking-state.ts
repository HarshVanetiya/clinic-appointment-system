import type { FieldErrors } from './validation'

export interface AlternativeDTO {
  start: string
  label: string // "Tue, 20 Oct · 10:15 am"
}

export type BookState =
  | { status: 'idle' }
  | { status: 'error'; errors: FieldErrors; values?: Record<string, string> }
  | { status: 'taken'; alternatives: AlternativeDTO[]; values?: Record<string, string> }
  | { status: 'rate_limited' }
