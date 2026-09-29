export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        mtg: {
          white: '#F0E6D2',
          blue: '#0E68AB',
          black: '#150B00',
          red: '#C13832',
          green: '#00A651',
          gold: '#CDB27E',
          mana: {
            white: '#FFFACD',
            blue: '#A2D5FF',
            black: '#8B7355',
            red: '#FF9999',
            green: '#90EE90',
            colorless: '#D3D3D3'
          }
        },
        cmd: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          border: 'var(--border)',
          text: 'var(--text)',
          muted: 'var(--text-muted)',
          w: 'var(--w)',
          u: 'var(--u)',
          b: 'var(--b)',
          r: 'var(--r)',
          g: 'var(--g)'
        }
      },
      fontFamily: {
        'mtg': ['Beleren', 'serif'],
        'display': ['"Bricolage Grotesque"', 'sans-serif'],
        'body': ['"Plus Jakarta Sans"', 'sans-serif']
      }
    },
  },
  plugins: [],
}
