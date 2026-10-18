import { ImageResponse } from 'next/og'
import { IconArt } from '@/lib/icon-art'

const VARIANTS = {
  '192': { size: 192, padding: 0 },
  '512': { size: 512, padding: 0 },
  // Maskable icons need the art inside the central 80% "safe zone".
  'maskable-512': { size: 512, padding: 72 },
} as const

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }))
}

export async function GET(_req: Request, ctx: RouteContext<'/icons/[variant]'>) {
  const v = VARIANTS[(await ctx.params).variant as keyof typeof VARIANTS]
  if (!v) return new Response('Not found', { status: 404 })
  return new ImageResponse(<IconArt size={v.size} padding={v.padding} />, {
    width: v.size,
    height: v.size,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
