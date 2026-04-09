import { defineConfig } from '@tofrankie/eslint'

export default defineConfig({
  ignores: ['**/*.md', 'tests/fixtures/**', 'examples/**'],
  typescript: true,
})
