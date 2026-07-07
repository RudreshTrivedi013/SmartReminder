import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0f',
          surface: '#111118',
          elevated: '#1a1a24',
        },
        border: { DEFAULT: '#2a2a3a', subtle: '#1e1e2e' },
        primary: {
          DEFAULT: '#6366f1',
          glow: 'rgba(99,102,241,0.15)',
          dark: '#4f52d9',
        },
        accent: { DEFAULT: '#22d3ee', dark: '#06b6d4' },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        text: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(99,102,241,0.3)',
        'glow-sm': '0 0 10px rgba(99,102,241,0.2)',
        'glow-accent': '0 0 20px rgba(34,211,238,0.25)',
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}

export default config
