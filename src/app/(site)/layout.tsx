import { SiteFooter } from '@/components/site/footer'
import { SiteHeader } from '@/components/site/header'

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  )
}
