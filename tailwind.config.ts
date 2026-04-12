import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e8f5f0',
          100: '#c5e8d8',
          200: '#7eceb0',
          300: '#2d8a6a',
          400: '#1f6b52',
          500: '#1a3a2e',
          600: '#163326',
          700: '#112a1f',
          800: '#0d1f18',
          900: '#081510',
          DEFAULT: '#1a3a2e',
          foreground: '#ffffff',
        },
        brand: '#1a3a2e',
        'brand-light': '#e8f5f0',
        'brand-mid': '#2d8a6a',
        'brand-dark': '#0d1f18',
        status: {
          todo: { bg: '#f1efe8', text: '#5f5e5a', border: '#d3d1c7' },
          progress: { bg: '#e8f5f0', text: '#1a3a2e', border: '#7eceb0' },
          done: { bg: '#e8f5f0', text: '#0d1f18', border: '#2d8a6a' },
          stuck: { bg: '#fcebeb', text: '#791f1f', border: '#f09595' },
          waiting: { bg: '#faeeda', text: '#633806', border: '#fac775' },
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '17px'],
        base: ['13px', '19px'],
        md: ['15px', '22px'],
        lg: ['18px', '26px'],
        xl: ['22px', '30px'],
      },
      spacing: {
        sidebar: '220px',
        topbar: '44px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      borderWidth: {
        DEFAULT: '0.5px',
        '0': '0',
        '1': '1px',
        '2': '2px',
      },
      boxShadow: {
        none: 'none',
        focus: '0 0 0 3px rgba(45, 138, 106, 0.25)',
        card: '0 1px 3px rgba(0,0,0,0.06)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { transform: 'translateX(-8px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.15s ease-out',
        slideIn: 'slideIn 0.15s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
