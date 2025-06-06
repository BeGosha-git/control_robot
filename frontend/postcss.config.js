module.exports = {
  plugins: {
    'postcss-normalize': {
      forceImport: true,
      allowDuplicates: false,
      browsers: 'last 2 versions'
    },
    'tailwindcss': {},
    'autoprefixer': {}
  },
  exclude: [
    /node_modules\/monaco-editor/
  ]
} 