/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 编辑器语义色 → tokens.css 的 --ui-*（写类名不再写死色值）
      colors: {
        base: 'var(--ui-bg)',
        panel: 'var(--ui-panel)',
        soft: 'var(--ui-panel-soft)',
        hover: 'var(--ui-panel-hover)',
        line: { DEFAULT: 'var(--ui-line)', strong: 'var(--ui-line-strong)' },
        ink: { DEFAULT: 'var(--ui-ink)', dim: 'var(--ui-ink-dim)', faint: 'var(--ui-ink-faint)' },
        brand: {
          DEFAULT: 'var(--ui-brand)',
          hover: 'var(--ui-brand-hover)',
          soft: 'var(--ui-brand-soft)',
          line: 'var(--ui-brand-line)',
        },
        ok: { DEFAULT: 'var(--ui-ok)', soft: 'var(--ui-ok-soft)' },
        warn: { DEFAULT: 'var(--ui-warn)', soft: 'var(--ui-warn-soft)' },
        danger: { DEFAULT: 'var(--ui-danger)', soft: 'var(--ui-danger-soft)' },
      },
      borderRadius: { md2: 'var(--ui-radius)' },
      boxShadow: { pop: 'var(--ui-shadow-pop)', card: 'var(--ui-shadow-card)' },
    },
  },
  plugins: [],
};
