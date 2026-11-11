import home from '../assets/icons/home.svg'
import play from '../assets/icons/play.svg'
import trophy from '../assets/icons/trophy.svg'
import chart from '../assets/icons/chart.svg'
import swords from '../assets/icons/swords.svg'
import target from '../assets/icons/target.svg'
import console from '../assets/icons/console.svg'
import profile from '../assets/icons/profile.svg'
import settings from '../assets/icons/settings.svg'
import friends from '../assets/icons/friends.svg'

const ICONS = { home, play, trophy, chart, swords, target, console, profile, settings, friends }

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
