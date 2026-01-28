import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  // 1. Ignore build artifacts and config files
  { ignores: ['dist/', 'node_modules/', 'vite.config.ts', '*.config.js', '*.config.mjs'] },

  // 2. Apply Airbnb base config to JavaScript/TypeScript files
  ...compat.extends('airbnb').map(config => ({
    ...config,
    files: ['src/**/*.{js,jsx,ts,tsx}'],
  })),

  // 3. Apply Airbnb TypeScript config
  ...compat.extends('airbnb-typescript').map(config => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),

  // 4. Configure TypeScript Parser for source files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // Points to your Vite TypeScript configs
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off', // Not needed for modern React
      'import/prefer-default-export': 'off',
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          js: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never',
        },
      ],
    },
  },
];