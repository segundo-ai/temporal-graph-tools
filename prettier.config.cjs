/** @type {import('prettier').Config} */
module.exports = {
  // Basic formatting
  trailingComma: 'all',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  semi: false,
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',

  // 2025 best practices
  bracketSameLine: false,
  quoteProps: 'as-needed',
  jsxSingleQuote: true,
  proseWrap: 'preserve',

  // Plugin configuration
  plugins: [
    '@ianvs/prettier-plugin-sort-imports',
    'prettier-plugin-tailwindcss',
  ],

  // File-specific overrides
  overrides: [
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
        printWidth: 80,
      },
    },
    {
      files: '*.json',
      options: {
        printWidth: 120,
      },
    },
    {
      files: ['*.yaml', '*.yml'],
      options: {
        bracketSpacing: false,
      },
    },
  ],
  importOrder: [
    'react',
    '<BUILTIN_MODULES>',
    '^next(/.+)?$',
    '<THIRD_PARTY_MODULES>',
    '^@segundo/api(/.+)?$',
    '^@segundo(/.+)?$',
    '^@/.*$',
    '^[./]',
  ],
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
}
