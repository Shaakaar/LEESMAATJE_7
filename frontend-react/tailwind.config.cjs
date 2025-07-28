/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3BA3F8',
        success: '#A3E635',
        error: '#FB7185',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'sans-serif'],
        display: ['var(--font-display)', 'sans-serif'],
        title: ['var(--font-display)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

