<div align="center">

# MCSR Client

**A clean, MCSR-Ranked–themed Minecraft client for 1.16.1 speedrunning.**

Ranked and RSG in one place — live stats, real launching, built-in paceman.

</div>

---

MCSR Client is a standalone desktop launcher built for Minecraft Speedrunning. It signs
you in with your Microsoft account, downloads and launches Minecraft 1.16.1 + Fabric
itself, and manages two purpose-built instances — no third-party launcher required.

## Features

- **Live Ranked dashboard.** Your MCSR Ranked profile front and center: ELO, tier
  (Coal → Netherite), peak, win rate, streaks, an ELO-over-time chart, your recent
  matches, the global leaderboard, and search for any player.
- **Two instances, one click.**
  - **Ranked** — the full MCSR Ranked modpack.
  - **RSG** — the same legal mod set with the ranked mod removed, plus the
    **SeedQueue** wall for instant resets. Built straight from the canonical pack so
    it's always tournament-legal.
- **Built-in paceman.** No Julti, no Jingle. MCSR Client bundles and auto-runs the
  paceman tracker alongside your RSG sessions and shows your **live pace** right on the
  home screen.
- **It just works.** Java, Minecraft, Fabric, and every mod are fetched and verified
  for you. Hit *Verify* any time to repair an instance.

## Getting started

> Requires a Minecraft: Java Edition account.

```bash
npm install
npm run dev
```

1. Sign in with Microsoft.
2. Open **Play** and launch **Ranked** or **RSG** (first launch downloads everything).
3. For RSG pace, paste your paceman.gg access key in **Settings**
   (paceman.gg → sign in with Discord → Generate Access Token).

### Build a Windows installer

```bash
npm run dist
```

Outputs an installer under `release/`.

## How it works

| Area | Approach |
| --- | --- |
| Launching | GMLL installs Java + Minecraft 1.16.1 + Fabric and isolates each instance |
| Auth | Microsoft sign-in; your session stays encrypted on this device |
| Mods | Parses the MCSR Ranked `.mrpack`, verifies every file (sha512), filters ranked-only jars for RSG |
| Pace | The standalone paceman tracker, configured and run for you |
| Stats | The public MCSR Ranked API + the paceman stats API |

## Project layout

```
src/shared      IPC contract + shared types
src/core        pure logic (rank mapping, formatting) — unit tested
src/services    MCSR Ranked + paceman API clients — unit tested
src/main        Electron main: auth, launcher, instances, paceman, IPC
src/preload     typed contextBridge bridge
src/renderer    React UI (the MCSR Client theme + dashboard)
```

```bash
npm test          # unit tests
npm run typecheck # main + renderer
npm run build     # bundle
```

## Credits

MCSR Client stands on the shoulders of the MCSR community:

- [MCSR Ranked](https://mcsrranked.com) and its public [API](https://docs.mcsrranked.com)
- [paceman.gg](https://paceman.gg) and the PaceMan Tracker
- The [legal-mods](https://github.com/Minecraft-Java-Edition-Speedrunning/legal-mods) project and [RedLime's MCSR Mods](https://redlime.github.io/MCSRMods/)
- **SeedQueue** by contariaa, **SpeedRunIGT**, and the wider speedrunning mod ecosystem
- [Monocraft](https://github.com/IdreesInc/Monocraft) (SIL OFL 1.1) for the display font

Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang AB.

## License

[MIT](LICENSE) © xSIRDON
