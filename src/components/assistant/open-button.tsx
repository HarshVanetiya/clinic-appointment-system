'use client'

import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonClass } from '@/components/ui/button'

export const OPEN_EVENT = 'assistant:open'

/** Opens the booking assistant from anywhere on the public site, optionally with a first message. */
export function OpenAssistantButton({ children, prompt, className }: { children: ReactNode; prompt?: string; className?: string }) {
  return (
    <button
      type="button"
      className={className ?? buttonClass('secondary', 'lg')}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prompt } }))}
    >
      <Sparkles aria-hidden className="size-4" />
      {children}
    </button>
  )
}
