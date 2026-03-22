import { defineConfig } from '@tofrankie/eslint'

export default defineConfig({
  ignores: ['node_modules', 'dist', '**/*.md', 'tests/fixtures/**'],
  typescript: true,
  rules: {
    'e18e/prefer-array-to-sorted': 'off',
  },
})
