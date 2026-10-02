import type { SVGProps } from 'react'
import { cn } from '../lib/cn'

/** Inline-SVG icon set (24×24, stroke). Directional icons flip automatically in RTL: «chevron-end» points toward the end of a line. */
const P: Record<string, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12.5l3 3 5-6',
  'x-circle': 'M12 21a9 9 0 100-18 9 9 0 000 18zM9 9l6 6M15 9l-6 6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-end': 'M9 6l6 6-6 6',
  'chevron-start': 'M15 6l-6 6 6 6',
  'arrow-end': 'M5 12h14M13 6l6 6-6 6',
  'arrow-start': 'M19 12H5M11 6l-6 6 6 6',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zM9 12l2 2 4-4',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  card: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M7 15h4',
  wallet: 'M4 7a2 2 0 012-2h11v4M4 7v10a2 2 0 002 2h13a1 1 0 001-1v-8a1 1 0 00-1-1H6a2 2 0 01-2-2zM16 14h2',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-3.5 3.6-6 8-6s8 2.5 8 6',
  gift: 'M4 11h16v9H4zM3 8h18v3H3zM12 8v12M12 8c-1-3-5-4-5-1.5C7 8 9 8 12 8zM12 8c1-3 5-4 5-1.5C17 8 15 8 12 8z',
  headset: 'M4 14v-2a8 8 0 0116 0v2M4 14h3v5H5a1 1 0 01-1-1zM20 14h-3v5h2a1 1 0 001-1zM17 19c0 1.5-2 2-5 2',
  home: 'M4 11l8-7 8 7M6 10v10h4v-6h4v6h4V10',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  warning: 'M12 4l9 16H3zM12 10v4M12 17.2v.1',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.1',
  alert: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5v5M12 16v.1',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  'eye-off': 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 7.7C3.9 9.4 2 12 2 12s3.6 7 10 7c1.5 0 2.8-.4 4-.9M9.9 9.9a3 3 0 004.2 4.2',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  refresh: 'M20 11a8 8 0 00-14.5-4M4 5v4h4M4 13a8 8 0 0014.5 4M20 19v-4h-4',
  'trending-up': 'M3 17l6-6 4 4 8-8M15 7h6v6',
  'trending-down': 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  send: 'M21 3L3 10.5l7 3 3 7zM10 13.5L21 3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z',
  coins: 'M12 10c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  bank: 'M3 9l9-5 9 5zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6M14 20h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  image: 'M4 5h16v14H4zM8 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM4 17l5-5 4 4 3-3 4 4',
  hourglass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5v.1',
}

export type IconName = keyof typeof P

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  /** accessible name; icons are decorative (aria-hidden) when omitted */
  title?: string
}

export function Icon({ name, size = 20, title, className, ...rest }: IconProps) {
  const d = P[name]
  const flip = name === 'chevron-end' || name === 'chevron-start' || name === 'arrow-end' || name === 'arrow-start'
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      className={cn('shrink-0', flip && 'rtl:-scale-x-100', className)}
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}
