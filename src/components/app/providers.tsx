'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { Tooltip } from '@base-ui/react/tooltip'
import { useState } from 'react'

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
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: '!bg-panel !text-fg !border-line !shadow-popover !rounded-lg !text-sm',
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
