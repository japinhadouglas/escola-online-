/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#16a34a', // Cor principal Verde Educacional Moderno
          600: '#15803d',
          700: '#166534',
          800: '#14532d',
          900: '#052e16',
        },
        edu: {
          navy: '#0f172a',
          slate: '#1e293b',
          card: '#1e293b',
          surface: '#0f172a',
          accent: '#3b82f6',
          yellow: '#eab308',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
