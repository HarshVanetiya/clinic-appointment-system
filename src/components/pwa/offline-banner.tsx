'use client'

import { WifiOff } from 'lucide-react'
import { useOffline } from 'next/offline'

/** Shown while Next.js holds navigations / Server Actions for retry (experimental.useOffline). */
export function OfflineBanner() {
  const offline = useOffline()
  if (!offline) return null
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lift"
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <span>You&apos;re offline. We&apos;ll finish what you started as soon as you reconnect.</span>
    </div>
  )
}
