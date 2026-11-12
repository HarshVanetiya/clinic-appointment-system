import { Suspense } from 'react'
import { AssistantWidget } from '@/components/assistant/assistant-widget'
import { SiteFooter } from '@/components/site/footer'
import { SiteHeader } from '@/components/site/header'
import { formatIndianMobile } from '@/lib/phone'
import { getClinic } from '@/server/cached'

async function Assistant() {
  const clinic = await getClinic()
  return <AssistantWidget clinicName={clinic.name} phone={formatIndianMobile(clinic.phone)} />
}

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      {/* The chat is an extra: the page never waits for it. */}
      <Suspense fallback={null}>
        <Assistant />
      </Suspense>
    </>
  )
}
