import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        cursive: ['var(--font-cursive)', 'cursive'],
      },
      colors: {
        nest: {
          50: '#f7f5f0',
          100: '#ebe6da',
          200: '#d9cfb8',
          300: '#c4b392',
          400: '#b39b72',
          500: '#a68a64',
          600: '#9a7d59',
          700: '#7f6649',
          800: '#685440',
          900: '#564636',
          950: '#2e251c',
        },
      },
    },
  },
  plugins: [],
};
export default config;
