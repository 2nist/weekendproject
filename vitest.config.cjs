const path = require('path');

module.exports = {
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};
