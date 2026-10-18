'use client'

import { CalendarDays, CalendarOff, CalendarPlus, LayoutDashboard, ListChecks, LogOut, Settings, Stethoscope, TreePalm, Users } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/(staff)/login/actions'
import { cn } from '@/lib/cn'

const THERAPIST_ITEMS = [
  { href: '/staff', label: 'Schedule', icon: CalendarDays },
  { href: '/staff/time-off', label: 'Time off', icon: CalendarOff },
] as const

const ADMIN_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/bookings', label: 'Bookings', icon: ListChecks },
  { href: '/admin/bookings/new', label: 'New booking', icon: CalendarPlus },
  { href: '/staff', label: 'Schedules', icon: CalendarDays },
  { href: '/admin/services', label: 'Services', icon: Stethoscope },
  { href: '/admin/therapists', label: 'Therapists', icon: Users },
  { href: '/admin/holidays', label: 'Holidays & time off', icon: TreePalm },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
] as const

export function StaffNav({ role, name }: { role: 'admin' | 'therapist'; name: string }) {
  const pathname = usePathname()
  const items = role === 'admin' ? ADMIN_ITEMS : THERAPIST_ITEMS
  // Longest matching prefix wins, so /admin/bookings/new doesn't also light up /admin/bookings.
  const active = [...items].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.href

  return (
    <nav aria-label="Staff" className="flex flex-col gap-4">
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href} className="shrink-0">
            <Link
              href={href as Route}
              aria-current={active === href ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors lg:rounded-xl',
                active === href ? 'bg-green text-white' : 'text-ink-soft hover:bg-sage-100',
              )}
            >
              <Icon aria-hidden className="size-4" /> {label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden border-t border-line pt-4 lg:block">
        <p className="truncate px-3 text-sm font-semibold">{name}</p>
        <p className="px-3 font-mono text-[0.68rem] tracking-wider text-muted uppercase">{role}</p>
        <form action={logout} className="mt-2">
          <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-sage-100">
            <LogOut aria-hidden className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </nav>
  )
}

export function MobileSignOut() {
  return (
    <form action={logout} className="lg:hidden">
      <button type="submit" aria-label="Sign out" className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-sage-100">
        <LogOut aria-hidden className="size-4" />
      </button>
    </form>
  )
}
