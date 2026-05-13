import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        agentive: {
          bg: '#050505',
          'bg-secondary': '#0a0a0f',
          'bg-elevated': '#12121a',
          cyan: '#00f0ff',
          magenta: '#ff00ff',
          violet: '#8b5cf6',
          'text-secondary': '#a0a0b0',
          'text-muted': '#606070',
          success: '#00ff88',
          warning: '#ffaa00',
          error: '#ff3333',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
