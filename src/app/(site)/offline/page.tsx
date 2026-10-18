import { WifiOff } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Offline' }

/** Precached by the service worker and shown when a page can't be reached. */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-sage text-green">
        <WifiOff aria-hidden className="size-6" />
      </span>
      <h1 className="mt-5 text-3xl font-extrabold">You&apos;re offline</h1>
      <p className="mt-2 text-muted">Booking needs a connection so we can show live availability. Reconnect and try again.</p>
      <a href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-green px-5 font-semibold text-white">
        Try again
      </a>
    </div>
  )
}
