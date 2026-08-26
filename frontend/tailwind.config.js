/**
 * Tailwind mapped onto the CSS custom properties in styles/tokens.css.
 *
 * Nothing here is a raw hex value. A component reaches for a semantic name —
 * `text-muted`, `border-hairline`, `shadow-e2` — and both themes follow.
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-deep': 'var(--bg-deep)',
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        'surface-hover': 'var(--surface-hover)',
        'surface-strong': 'var(--surface-strong)',
        'surface-inset': 'var(--surface-inset)',

        fg: 'var(--fg)',
        muted: 'var(--fg-muted)',
        subtle: 'var(--fg-subtle)',
        'on-accent': 'var(--fg-on-accent)',

        hairline: 'var(--border)',
        'hairline-strong': 'var(--border-strong)',
        highlight: 'var(--border-highlight)',

        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-subtle': 'var(--accent-subtle)',
        'accent-border': 'var(--accent-border)',

        high: 'var(--high)',
        'high-bg': 'var(--high-bg)',
        'high-border': 'var(--high-border)',
        medium: 'var(--medium)',
        'medium-bg': 'var(--medium-bg)',
        'medium-border': 'var(--medium-border)',
        stretch: 'var(--stretch)',
        'stretch-bg': 'var(--stretch-bg)',
        'stretch-border': 'var(--stretch-border)',

        danger: 'var(--danger)',
        'danger-bg': 'var(--danger-bg)',
        'danger-border': 'var(--danger-border)',
        success: 'var(--success)',
        'success-bg': 'var(--success-bg)',

        'seg-stack': 'var(--seg-stack)',
        'seg-level': 'var(--seg-level)',
        'seg-location': 'var(--seg-location)',
        'seg-fresh': 'var(--seg-fresh)',

        // Fixed charcoal brand chrome — ignores the light/dark toggle. See
        // the comment above `--brand-bg` in tokens.css.
        'brand-bg': 'var(--brand-bg)',
        'brand-bg-deep': 'var(--brand-bg-deep)',
        'brand-surface': 'var(--brand-surface)',
        'brand-surface-hover': 'var(--brand-surface-hover)',
        'brand-fg': 'var(--brand-fg)',
        'brand-fg-muted': 'var(--brand-fg-muted)',
        'brand-fg-subtle': 'var(--brand-fg-subtle)',
        'brand-border': 'var(--brand-border)',
        'brand-border-strong': 'var(--brand-border-strong)',
        'brand-accent': 'var(--brand-accent)',
        'brand-accent-hover': 'var(--brand-accent-hover)',
        'brand-accent-subtle': 'var(--brand-accent-subtle)',
        'brand-line': 'var(--brand-line)',
        'brand-glass': 'var(--brand-glass-bg)',
        'brand-input-bg': 'var(--brand-input-bg)',
        'brand-input-fg': 'var(--brand-input-fg)',
        'brand-input-muted': 'var(--brand-input-muted)',
      },
      backgroundImage: {
        'grad-accent': 'var(--grad-accent)',
        'grad-accent-hover': 'var(--grad-accent-hover)',
        'grad-surface': 'var(--grad-surface)',
        'grad-edge': 'var(--grad-edge)',
        'brand-grad-accent': 'var(--brand-grad-accent)',
        mesh: 'var(--grad-mesh)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        e0: 'var(--elev-0)',
        e1: 'var(--elev-1)',
        e2: 'var(--elev-2)',
        e3: 'var(--elev-3)',
        glow: 'var(--glow-accent)',
        'glow-high': 'var(--glow-high)',
        ring: 'var(--ring)',
        'brand-glow': 'var(--brand-glow)',
      },
      fontFamily: {
        sans: ["'Manrope Variable'", 'system-ui', 'sans-serif'],
        mono: ["'Fira Code'", 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // A modular scale, so nothing is an arbitrary size.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }], // 11
        xs: ['0.75rem', { lineHeight: '1.15rem' }], //  12
        sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13
        base: ['0.9375rem', { lineHeight: '1.5rem' }], // 15
        md: ['1.0625rem', { lineHeight: '1.65rem' }], // 17
        lg: ['1.25rem', { lineHeight: '1.75rem' }], //   20
        xl: ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.018em' }], // 24
        '2xl': ['1.875rem', { lineHeight: '2.35rem', letterSpacing: '-0.022em' }], // 30
        '3xl': ['2.5rem', { lineHeight: '2.9rem', letterSpacing: '-0.028em' }], // 40
        '4xl': ['3.25rem', { lineHeight: '3.5rem', letterSpacing: '-0.032em' }], // 52
        '5xl': ['4rem', { lineHeight: '4.2rem', letterSpacing: '-0.036em' }], //   64
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        7: 'var(--space-7)',
        sidebar: 'var(--sidebar-w)',
        topbar: 'var(--topbar-h)',
      },
      maxWidth: {
        measure: 'var(--measure)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        DEFAULT: 'var(--dur)',
        slow: 'var(--dur-slow)',
      },
      backdropBlur: {
        glass: 'var(--glass-blur)',
      },
    },
  },
  plugins: [],
}
