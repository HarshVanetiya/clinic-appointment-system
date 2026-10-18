import { icsForBooking, viewFromToken } from '@/server/booking-view'

export async function GET(_request: Request, ctx: RouteContext<'/api/ics/[token]'>) {
  const { token } = await ctx.params
  const view = await viewFromToken(token, 'view')
  if (!view) return new Response('Link expired or invalid', { status: 404 })
  const ics = await icsForBooking(view)
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="northside-${view.booking.reference}.ics"`,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
