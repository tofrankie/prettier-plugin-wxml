import { defineConfig } from '@tofrankie/eslint'

export default defineConfig({
  ignores: ['node_modules', 'dist', '**/*.md', 'tests/fixtures/**', 'examples/**'],
  typescript: true,
  stylistic: {
    overrides: {
      'style/operator-linebreak': ['error', 'after', { overrides: { '?': 'before', ':': 'before', '|': 'before' } }],
    },
  },
})
