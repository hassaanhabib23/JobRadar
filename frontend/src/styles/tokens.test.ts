/**
 * Contrast, asserted rather than assumed.
 *
 * The premium pass introduced translucency, gradients and a much lighter
 * elevation vocabulary, and translucency is the one thing here that can quietly
 * break legibility — a glass panel over a mesh gradient looks fine on the
 * designer's screen and fails on someone else's.
 *
 * So every foreground/background pair the app actually renders is checked
 * against WCAG AA in **both** themes: 4.5:1 for body text, 3:1 for large text
 * and for the boundaries of interactive elements.
 *
 * The tokens are parsed out of `tokens.css` itself, not duplicated here. A
 * duplicated palette would drift, and a test that checks last month's colours
 * proves nothing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Resolved from the project root rather than import.meta.url: the jsdom
// environment rewrites module URLs, and fileURLToPath then rejects them.
const CSS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

/* --- Parsing -------------------------------------------------------------- */

/** The tokens declared inside one selector block. */
function block(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector)
  if (start === -1) throw new Error(`No such selector in tokens.css: ${selector}`)

  // Walk braces from the selector so a nested block cannot end it early.
  let depth = 0
  let end = start
  for (let i = CSS.indexOf('{', start); i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1
    else if (CSS[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }

  const tokens: Record<string, string> = {}
  for (const match of CSS.slice(start, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]!] = match[2]!.trim()
  }
  return tokens
}

const LIGHT = block(':root {')
const DARK = block(":root[data-theme='dark']")

/* --- Colour maths --------------------------------------------------------- */

function parseHex(value: string): [number, number, number] {
  const hex = value.trim().replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(parseHex(a)), luminance(parseHex(b))]
  const [lighter, darker] = x > y ? [x, y] : [y, x]
  return (lighter + 0.05) / (darker + 0.05)
}

/* --- The pairs the app actually renders ----------------------------------- */

/** [foreground, background, minimum, what it is]. */
const TEXT_PAIRS: [string, string, number, string][] = [
  ['--fg', '--bg', 4.5, 'body text on the page'],
  ['--fg', '--surface', 4.5, 'body text on a card'],
  ['--fg', '--surface-raised', 4.5, 'body text on a raised card'],
  ['--fg', '--surface-inset', 4.5, 'body text on an inset well'],
  ['--fg-muted', '--bg', 4.5, 'secondary text on the page'],
  ['--fg-muted', '--surface', 4.5, 'secondary text on a card'],
  ['--fg-muted', '--surface-inset', 4.5, 'secondary text in a well'],
  ['--fg-subtle', '--bg', 4.5, 'tertiary text on the page'],
  ['--fg-subtle', '--surface', 4.5, 'tertiary text on a card'],
  ['--fg-subtle', '--surface-inset', 4.5, 'tertiary text in a well'],

  ['--accent', '--bg', 4.5, 'a link on the page'],
  ['--accent', '--surface', 4.5, 'a link on a card'],
  ['--accent', '--accent-subtle', 4.5, 'the active nav / selected chip'],

  ['--high', '--high-bg', 4.5, 'the High tier badge'],
  ['--medium', '--medium-bg', 4.5, 'the Medium tier badge'],
  ['--stretch', '--stretch-bg', 4.5, 'the Stretch tier badge'],
  ['--danger', '--danger-bg', 4.5, 'an error message'],
  ['--success', '--success-bg', 4.5, 'a success message'],
  ['--danger', '--surface', 4.5, 'an inline field error'],
  ['--high', '--surface', 4.5, 'the saved confirmation'],
]

/**
 * Brand chrome: fixed-charcoal surfaces that ignore the light/dark toggle
 * (marketing header, hero/CTA, login's left panel, app shell chrome). These
 * tokens are declared once, not per theme (see `NON_THEMED`), so they're
 * checked once rather than inside the per-theme loop below.
 */
const BRAND_TEXT_PAIRS: [string, string, number, string][] = [
  ['--brand-fg', '--brand-bg', 4.5, 'body text on brand chrome'],
  ['--brand-fg', '--brand-surface', 4.5, 'body text on a brand-chrome card'],
  ['--brand-fg-muted', '--brand-bg', 4.5, 'secondary text on brand chrome'],
  ['--brand-fg-subtle', '--brand-bg', 4.5, 'tertiary text on brand chrome'],
  ['--brand-accent', '--brand-bg', 4.5, 'an amber accent on brand chrome'],
  ['--brand-input-fg', '--brand-input-bg', 4.5, 'text in the hero search bar'],
  ['--brand-input-muted', '--brand-input-bg', 4.5, 'placeholder text in the hero search bar'],
]

const BRAND_UI_PAIRS: [string, string, number, string][] = [
  ['--brand-border-strong', '--brand-bg', 3, 'a control border on brand chrome'],
  ['--brand-accent', '--brand-surface', 3, 'the focus ring against brand chrome'],
]

/**
 * Non-text pairs. 3:1 under 1.4.11, because these carry meaning as shapes: a
 * border you cannot see is a control you cannot find.
 */
const UI_PAIRS: [string, string, number, string][] = [
  ['--border-strong', '--bg', 3, 'a control border on the page'],
  ['--border-strong', '--surface', 3, 'a control border on a card'],
  ['--accent', '--surface', 3, 'the focus ring against a card'],
  ['--seg-stack', '--surface-strong', 3, 'the stack score segment'],
  ['--seg-level', '--surface-strong', 3, 'the level score segment'],
  ['--seg-location', '--surface-strong', 3, 'the location score segment'],
  ['--seg-fresh', '--surface-strong', 3, 'the freshness score segment'],
]

