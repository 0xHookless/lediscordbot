/** Colors and fonts point at the CSS tokens in src/styles.css so both themes stay in one place. */
export default {
  content: { relative: true, files: ['./index.html', './src/**/*.{js,jsx}'] },
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', raised: 'var(--raised)', line: 'var(--border)',
        fg: 'var(--fg)', muted: 'var(--fg-muted)', subtle: 'var(--fg-subtle)',
        accent: 'var(--accent)', danger: 'var(--danger)', warn: 'var(--warn)', ok: 'var(--ok)'
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '"Segoe UI"', 'sans-serif'],
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"Cascadia Mono"', 'monospace']
      }
    }
  }
};
