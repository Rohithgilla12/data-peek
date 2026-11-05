import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ]
    }
  },
  {
    // Icons come from the semantic module, never straight from a library.
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'lucide-react', message: 'Use @/components/icons' },
            { name: '@phosphor-icons/react', message: 'Use @/components/icons' }
          ],
          patterns: [
            {
              group: ['@phosphor-icons/react/*', 'lucide-react/*'],
              message: 'Use @/components/icons'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/src/components/icons.ts'],
    rules: { 'no-restricted-imports': 'off' }
  },
  {
    // Playwright fixtures use `async ({}, use) => {}` — the empty destructure
    // and the `use` callback are framework idioms, not React hooks.
    files: ['tests/e2e/**/*.{ts,tsx}', 'tests/capture/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'no-empty-pattern': 'off'
    }
  },
  {
    // Ambient declaration files legitimately use triple-slash references.
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off'
    }
  },
  eslintConfigPrettier
)
