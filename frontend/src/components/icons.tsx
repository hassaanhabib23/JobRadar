/**
 * Icons.
 *
 * Inline SVG (Lucide geometry), not an icon font and not emoji. Emoji render
 * differently on every platform, cannot be recoloured, and are announced as
 * their unicode name by a screen reader — "check mark button" in the middle of
 * a sentence.
 *
 * Every icon is `aria-hidden` by default: it sits beside a real label. When one
 * genuinely stands alone, pass a `title` and it becomes a labelled image.
 */

import type { SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  /** Only for an icon with no adjacent text. Otherwise leave it out. */
  title?: string
  size?: number
}

function Icon({ title, size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Scales with the text it sits next to rather than fighting it.
      className="shrink-0"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

export const IconRadar = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" opacity="0.4" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 12 18.5 7" />
    <circle cx="18.5" cy="7" r="1.6" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconBriefcase = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </Icon>
)

export const IconSliders = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="16" cy="18" r="2" />
  </Icon>
)

export const IconHistory = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </Icon>
)

export const IconSearch = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)

export const IconCheck = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4 12.5 5 5L20 6.5" />
  </Icon>
)

export const IconPlus = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconClose = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const IconChevronDown = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const IconChevronRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)

export const IconArrowLeft = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Icon>
)

export const IconArrowUp = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
)

export const IconArrowDown = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M18 13l-6 6-6-6" />
  </Icon>
)

export const IconSort = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 4v16M4 8l4-4 4 4" opacity="0.5" />
    <path d="M16 20V4M20 16l-4 4-4-4" opacity="0.5" />
  </Icon>
)

export const IconExternal = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
)

export const IconRefresh = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
    <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
    <path d="M21 3v5h-5M3 21v-5h5" />
  </Icon>
)

export const IconAlert = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 1.8 20.5h20.4L12 3.5Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconGhost = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 21V10a7 7 0 1 1 14 0v11l-2.3-1.8-2.4 1.8-2.3-1.8-2.4 1.8L7.3 19.2 5 21Z" />
    <circle cx="9.5" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconSparkle = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
  </Icon>
)

export const IconCalendar = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
)

export const IconLogout = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Icon>
)

export const IconSun = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
)

export const IconMoon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Icon>
)

export const IconMonitor = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Icon>
)

export const IconMenu = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

export const IconPin = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.5 3.5 20.5 9.5l-3.4 1.1-3.3 5.6-4.6-4.6 5.6-3.3L14.5 3.5Z" />
    <path d="m9.2 14.8-4.7 4.7" />
  </Icon>
)

export const IconTarget = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconLayers = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" opacity="0.5" />
  </Icon>
)

export const IconMapPin = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Icon>
)
