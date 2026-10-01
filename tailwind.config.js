/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Palette borrowed from SubmitCue's workspace: deep ink text on frosted white,
      // one signal-blue accent. Semantic names so components never reach for raw steps.
      colors: {
        ink: { DEFAULT: '#0a1324', title: '#232f47', 2: '#37455e' },
        muted: '#6a7b96',
        faint: '#94a3b8',
        hairline: { DEFAULT: '#e4e9f2', strong: '#d2dae8' },
        accent: { DEFAULT: '#1e63e9', ink: '#1a55ce', wash: 'rgba(30, 99, 233, 0.08)' },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Roboto',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // The one lift every glass panel wears, plus a top-edge highlight that sells the pane
        glass:
          '0 1px 2px rgba(10, 19, 36, 0.05), 0 14px 34px -16px rgba(10, 19, 36, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        control: '0 1px 2px rgba(10, 19, 36, 0.06)',
      },
      // Motion tokens: short, calm, one easing family. Paired with src/styles/motion.ts
      transitionDuration: { fast: '120ms', base: '180ms', slow: '240ms' },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(0.2, 0, 0, 1) both',
        'rise-in': 'rise-in 180ms cubic-bezier(0.2, 0, 0, 1) both',
        'pulse-soft': 'pulse-soft 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
