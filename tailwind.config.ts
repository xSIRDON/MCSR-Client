import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        gold: 'var(--gold)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        portal: 'var(--portal)',
        // rank tiers
        coal: '#aaaaaa',
        iron: '#d4d4d4',
        goldrank: '#f5c842',
        emerald: '#4aff8c',
        diamond: '#4af0d8',
        netherite: '#c0a0ff'
      },
      fontFamily: {
        display: ['Monocraft', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 24px var(--gold-glow)',
        card: '0 8px 30px rgba(0,0,0,0.45)'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-glow': {
          '0%,100%': { opacity: '0.6' },
          '50%': { opacity: '1' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
} satisfies Config
