import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { usePlayerSuggestions } from '../hooks/usePlayerSuggestions'
import { PlayerHead } from './PlayerHead'

/**
 * Controlled player-name input with MCSR-sourced typeahead.
 * Tab completes to the highlighted suggestion; Enter submits; ↑/↓ move; Esc closes.
 * The dropdown renders in a portal (position: fixed) so it can't be trapped behind sibling
 * cards that create their own stacking contexts (e.g. anything with a transform/animation).
 */
export function PlayerAutocomplete({
  value,
  onChange,
  onSubmit,
  onBlur,
  placeholder,
  className,
  style,
  dropUp = false,
  autoFocus = false
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (name: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  dropUp?: boolean
  autoFocus?: boolean
}) {
  const suggestions = usePlayerSuggestions(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const showList = open && suggestions.length > 0

  // Track the input's on-screen position so the fixed-position dropdown stays glued to it.
  useLayoutEffect(() => {
    if (!showList) return
    const update = (): void => setRect(wrapRef.current?.getBoundingClientRect() ?? null)
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [showList, suggestions.length])

  // Reset the highlight whenever the query changes.
  useLayoutEffect(() => setActive(-1), [value])

  function choose(name: string): void {
    onChange(name)
    onSubmit(name)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Tab') {
      if (showList) {
        e.preventDefault()
        onChange(suggestions[active >= 0 ? active : 0])
        setActive(-1)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && suggestions[active]) choose(suggestions[active])
      else if (value.trim()) choose(value.trim())
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const menuStyle: CSSProperties = rect
    ? {
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 100,
        ...(dropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 })
      }
    : { display: 'none' }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120)
          onBlur?.()
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        className={className}
        style={style}
      />
      {showList &&
        createPortal(
          <ul
            style={menuStyle}
            className="max-h-[248px] overflow-auto rounded-lg border border-[var(--line)] bg-[var(--bg-2)] py-1 shadow-2xl"
          >
            {suggestions.map((name, i) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(name)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                    i === active ? 'bg-white/[0.06] text-text' : 'text-muted'
                  }`}
                >
                  <PlayerHead id={name} uuid={name} size={20} className="rounded" />
                  <span className="truncate">{name}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  )
}
