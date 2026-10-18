import type { NextRequest } from 'next/server'
import { formatTime, localDateOf } from '@/lib/format'
import { parseBookingFilters } from '@/server/booking-filters'
import { staffOrNull } from '@/server/dal'
import { getSettings } from '@/server/queries'
import { listBookings } from '@/server/staff-queries'

/** Quote a CSV cell and neutralise spreadsheet formula injection. */
function cell(v: string | number) {
  let s = String(v)
  // Plain numbers like +919876543210 are safe; anything else starting with a formula trigger is escaped.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?\d[\d ]*$/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: NextRequest) {
  if (!(await staffOrNull('admin'))) return new Response('Unauthorized', { status: 401 })
  const settings = await getSettings()
  const tz = settings.timeZone
  const { filters } = parseBookingFilters(Object.fromEntries(request.nextUrl.searchParams), Date.now(), tz)
  const { rows } = await listBookings(filters, tz, { limit: 10_000 })

  const header = ['Reference', 'Date', 'Time (IST)', 'Duration (min)', 'Service', 'Therapist', 'Status', 'Source', 'Patient', 'Email', 'Phone', 'Price (INR)', 'Notes', 'Booked at (UTC)']
  const lines = rows.map((r) =>
    [
      r.reference,
      localDateOf(r.startsAt, tz),
      formatTime(r.startsAt, tz),
      r.durationMin,
      r.serviceName,
      r.therapistName,
      r.status,
      r.source,
      r.patientName,
      r.patientEmail,
      r.patientPhone,
      (r.pricePaise / 100).toFixed(2),
      r.notes,
      r.createdAt.toISOString(),
    ]
      .map(cell)
      .join(','),
  )
  const csv = '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n'
  const name = `northside-bookings-${filters.from}-to-${filters.to}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
