/** The app icon as an ImageResponse-compatible element (used for favicon, apple icon and PWA icons). */
export function IconArt({ size, padding = 0 }: { size: number; padding?: number }) {
  const inner = size - padding * 2
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: padding ? '#2D6A4F' : 'transparent' }}>
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: padding ? 0 : inner * 0.28,
          background: '#2D6A4F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width={inner * 0.62} height={inner * 0.62} viewBox="0 0 64 64">
          <path d="M14 50V14l36 36V14" stroke="#DDE7DF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>
    </div>
  )
}
