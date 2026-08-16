/**
 * Tailwind mapped onto the CSS custom properties in styles/tokens.css.
 *
 * Nothing here is a raw hex value. A component that needs a colour reaches for
 * a semantic name — `text-muted`, `border-hairline`, `bg-high-bg` — and light
 * and dark both follow automatically.
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-subtle': 'var(--bg-subtle)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-strong': 'var(--surface-strong)',

        fg: 'var(--fg)',
        muted: 'var(--fg-muted)',
        subtle: 'var(--fg-subtle)',
        'on-accent': 'var(--fg-on-accent)',

        hairline: 'var(--border)',
        'hairline-strong': 'var(--border-strong)',

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
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
      },
      fontFamily: {
        sans: ["'Fira Sans'", 'system-ui', 'sans-serif'],
        mono: ["'Fira Code'", 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // A modular scale, so nothing is an arbitrary size.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11
        xs: ['0.75rem', { lineHeight: '1.125rem' }], //  12
        sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13
        base: ['0.875rem', { lineHeight: '1.375rem' }], // 14
        md: ['1rem', { lineHeight: '1.5rem' }], //         16
        lg: ['1.125rem', { lineHeight: '1.625rem' }], //   18
        xl: ['1.375rem', { lineHeight: '1.75rem' }], //    22
        '2xl': ['1.75rem', { lineHeight: '2.125rem' }], // 28
        '3xl': ['2.25rem', { lineHeight: '2.5rem' }], //   36
        '4xl': ['3rem', { lineHeight: '3.25rem' }], //     48
      },
      spacing: {
        // Dense scale: this is a tool you scan, not a page you read.
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
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        DEFAULT: 'var(--dur)',
      },
    },
  },
  plugins: [],
}
