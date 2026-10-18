import type { Metadata } from 'next'
import { Stepper } from '@/components/booking/stepper'
import { ServiceCard } from '@/components/site/service-card'
import { EmptyState } from '@/components/ui/primitives'
import { getPublicServices } from '@/server/cached'

export const metadata: Metadata = { title: 'Book an appointment' }

export default async function ChooseServicePage() {
  const services = (await getPublicServices()).filter((s) => s.therapistCount > 0)
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Stepper current={1} />
      <h1 className="text-3xl font-extrabold sm:text-4xl">What would you like to book?</h1>
      <p className="mt-2 text-muted">Not sure? Start with an Initial Assessment — we&apos;ll guide you from there.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.length ? (
          services.map((s, i) => <ServiceCard key={s.id} service={s} index={i} headingLevel={2} />)
        ) : (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState title="Online booking is paused" body="We're updating our treatments. Please call the clinic to book." />
          </div>
        )}
      </div>
    </div>
  )
}
