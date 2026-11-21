import type { Config } from 'tailwindcss';

// Colors are stored as space-separated RGB channels in CSS variables (see globals.css) so that
// Tailwind opacity modifiers work: bg-primary/20, border-border/60, ring-primary/40 ...
const c = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        'surface-subtle': c('surface-subtle'),
        border: c('border'),
        primary: {
          DEFAULT: c('primary'),
          hover: c('primary-hover'),
          soft: c('primary-soft'),
          fg: c('primary-fg'),
        },
        fg: { DEFAULT: c('fg'), muted: c('fg-muted') },
        ink: c('ink'),
        accent: { DEFAULT: c('accent'), fg: c('accent-fg') },
        success: { DEFAULT: c('success'), soft: c('success-soft') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'system-ui', 'sans-serif'],
        // Legacy alias: existing pages use `font-serif` for headings; they now render in the display face.
        serif: ['"Bricolage Grotesque"', 'Figtree', 'system-ui', 'sans-serif'],
      },
      // Radius by role: controls < cards < sheets. Base steps are re-tuned so existing pages follow.
      borderRadius: {
        lg: '0.625rem',
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        control: '0.75rem',
        card: '1.25rem',
        sheet: '1.75rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / 0.05), 0 6px 20px -8px rgb(var(--shadow) / 0.12)',
        card: '0 1px 2px rgb(var(--shadow) / 0.06), 0 14px 32px -14px rgb(var(--shadow) / 0.18)',
        elevated: '0 2px 4px rgb(var(--shadow) / 0.08), 0 30px 60px -20px rgb(var(--shadow) / 0.35)',
        focus: '0 0 0 4px rgb(var(--color-primary) / 0.22)',
      },
      letterSpacing: { display: '-0.025em' },
      keyframes: {
        draw: { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-6px)' },
          '40%,80%': { transform: 'translateX(6px)' },
        },
      },
      animation: { shake: 'shake 0.38s ease-in-out', draw: 'draw 0.5s ease-out both' },
    },
  },
  plugins: [],
} satisfies Config;
