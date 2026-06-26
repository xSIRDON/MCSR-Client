import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useUi } from './store/uiStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { PlayBar } from './components/PlayBar'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Play } from './pages/Play'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'
import { Instance } from './pages/Instance'
import { Console } from './pages/Console'
import { ObsidianBlock } from './components/BlockArt'

export function App() {
  const { profile, authReady, setProfile, setAuthReady, setPacemanName } = useUi()

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [p, cfg] = await Promise.all([
          window.obsidian.auth.restore(),
          window.obsidian.config.get()
        ])
        if (!active) return
        if (p) setProfile(p)
        setPacemanName(cfg.pacemanName ?? p?.name ?? null)
      } finally {
        if (active) setAuthReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [setProfile, setAuthReady, setPacemanName])

  return (
    <div className="relative z-10 flex h-full flex-col">
      <TitleBar />
      {!authReady ? (
        <Splash />
      ) : !profile ? (
        <Login />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/play" element={<Play />} />
                <Route path="/console" element={<Console />} />
                <Route path="/instance/:id" element={<Instance />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
          <PlayBar />
        </div>
      )}
    </div>
  )
}

function Splash() {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex flex-col items-center gap-3 opacity-80">
        <div className="animate-pulse-glow">
          <ObsidianBlock size={40} />
        </div>
        <div className="font-display text-sm tracking-[0.3em] text-muted">MCSR CLIENT</div>
      </div>
    </div>
  )
}
