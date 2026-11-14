import { RequestsShell } from '@/components/requests/requests-shell'

export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  return <RequestsShell>{children}</RequestsShell>
}
