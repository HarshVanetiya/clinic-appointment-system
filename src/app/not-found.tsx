import { ButtonLink } from '@/components/ui/button'
import { Logo } from '@/components/site/logo'

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="eyebrow mt-10">Error 404</p>
      <h1 className="mt-2 text-3xl font-extrabold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-muted">The link may be old, or the page may have moved.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink href="/">Go home</ButtonLink>
        <ButtonLink href="/book" variant="secondary">
          Book an appointment
        </ButtonLink>
      </div>
    </main>
  )
}
