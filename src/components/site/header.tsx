import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import { Logo } from './logo'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link href="/#services" className="hidden rounded-full px-3 py-2 text-sm font-medium text-ink-soft hover:bg-sage-100 sm:inline-flex">
            Treatments
          </Link>
          <Link href="/#team" className="hidden rounded-full px-3 py-2 text-sm font-medium text-ink-soft hover:bg-sage-100 sm:inline-flex">
            Our team
          </Link>
          <Link href="/#visit" className="hidden rounded-full px-3 py-2 text-sm font-medium text-ink-soft hover:bg-sage-100 md:inline-flex">
            Visit
          </Link>
          <ButtonLink href="/book" size="sm" className="ml-1">
            Book now
          </ButtonLink>
        </nav>
      </div>
    </header>
  )
}
