import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unknown-property': [
        'error',
        {
          ignore: [
            // React Three Fiber props
            'position',
            'rotation',
            'scale',
            'args',
            'intensity',
            'color',
            'attach',
            'geometry',
            'material',
            'castShadow',
            'receiveShadow',
            'wireframe',
            'transparent',
            'opacity',
            'side',
            'metalness',
            'roughness',
            'emissive',
            'emissiveIntensity',
            'linewidth',
            'quaternion',
            'visible',
            'map',
          ],
        },
      ],
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'electron/**',
      '*.config.js',
      '*.config.mjs',
      'setup-pdfjs.js',
      'public/**',
    ],
  },
];
