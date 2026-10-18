import Link from 'next/link'

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="18" fill="#2D6A4F" />
      <path d="M20 44V20l24 24V20" stroke="#DDE7DF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function Logo({ href = '/' }: { href?: '/' | '/staff' | '/admin' }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 rounded-xl" aria-label="Northside Physio home">
      <LogoMark />
      <span className="font-display text-lg font-extrabold tracking-tight text-ink">
        Northside<span className="text-green"> Physio</span>
      </span>
    </Link>
  )
}
