'use client'

import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from './theme-provider'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      type="button"
      className="btn-ghost btn-icon rounded-md"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      {resolvedTheme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
    </button>
  )
}
