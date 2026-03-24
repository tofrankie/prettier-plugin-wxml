import { defineConfig } from '@tofrankie/eslint'

export default defineConfig({
  ignores: ['node_modules', 'dist', '**/*.md', 'tests/fixtures/**', 'examples/**'],
  typescript: true,
})
