/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'surface': 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        'surface-strong': 'var(--color-surface-strong)',
        'primary': 'var(--color-text-primary)',
        'secondary': 'var(--color-text-secondary)',
        'subdued': 'var(--color-text-subdued)',
        'inverse': 'var(--color-text-inverse)',
        'structural': 'var(--color-border-structural)',
        'control': 'var(--color-border-control)',
        'action-primary': 'var(--color-action-primary)',
        'action-primary-hover': 'var(--color-action-primary-hover)',
        'action-secondary': 'var(--color-action-secondary)',
        'destructive': 'var(--color-action-destructive)',
        'focus': 'var(--color-focus)',
        'selection': 'var(--color-selection)',
      },
      spacing: {
        'space-1': 'var(--space-1)',
        'space-2': 'var(--space-2)',
        'space-3': 'var(--space-3)',
        'space-4': 'var(--space-4)',
        'space-5': 'var(--space-5)',
        'space-6': 'var(--space-6)',
        'space-7': 'var(--space-7)',
      },
      borderRadius: {
        'control': 'var(--radius-control)',
        'panel': 'var(--radius-panel)',
        'major': 'var(--radius-major)',
        'pill': 'var(--radius-pill)',
      },
      boxShadow: {
        'low': 'var(--shadow-low)',
        'high': 'var(--shadow-high)',
      },
      fontFamily: {
        'interface': 'var(--font-family-interface)',
      },
      zIndex: {
        'chrome': 'var(--layer-chrome)',
        'action-tray': 'var(--layer-action-tray)',
        'popover': 'var(--layer-popover)',
        'modal': 'var(--layer-modal)',
      },
      backgroundImage: {
        'pic': 'url(./src/assets/images/monopoly_bg.png)'
      }
    },
  },
  plugins: [],
  corePlugins : {
    preflight : false
  }
}

