'use client'

import { Check, Loader2, RotateCcw, UserX, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { markAttendance, staffCancel, type ActionResult } from '@/app/(staff)/staff/actions'
import { Button } from '@/components/ui/button'

export function BookingActions({ id, status, isPast, canCancel = true }: { id: string; status: 'confirmed' | 'completed' | 'no_show' | 'cancelled'; isPast: boolean; canCancel?: boolean }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [confirming, setConfirming] = useState(false)
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()))

  if (status === 'cancelled') return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Loader2 aria-label="Saving" className="size-4 animate-spin text-muted" />}
      {status === 'confirmed' && isPast && (
        <>
          <Button size="sm" variant="soft" disabled={pending} onClick={() => run(() => markAttendance(id, 'completed'))}>
            <Check aria-hidden className="size-4" /> Completed
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markAttendance(id, 'no_show'))}>
            <UserX aria-hidden className="size-4" /> No-show
          </Button>
        </>
      )}
      {(status === 'completed' || status === 'no_show') && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markAttendance(id, 'confirmed'))}>
          <RotateCcw aria-hidden className="size-4" /> Undo
        </Button>
      )}
      {status === 'confirmed' && !isPast && canCancel &&
        (confirming ? (
          <>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => staffCancel(id))}>
              Confirm cancel
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <X aria-hidden className="size-4" /> Cancel
          </Button>
        ))}
      {result && !result.ok && (
        <span role="alert" className="text-xs font-medium text-danger">
          {result.error}
        </span>
      )}
      {result?.ok && result.message && (
        <span role="status" className="text-xs font-medium text-green">
          {result.message}
        </span>
      )}
    </div>
  )
}
