import forms from '@tailwindcss/forms';

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {
      preset: {
        plugins: [forms],
      },
    },
  },
}

export default config