/**
 * The lightest stop of a gradient, read out of the token itself.
 *
 * The dark stop is the easy case; the light one is where white button text is
 * at risk, so that is the one checked — and reading it from the token means
 * retuning the gradient cannot silently skip this check.
 */
function lightestStop(gradient: string): string {
  const stops = [...gradient.matchAll(/#[0-9a-f]{6}/gi)].map((match) => match[0])
  if (stops.length === 0) throw new Error(`No hex stops in gradient: ${gradient}`)
  return stops.reduce((lightest, stop) =>
    luminance(parseHex(stop)) > luminance(parseHex(lightest)) ? stop : lightest,
  )
}

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme contrast', (_themeName, tokens) => {
  it('parsed a full palette out of tokens.css', () => {
    // Guards the parser itself: a silently empty block would pass every test
    // below by vacuous truth.
    expect(Object.keys(tokens).length).toBeGreaterThan(40)
    expect(tokens['--fg']).toMatch(/^#/)
  })

  it.each(TEXT_PAIRS)('%s on %s meets %s:1 — %s', (fg, bg, minimum) => {
    const ratio = contrast(tokens[fg]!, tokens[bg]!)
    expect(
      Number(ratio.toFixed(2)),
      `${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(minimum)
  })

  it.each(UI_PAIRS)('%s against %s meets %s:1 — %s', (fg, bg, minimum) => {
    const ratio = contrast(tokens[fg]!, tokens[bg]!)
    expect(
      Number(ratio.toFixed(2)),
      `${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(minimum)
  })

  it.each(['--grad-accent', '--grad-accent-hover'])(
    'keeps button text legible on the lightest stop of %s',
    (name) => {
      const stop = lightestStop(tokens[name]!)
      // 3:1: the primary button is 15px semibold — large text by WCAG's
      // definition of bold at that size — and this is the worst point on it.
      expect(
        Number(contrast(tokens['--fg-on-accent']!, stop).toFixed(2)),
        `${name}'s lightest stop is ${stop}`,
      ).toBeGreaterThanOrEqual(3)
    },
  )
})

describe('brand chrome contrast', () => {
  it.each(BRAND_TEXT_PAIRS)('%s on %s meets %s:1 — %s', (fg, bg, minimum) => {
    const ratio = contrast(LIGHT[fg]!, LIGHT[bg]!)
    expect(
      Number(ratio.toFixed(2)),
      `${fg} (${LIGHT[fg]}) on ${bg} (${LIGHT[bg]}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(minimum)
  })

  it.each(BRAND_UI_PAIRS)('%s against %s meets %s:1 — %s', (fg, bg, minimum) => {
    const ratio = contrast(LIGHT[fg]!, LIGHT[bg]!)
    expect(
      Number(ratio.toFixed(2)),
      `${fg} (${LIGHT[fg]}) on ${bg} (${LIGHT[bg]}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(minimum)
  })

  it('keeps button text legible on the lightest stop of --brand-grad-accent', () => {
    const stop = lightestStop(LIGHT['--brand-grad-accent']!)
    expect(
      Number(contrast('#ffffff', stop).toFixed(2)),
      `--brand-grad-accent's lightest stop is ${stop}`,
    ).toBeGreaterThanOrEqual(3)
  })
})

describe('theme parity', () => {
  it('defines every light token in dark too', () => {
    // A token that exists in one theme only renders as `unset` in the other —
    // usually as invisible black text.
    const missing = Object.keys(LIGHT).filter(
      (name) => !(name in DARK) && !name.startsWith('--space') && !NON_THEMED.has(name),
    )
    expect(missing).toEqual([])
  })

  it('keeps the system-preference block in step with the explicit dark block', () => {
    // Dark is declared twice — once for [data-theme='dark'] and once inside the
    // prefers-color-scheme media query — because a media query cannot be
    // re-targeted by an attribute. They have to agree or the theme silently
    // depends on how you arrived at it.
    const media = block('@media (prefers-color-scheme: dark)')
    for (const [name, value] of Object.entries(DARK)) {
      expect(media[name]?.replace(/\s+/g, ' '), `${name} differs between the two dark blocks`).toBe(
        value.replace(/\s+/g, ' '),
      )
    }
  })
})

/** Structural tokens that are theme-independent by design. */
const NON_THEMED = new Set([
  '--radius-sm',
  '--radius',
  '--radius-lg',
  '--radius-xl',
  '--radius-full',
  '--ease',
  '--ease-out',
  '--dur-fast',
  '--dur',
  '--dur-slow',
  '--sidebar-w',
  '--topbar-h',
  '--measure',
  '--brand-bg',
  '--brand-bg-deep',
  '--brand-surface',
  '--brand-surface-hover',
  '--brand-border',
  '--brand-border-strong',
  '--brand-fg',
  '--brand-fg-muted',
  '--brand-fg-subtle',
  '--brand-accent',
  '--brand-accent-hover',
  '--brand-accent-subtle',
  '--brand-glass-bg',
  '--brand-grad-accent',
  '--brand-glow',
  '--brand-line',
  '--brand-input-bg',
  '--brand-input-fg',
  '--brand-input-muted',
])
