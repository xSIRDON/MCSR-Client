import { InstanceCard } from '../components/InstanceCard'

export function Play() {
  return (
    <div className="mx-auto max-w-[920px] px-5 py-5">
      <h1 className="mb-4 font-display text-xl text-text">Play</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <InstanceCard id="ranked" />
        <InstanceCard id="rsg" />
        <InstanceCard id="zsg" />
      </div>

      <p className="mt-4 text-xs text-faint">
        The first launch downloads Java, Minecraft 1.16.1, Fabric and the mods. Verify repairs a broken install.
      </p>
    </div>
  )
}
