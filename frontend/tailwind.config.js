/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mapped to the CSS custom properties in index.css, so there is a single
        // source of truth for the palette across light and dark.
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-strong': 'var(--surface-strong)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        hairline: 'var(--border)',
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        high: 'var(--high)',
        medium: 'var(--medium)',
        stretch: 'var(--stretch)',
        danger: 'var(--danger)',
      },
    },
  },
  plugins: [],
}
