/**
 * Light / dark / system.
 *
 * Three states, not two. "System" is the default and has to stay reachable —
 * a user who follows their OS theme should be able to get back to it after
 * trying the other two, and a two-way switch quietly takes that away.
 *
 * The choice is written to `data-theme` on the root element, which the token
 * layer keys off, and remembered in localStorage. (No secret lives there — this
 * is a display preference, unlike the auth token, which stays in memory.)
 */

import { useEffect, useState } from 'react'

import { IconMonitor, IconMoon, IconSun } from './icons'
import { cx } from './ui'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'jobradar-theme'

const OPTIONS: { value: Theme; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'Light', Icon: IconSun },
  { value: 'dark', label: 'Dark', Icon: IconMoon },
  { value: 'system', label: 'System', Icon: IconMonitor },
]

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Private browsing, or storage disabled. System is a fine answer.
  }
  return 'system'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Not being able to remember it is not worth breaking the page over.
    }
  }, [theme])

  return (
    <fieldset
      className="flex items-center gap-0.5 rounded-full border border-hairline bg-surface-inset p-0.5 shadow-e0"
      aria-label="Colour theme"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value
        return (
          <label
            key={option.value}
            title={option.label}
            className={cx(
              'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full',
              'transition-all duration-fast ease-out',
              'focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent',
              active
                ? 'bg-grad-accent text-on-accent shadow-e1'
                : 'text-subtle hover:bg-surface-hover hover:text-fg',
            )}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={active}
              onChange={() => setTheme(option.value)}
              className="sr-only"
            />
            <option.Icon size={15} />
            <span className="sr-only">{option.label}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
