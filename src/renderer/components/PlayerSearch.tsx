import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function PlayerSearch({ placeholder = 'Search any player…' }: { placeholder?: string }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = q.trim()
    if (name) navigate(`/profile?name=${encodeURIComponent(name)}`)
  }

  return (
    <form onSubmit={submit} className="no-drag relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
      >
        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-2)] py-2 pl-9 pr-3 text-sm text-text outline-none transition-colors placeholder:text-faint focus:border-[var(--gold)]/40 focus:ring-2 focus:ring-[var(--gold)]/15"
      />
    </form>
  )
}
