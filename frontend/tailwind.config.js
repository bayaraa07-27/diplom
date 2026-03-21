/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0f4ff',
          100: '#e0e8ff',
          500: '#4f6ef7',
          600: '#3b5be8',
          700: '#2d4bd4',
          900: '#1a2d8a',
        },
        surface: '#0f1117',
        card:    '#181c2e',
        border:  '#252840',
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
