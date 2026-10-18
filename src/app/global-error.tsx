'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F7F5F0', color: '#1A1C1E', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1>Something went wrong</h1>
          <p>Please refresh the page, or call the clinic.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 999, border: 0, background: '#2D6A4F', color: '#fff', fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
