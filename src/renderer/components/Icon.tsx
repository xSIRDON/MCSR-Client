import home from '../assets/icons/home.svg'
import play from '../assets/icons/play.svg'
import trophy from '../assets/icons/trophy.svg'
import chart from '../assets/icons/chart.svg'
import swords from '../assets/icons/swords.svg'
import target from '../assets/icons/target.svg'
import console from '../assets/icons/console.svg'
import profile from '../assets/icons/profile.svg'
import settings from '../assets/icons/settings.svg'
import watchlist from '../assets/icons/watchlist.svg'
import refresh from '../assets/icons/refresh.svg'
import copy from '../assets/icons/copy.svg'
import upload from '../assets/icons/upload.svg'
import trash from '../assets/icons/trash.svg'
import broom from '../assets/icons/broom.svg'

const ICONS = { home, play, trophy, chart, swords, target, console, profile, settings, watchlist, refresh, copy, upload, trash, broom }

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <img
      src={ICONS[name]}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={`pixelated shrink-0 ${className ?? ''}`}
    />
  )
}
