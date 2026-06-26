import { InstanceCard } from '../components/InstanceCard'

export function Play() {
  return (
    <div className="mx-auto max-w-[920px] px-5 py-5">
      <header className="mb-4">
        <h1 className="font-display text-xl tracking-wide text-text">Play</h1>
        <p className="mt-1 text-sm text-muted">
          Two purpose-built 1.16.1 instances. Pick one in the bar below and hit Play.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <InstanceCard id="ranked" />
        <InstanceCard id="rsg" />
      </div>

      <p className="mt-4 text-xs text-faint">
        First launch downloads Java, Minecraft 1.16.1, Fabric, and the mods — later launches are
        instant. Use “Verify” to repair any instance.
      </p>
    </div>
  )
}
