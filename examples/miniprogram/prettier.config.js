import baseOptions from '@tofrankie/prettier'

export default {
  ...baseOptions,
  plugins: ['@tofrankie/prettier-plugin-wxml'],
  overrides: [
    {
      files: '*.wxml',
      options: {
        parser: 'wxml',
      },
    },
    {
      files: '*.wxs',
      options: {
        parser: 'babel',
      },
    }
  ],
}
