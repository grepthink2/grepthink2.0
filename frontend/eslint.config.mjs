import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Every react-hooks rule is an error: exhaustive-deps and the React Compiler
// readiness rules included (options kept). `npm run lint` also fails on any warning.
const reactHooksRulesAsErrors = Object.fromEntries(
  Object.entries(reactHooks.configs.recommended.rules).map(([rule, setting]) => [
    rule,
    Array.isArray(setting) ? ['error', ...setting.slice(1)] : 'error',
  ]),
);

export default tseslint.config(
  // Ignore build artifacts and config files
  { ignores: ['dist', 'node_modules'] },
  
  // Base JavaScript recommended rules
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooksRulesAsErrors,
      // `const { dropped, ...rest } = obj` is the idiomatic way to omit a key.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
    },
  },
);