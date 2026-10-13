'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { Tooltip } from '@base-ui/react/tooltip'
import { useState } from 'react'
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { ValidationBubble } from '@/components/ui/validation-bubble'

/** Ícono de cada tipo de aviso: un círculo suave del color del tipo. */
function ToastIcon({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`toast-icon flex size-6 items-center justify-center rounded-full ${tone}`}>{children}</span>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
        },
      }),
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <Tooltip.Provider delay={500} closeDelay={0}>
          {children}
        </Tooltip.Provider>
        <ValidationBubble />
        <Toaster
          position="bottom-right"
          gap={10}
          visibleToasts={4}
          icons={{
            success: (
              <ToastIcon tone="bg-success-soft text-success">
                <Check className="size-3.5" strokeWidth={3} />
              </ToastIcon>
            ),
            error: (
              <ToastIcon tone="bg-danger-soft text-danger">
                <CircleAlert className="size-3.5" strokeWidth={2.4} />
              </ToastIcon>
            ),
            warning: (
              <ToastIcon tone="bg-warning-soft text-warning">
                <TriangleAlert className="size-3.5" strokeWidth={2.4} />
              </ToastIcon>
            ),
            info: (
              <ToastIcon tone="bg-accent-soft text-accent-ink">
                <Info className="size-3.5" strokeWidth={2.4} />
              </ToastIcon>
            ),
            loading: (
              <ToastIcon tone="bg-hover text-fg-muted">
                <Spinner className="size-3.5" />
              </ToastIcon>
            ),
            close: <X className="size-3" />,
          }}
          toastOptions={{
            classNames: {
              toast:
                'group !items-center !gap-3 !rounded-xl !border !border-line !bg-panel !py-3 !pl-3 !pr-3.5 !text-sm !text-fg !shadow-popover',
              title: '!font-medium !leading-snug !text-fg',
              description: '!text-xs !leading-snug !text-fg-muted',
              icon: '!m-0 !size-6 !shrink-0',
              actionButton: '!ml-auto !h-7 !rounded-md !bg-accent !px-2.5 !text-xs !font-medium !text-accent-fg hover:!bg-accent-hover',
              cancelButton: '!h-7 !rounded-md !bg-hover !px-2.5 !text-xs !font-medium !text-fg-muted',
              closeButton: '!border-line !bg-panel !text-fg-subtle hover:!text-fg',
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
