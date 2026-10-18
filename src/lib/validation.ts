import { z } from 'zod'
import { normalizeIndianMobile } from './phone'

export const therapistChoice = z.union([z.literal('any'), z.uuid()])

export const patientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(80, 'Name is too long')
    .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, 'Please use letters only'),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Please enter a valid email address')),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = normalizeIndianMobile(v)
      if (!n) {
        ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number' })
        return z.NEVER
      }
      return n
    }),
  notes: z.string().trim().max(500, 'Please keep notes under 500 characters').default(''),
})

export const bookingRequestSchema = patientSchema.extend({
  serviceId: z.uuid(),
  therapist: therapistChoice,
  start: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
})

export type FieldErrors = Partial<Record<'name' | 'email' | 'phone' | 'notes' | 'form', string>>

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const key = (issue.path[0] as keyof FieldErrors) ?? 'form'
    if (key in { name: 1, email: 1, phone: 1, notes: 1 }) out[key] ??= issue.message
    else out.form ??= 'Something about this booking is invalid. Please go back and choose a time again.'
  }
  return out
}
