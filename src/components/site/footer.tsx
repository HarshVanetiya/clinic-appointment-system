import Link from 'next/link'
import { getClinic } from '@/server/cached'
import { formatIndianMobile } from '@/lib/phone'
import { Logo } from './logo'

export async function SiteFooter() {
  const clinic = await getClinic()
  return (
    <footer className="mt-24 border-t border-line bg-card/60 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Evidence-based physiotherapy, with time to listen. Fictional clinic — portfolio demo.</p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-2">Visit</p>
          <p className="text-ink-soft">{clinic.addressLine}</p>
          <p className="mt-1 text-ink-soft">Mon–Sat · 7:30 am – 8:00 pm</p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-2">Contact</p>
          <a className="flex min-h-7 items-center text-ink-soft hover:text-green" href={`tel:${clinic.phone}`}>
            {formatIndianMobile(clinic.phone)}
          </a>
          <a className="flex min-h-7 items-center text-ink-soft hover:text-green" href={`mailto:${clinic.email}`}>
            {clinic.email}
          </a>
          <Link href="/login" className="mt-2 inline-flex min-h-7 items-center text-muted underline-offset-4 hover:text-green hover:underline">
            Staff sign in
          </Link>
        </div>
      </div>
    </footer>
  )
}
