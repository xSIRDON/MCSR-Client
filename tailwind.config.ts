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
        faint: 'var(--faint)',
        portal: 'var(--portal)',
        coal: '#aaaaaa',
        iron: '#d4d4d4',
        goldrank: '#f5c842',
        emerald: '#4aff8c',
        diamond: '#4af0d8',
        netherite: '#c0a0ff'
      },
      fontFamily: {
        display: ['Monocraft', 'ui-monospace', 'monospace'],
        sans: ['Monocraft', 'ui-monospace', 'monospace']
      },
      keyframes: {
        'pulse-glow': {
          '0%,100%': { opacity: '0.6' },
          '50%': { opacity: '1' }
        }
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
} satisfies Config
