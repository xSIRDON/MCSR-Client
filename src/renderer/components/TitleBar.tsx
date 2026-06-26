import { NetheriteBlock } from './BlockArt'

export function TitleBar() {
  return (
    <div className="drag flex h-10 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
      <div className="flex items-center gap-2.5 select-none">
        <NetheriteBlock size={18} />
        <span className="font-display text-sm tracking-[0.18em] text-text">MCSR CLIENT</span>
      </div>
      <div className="no-drag flex items-center gap-1">
        <button
          onClick={() => window.mcsr.window.minimize()}
          className="grid h-7 w-9 place-items-center rounded text-muted hover:bg-white/5 hover:text-text"
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="5.5" width="8" height="1.2" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => window.mcsr.window.close()}
          className="grid h-7 w-9 place-items-center rounded text-muted hover:bg-[var(--loss)]/20 hover:text-[var(--loss)]"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
    </div>
  )
}
