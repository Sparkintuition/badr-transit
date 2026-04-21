/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#1E3A8A',
          'navy-light': '#3B5BDB',
          'navy-hover': '#1E40AF',
          yellow: '#F59E0B',
          'yellow-light': '#FBBF24',
          'yellow-hover': '#D97706',
        },
      },
    },
  },
  plugins: [],
};
