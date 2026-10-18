import { CalendarCheck2, HeartPulse, MapPin, ShieldCheck, Smartphone, Timer } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { Avatar, Card, Eyebrow } from '@/components/ui/primitives'
import { ServiceCard } from '@/components/site/service-card'
import { getClinic, getPublicServices, getPublicTherapists } from '@/server/cached'
import { formatINR } from '@/lib/format'
import { formatIndianMobile } from '@/lib/phone'

export default async function HomePage() {
  const [services, therapists, clinic] = await Promise.all([getPublicServices(), getPublicTherapists(), getClinic()])
  const from = Math.min(...services.map((s) => s.pricePaise))

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] size-[520px] rounded-full bg-sage/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-20 md:pb-24">
          <div className="animate-fade-up">
            <Eyebrow className="mb-4">Indiranagar · Bengaluru</Eyebrow>
            <h1 className="text-[2.4rem] leading-[1.05] font-extrabold sm:text-5xl md:text-6xl">
              Move well.
              <br />
              <span className="text-green">Feel like you again.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
              Physiotherapy, sports massage and clinical Pilates with therapists who take the time to understand you. Book online in under a minute.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/book" size="lg">
                Book an appointment
              </ButtonLink>
              <ButtonLink href="/#services" size="lg" variant="ghost">
                See treatments
              </ButtonLink>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[
                ['3', 'specialist physios'],
                ['6 days', 'a week, early & late'],
                [formatINR(from), 'sessions from'],
              ].map(([k, v]) => (
                <div key={v}>
                  <dt className="sr-only">{v}</dt>
                  <dd className="font-display text-2xl font-extrabold text-ink">{k}</dd>
                  <dd className="text-xs text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Booking preview card */}
          <Card className="relative mx-auto w-full max-w-sm animate-fade-up p-5 [animation-delay:80ms] sm:p-6">
            <div className="flex items-center gap-3">
              <Avatar name={therapists[0]?.name ?? 'Northside'} accent={therapists[0]?.accent ?? '#2D6A4F'} />
              <div>
                <p className="font-semibold">{therapists[0]?.name}</p>
                <p className="text-sm text-muted">{services[0]?.name}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-5 gap-1.5" aria-hidden>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
                <div key={d} className={`rounded-xl py-2 text-center text-xs ${i === 1 ? 'bg-green text-white' : 'bg-sage-50 text-ink-soft'}`}>
                  <div className="font-mono text-[0.6rem] uppercase opacity-80">{d}</div>
                  <div className="font-display text-base font-bold">{20 + i}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden>
              {['9:00 am', '9:30 am', '10:15 am', '11:00 am', '2:30 pm', '4:00 pm'].map((t, i) => (
                <div key={t} className={`rounded-xl py-2.5 text-center text-sm font-medium ${i === 2 ? 'bg-green text-white shadow-soft' : 'bg-card ring-1 ring-line'}`}>
                  {t}
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-2xl bg-sage px-4 py-3 text-sm text-green-900">
              <CalendarCheck2 aria-hidden className="size-4" /> Confirmation + calendar invite by email
            </div>
          </Card>
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-label="Why Northside">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [Timer, 'Unhurried sessions', 'Every appointment includes time to assess, treat and explain — never a 10-minute rush.'],
            [HeartPulse, 'A plan, not guesswork', 'Clear goals and home exercises so progress continues between visits.'],
            [Smartphone, 'Easy to change', 'Reschedule or cancel from your email in two taps, up to 24 hours before.'],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Timer
            return (
              <div key={title as string} className="rounded-[var(--radius-card)] bg-sage-50 p-6 ring-1 ring-line/60">
                <I aria-hidden className="size-6 text-green" />
                <h2 className="mt-4 text-lg font-bold">{title as string}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body as string}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-6">
        <Eyebrow className="mb-2">Treatments</Eyebrow>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <h2 className="text-3xl font-extrabold sm:text-4xl">What we can help with</h2>
          <p className="max-w-sm text-sm text-muted">Transparent pricing. Pay at the clinic by UPI, card or cash.</p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <ServiceCard key={s.id} service={s} index={i} />
          ))}
        </div>
      </section>

      {/* Team */}
      <section id="team" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-6">
        <Eyebrow className="mb-2">Our team</Eyebrow>
        <h2 className="text-3xl font-extrabold sm:text-4xl">Meet your physiotherapists</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {therapists.map((t) => (
            <Card key={t.id} className="p-6">
              <Avatar name={t.name} accent={t.accent} size={56} />
              <h3 className="mt-4 text-lg font-bold">{t.name}</h3>
              <p className="text-sm font-medium text-green">{t.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{t.bio}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-6">
        <div className="overflow-hidden rounded-[2rem] bg-green-900 p-8 text-white sm:p-12">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <p className="font-mono text-xs tracking-[0.12em] text-sage uppercase">Ready when you are</p>
              <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">Book in under a minute.</h2>
              <p className="mt-3 max-w-md text-sage-100/90">
                Choose a treatment, pick a time that suits you, and you&apos;re done. We&apos;ll send a confirmation and a calendar invite straight away.
              </p>
              <ButtonLink href="/book" size="lg" variant="soft" className="mt-6">
                Find a time
              </ButtonLink>
            </div>
            <div className="space-y-3 text-sm">
              <p className="flex gap-3">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-sage" /> {clinic.addressLine}
              </p>
              <p className="flex gap-3">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-sage" /> Free cancellation up to {clinic.cancellationCutoffHours} hours before
              </p>
              <p className="flex gap-3">
                <Smartphone aria-hidden className="mt-0.5 size-4 shrink-0 text-sage" />
                <a href={`tel:${clinic.phone}`} className="underline-offset-4 hover:underline">
                  {formatIndianMobile(clinic.phone)}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
