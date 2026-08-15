/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mapped to the CSS custom properties in index.css so there is a single
        // source of truth for the palette across light and dark.
        bg: 'var(--bg)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        hairline: 'var(--border)',
      },
    },
  },
  plugins: [],
}
