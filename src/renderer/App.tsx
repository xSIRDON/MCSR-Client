import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import type { UpdateStatus } from '@shared/types'
import { useUi } from './store/uiStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { FriendsRail } from './components/FriendsRail'
import { ToastHost } from './components/Toast'
import { useMessagesBridge } from './store/messagesStore'
import { PlayBar } from './components/PlayBar'
import { InstallMapPicker } from './components/InstallMapPicker'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Play } from './pages/Play'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'
import { Instance } from './pages/Instance'
import { Console } from './pages/Console'
import { Leaderboard } from './pages/Leaderboard'
import { SelfReview } from './pages/SelfReview'
import { Compare } from './pages/Compare'
import { Practice } from './pages/Practice'
import { McsrLogo } from './components/Logo'

export function App() {
  const { profile, authReady, setProfile, setAuthReady, setPacemanName, setFavorites } = useUi()
  useMessagesBridge()

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [p, cfg, pace] = await Promise.all([
          window.mcsr.auth.restore(),
          window.mcsr.config.get(),
          window.mcsr.paceman.status()
        ])
        if (!active) return
        if (p) setProfile(p)
        // Paceman is connected when a name was explicitly saved, OR an access key exists (the user
        // opted in) — in which case default stats lookups to their IGN. No key and no name => null,
        // so an unconnected player never silently surfaces paceman runs that match their IGN.
        setPacemanName(cfg.pacemanName ?? (pace.hasKey ? (p?.name ?? null) : null))
        setFavorites(cfg.favorites ?? [])
        // Join the friends network automatically once signed in — no setup, no Settings toggle.
        // The Mojang handshake needs the launch token, which the restore above just provided.
        if (p) void window.mcsr.friends.autoConnect()
      } finally {
        if (active) setAuthReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [setProfile, setAuthReady, setPacemanName, setFavorites])

  return (
    <div className="relative z-10 flex h-full flex-col">
      <TitleBar />
      {!authReady ? (
        <Splash />
      ) : !profile ? (
        <Login />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <UpdateBanner />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/play" element={<Play />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/review" element={<SelfReview />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/practice" element={<Practice />} />
                <Route path="/console" element={<Console />} />
                <Route path="/instance/:id" element={<Instance />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
            <FriendsRail />
          </div>
          <PlayBar />
          <InstallMapPicker />
          <ToastHost />
        </div>
      )}
    </div>
  )
}

/** Slim global banner shown once an update has finished downloading. */
function UpdateBanner() {
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    void window.mcsr.updater.status().then(setUpd)
    return window.mcsr.updater.onStatusChanged(setUpd)
  }, [])
  if (upd.state !== 'ready') return null
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-b border-[var(--win)]/25 bg-[var(--win)]/10 px-4 py-1.5 text-sm text-[var(--win)]">
      <span>Update {upd.version ? `v${upd.version} ` : ''}downloaded and ready.</span>
      <button
        onClick={() => void window.mcsr.updater.install()}
        className="font-display rounded-md bg-[var(--win)] px-3 py-1 text-xs text-[#07140a] transition-all hover:brightness-110"
      >
        Restart &amp; update
      </button>
    </div>
  )
}

function Splash() {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex flex-col items-center gap-3 opacity-80">
        <div className="animate-pulse-glow">
          <McsrLogo size={46} />
        </div>
        <div className="font-display text-sm tracking-[0.3em] text-muted">MCSR CLIENT</div>
      </div>
    </div>
  )
}
