import { InstanceCard } from '../components/InstanceCard'

export function Play() {
  return (
    <div className="mx-auto max-w-[980px] px-7 py-7">
      <header className="mb-6">
        <h1 className="font-display text-2xl tracking-wide text-text">Play</h1>
        <p className="mt-1 text-sm text-muted">
          Two purpose-built 1.16.1 instances. Ranked carries the MCSR Ranked modpack; RSG drops the
          ranked mod and adds the SeedQueue wall with paceman pace tracking.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <InstanceCard id="ranked" />
        <InstanceCard id="rsg" />
      </div>

      <p className="mt-6 text-xs text-faint">
        First launch downloads Java, Minecraft 1.16.1, Fabric, and the mods — later launches are
        instant. Use “Verify” to repair any instance.
      </p>
    </div>
  )
}
