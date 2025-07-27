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
      fontFamily: { title: ['"Fredoka"', 'cursive'] },
    },
  },
  plugins: [],
};

