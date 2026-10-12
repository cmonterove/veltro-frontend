import { PasilloShell } from '@/components/chat/pasillo-shell'

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <PasilloShell>{children}</PasilloShell>
}
