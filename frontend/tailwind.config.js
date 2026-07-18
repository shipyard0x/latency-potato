/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FBF2E2',
        'cream-dark': '#F3E4C8',
        spud: '#C68B4E',
        'spud-dark': '#8C5A2B',
        'spud-deep': '#4A2E14',
        butter: '#FFC93C',
        'butter-dark': '#E8A800',
        grass: '#5FB84F',
        'grass-dark': '#3E8E41',
        tomato: '#E8503A',
        ink: '#221507',
        soil: '#2A1A0B',
        'soil-light': '#3A2412',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        sans: ['"Space Grotesk"', 'sans-serif'],
      },
      boxShadow: {
        chunk: '3px 3px 0 0 #221507',
        'chunk-md': '5px 5px 0 0 #221507',
        'chunk-lg': '6px 6px 0 0 #221507',
        'chunk-xl': '8px 8px 0 0 #221507',
      },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: { marquee: 'marquee 22s linear infinite' },
    },
  },
  plugins: [],
};
