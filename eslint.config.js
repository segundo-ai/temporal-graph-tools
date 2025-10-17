import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'

const typescriptFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']

export const base = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
      'coverage/**',
      'examples/**',
      '*.config.js',
      '*.config.mjs',
      '*.config.cjs',
      '*.config.ts',
      'examples/workflow/**',
      'examples/activities/**',
    ],
  },
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: process.cwd(),
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1, maxBOF: 0 }],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'directive', next: '*' },
        { blankLine: 'never', prev: 'import', next: 'import' },
        { blankLine: 'never', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        {
          blankLine: 'always',
          prev: ['const', 'let', 'var'],
          next: ['expression', 'if', 'switch', 'while', 'for', 'return', 'throw', 'try'],
        },
        { blankLine: 'never', prev: ['case', 'default'], next: ['case', 'default'] },
        { blankLine: 'any', prev: ['case', 'default'], next: ['return', 'throw'] },
        { blankLine: 'always', prev: ['case', 'default'], next: ['block', 'block-like'] },
        { blankLine: 'always', prev: '*', next: ['return', 'throw', 'continue', 'break'] },
        { blankLine: 'always', prev: '*', next: ['function', 'class'] },
        { blankLine: 'always', prev: 'block-like', next: '*' },
      ],
      'eol-last': ['error', 'always'],
      'import/newline-after-import': ['error', { count: 1 }],
      'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
      'newline-before-return': 'error',
      curly: ['error', 'multi-line'],
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      indent: [
        'error',
        2,
        {
          SwitchCase: 1,
          ignoredNodes: [
            'ConditionalExpression',
            'ConditionalExpression *',
            'TSTypeParameterInstantiation',
            'TSTypeParameterInstantiation *',
            'TSTypeAnnotation',
            'TSTypeAnnotation *',
            'TSTypeLiteral',
            'TSTypeLiteral *',
            'TSUnionType',
            'TSUnionType *',
            'TSIntersectionType',
            'TSIntersectionType *',
            'TSConditionalType',
            'TSConditionalType *',
            'TSMappedType',
            'TSMappedType *',
          ],
        },
      ],
      'array-element-newline': ['error', 'consistent'],
      'array-bracket-newline': ['error', 'consistent'],
      'object-curly-newline': ['error', { multiline: true, consistent: true }],
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.js', '**/*.mjs'],
  },
]

export default base
