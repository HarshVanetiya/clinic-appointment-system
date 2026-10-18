import type { Metadata } from 'next'
import { StaffShell } from '@/components/staff/shell'

export const metadata: Metadata = { robots: { index: false } }

export default function Layout({ children }: LayoutProps<'/admin'>) {
  return <StaffShell>{children}</StaffShell>
}
