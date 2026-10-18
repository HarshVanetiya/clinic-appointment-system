import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from '@react-email/components'
import type { CSSProperties } from 'react'

const C = {
  bg: '#F7F5F0',
  card: '#FFFFFF',
  sage: '#DDE7DF',
  green: '#2D6A4F',
  ink: '#1A1C1E',
  muted: '#5B6168',
  line: '#E7E4DC',
}

const font = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const headingFont = "Manrope, Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
const mono = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"

export interface EmailDetail {
  label: string
  value: string
}

export interface EmailAction {
  label: string
  href: string
  variant?: 'primary' | 'secondary'
}

export interface BookingEmailProps {
  preview: string
  eyebrow: string
  heading: string
  intro: string
  details: EmailDetail[]
  actions?: EmailAction[]
  note?: string
  clinic: { name: string; address: string; phone: string; email: string; url: string }
}

export function BookingEmail({ preview, eyebrow, heading, intro, details, actions = [], note, clinic }: BookingEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: C.bg, fontFamily: font, color: C.ink, margin: 0, padding: '32px 12px' }}>
        <Container style={{ maxWidth: 560, margin: '0 auto' }}>
          <Text style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 18, color: C.green, margin: '0 0 20px 4px' }}>
            {clinic.name}
          </Text>
          <Section style={{ backgroundColor: C.card, borderRadius: 24, padding: '32px 28px', border: `1px solid ${C.line}` }}>
            <Text style={eyebrowStyle}>{eyebrow}</Text>
            <Heading as="h1" style={{ fontFamily: headingFont, fontSize: 26, lineHeight: '32px', margin: '8px 0 12px', color: C.ink }}>
              {heading}
            </Heading>
            <Text style={{ fontSize: 15, lineHeight: '24px', color: C.muted, margin: '0 0 20px' }}>{intro}</Text>

            <Section style={{ backgroundColor: C.sage, borderRadius: 16, padding: '18px 20px' }}>
              {details.map((d) => (
                <Text key={d.label} style={{ margin: '0 0 10px', fontSize: 15, lineHeight: '22px' }}>
                  <span style={{ ...eyebrowStyle, display: 'block', margin: 0, color: C.green }}>{d.label}</span>
                  <span style={{ fontWeight: 600 }}>{d.value}</span>
                </Text>
              ))}
            </Section>

            {actions.length > 0 && (
              <Section style={{ marginTop: 24 }}>
                {actions.map((a) => (
                  <Button key={a.href} href={a.href} style={a.variant === 'secondary' ? secondaryBtn : primaryBtn}>
                    {a.label}
                  </Button>
                ))}
              </Section>
            )}

            {note && <Text style={{ fontSize: 13, lineHeight: '20px', color: C.muted, margin: '20px 0 0' }}>{note}</Text>}
          </Section>

          <Hr style={{ borderColor: C.line, margin: '28px 0 16px' }} />
          <Text style={{ fontSize: 12, lineHeight: '18px', color: C.muted, margin: 0, textAlign: 'center' }}>
            {clinic.name} · {clinic.address}
            <br />
            <Link href={`tel:${clinic.phone.replace(/\s/g, '')}`} style={{ color: C.green }}>
              {clinic.phone}
            </Link>{' '}
            ·{' '}
            <Link href={clinic.url} style={{ color: C.green }}>
              {clinic.url.replace(/^https?:\/\//, '')}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const eyebrowStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.muted,
  margin: 0,
}

const btnBase: CSSProperties = {
  display: 'inline-block',
  borderRadius: 999,
  padding: '12px 22px',
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
  margin: '0 8px 8px 0',
}
const primaryBtn: CSSProperties = { ...btnBase, backgroundColor: C.green, color: '#FFFFFF' }
const secondaryBtn: CSSProperties = { ...btnBase, backgroundColor: C.card, color: C.green, border: `1px solid ${C.green}` }
