import { readFileSync } from 'node:fs';

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import boundaries from 'eslint-plugin-boundaries';
import { importX } from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { parkshapePlugin } from './tools/eslint-rules/plugin.js';

const packageBoundaries = JSON.parse(
  readFileSync(new URL('./tools/eslint-rules/package-boundaries.json', import.meta.url), 'utf8'),
);

// Workspace imports resolve to src through this export condition (see vitest.shared.config.ts).
const SOURCE_CONDITION = '@parkshape/source';
const JS_FILES = ['**/*.{js,cjs,mjs}'];
const TEST_FILES = [
  '**/*.test.{ts,tsx,js}',
  '**/test-setup.ts',
  '**/__contracts__/**/*.ts',
  'apps/api/test/**/*.ts',
];
const CONFIG_FILES = ['**/*.config.{ts,js,cjs,mjs}', '**/vitest.workspace.ts'];
// Tests and package configs live in each package's tsconfig.test.json, not its tsconfig.json.
const TEST_PROGRAM_FILES = [
  '{apps,packages,tools}/*/src/**/*.test.{ts,tsx}',
  // Port contract tests are test code that adapter tests import; see AGENTS.md.
  '{apps,packages}/*/src/**/__contracts__/**/*.ts',
  '{apps,packages,tools}/*/src/test-setup.ts',
  '{apps,packages,tools}/*/*.config.ts',
  // API integration tests (AGENTS.md#tests) and codegen scripts sit outside src.
  '{apps,packages}/*/test/**/*.ts',
  '{apps,packages}/*/scripts/**/*.ts',
];

// AGENTS.md names these test directories; filename-case would otherwise ask to rename them.
const TEST_DIRECTORY_NAMES = [/^__(contracts|live)__$/];
const VENDOR_SDK_PATTERN =
  '^(three|maplibre-gl|drizzle-orm|@electric-sql/pglite|geotiff|proj4|openai|postprocessing|n8ao|fflate)(/.*)?$|^@(react-three|supabase|gltf-transform)/';
const VENDOR_SDK_EXEMPT = [
  'packages/*/src/adapters/**',
  'packages/scene/src/**',
  'packages/ui/src/**',
  'apps/api/src/entry.*.ts',
  'tools/**',
];

const ENV_MESSAGE = 'Read env only in @parkshape/config';
const ENV_SYNTAX = [
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: ENV_MESSAGE,
  },
  {
    selector: "MemberExpression[object.name='process'][property.value='env']",
    message: ENV_MESSAGE,
  },
  {
    selector: "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
    message: ENV_MESSAGE,
  },
  {
    selector:
      "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][property.name='env']",
    message: ENV_MESSAGE,
  },
];
// CONTENT.md#ui-strings: UI copy lives in the locale files. The fixture path keeps the rule tested.
const UI_SOURCE_FILES = [
  'apps/web/src/**/*.tsx',
  'packages/ui/src/**/*.tsx',
  'packages/scene/src/**/*.tsx',
  'tools/preflight/fixtures/ts/**/*.tsx',
];
const UI_SOURCE_EXEMPT = ['**/styleguide/**', '**/*.test.tsx', '**/*.stories.tsx'];
const MOTION_MESSAGE =
  'Animate through the motion wrappers in packages/ui/src/motion instead of framer-motion props';
const MOTION_SYNTAX = ['animate', 'transition'].map((name) => ({
  selector: `JSXAttribute[name.name='${name}']`,
  message: MOTION_MESSAGE,
}));

function namingConvention({ components }) {
  const componentCase = components ? ['PascalCase'] : [];
  return [
    'error',
    { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
    { selector: 'import', format: ['camelCase', 'PascalCase'] },
    { selector: 'function', format: ['camelCase', ...componentCase] },
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'enumMember', format: ['PascalCase'] },
    {
      selector: 'variable',
      modifiers: ['const', 'global'],
      types: ['boolean', 'number', 'string'],
      format: ['UPPER_CASE'],
    },
    {
      selector: 'variable',
      modifiers: ['const', 'global'],
      format: ['camelCase', 'UPPER_CASE', ...componentCase],
    },
    { selector: 'variable', format: ['camelCase', ...componentCase] },
    { selector: 'variable', modifiers: ['destructured'], format: null },
    { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
  ];
}

const boundaryElements = packageBoundaries.elements.map(({ type, path }) => ({
  type,
  pattern: `${path}/**`,
  partialMatch: false,
}));
const boundaryPolicies = packageBoundaries.elements.map(({ type, allow }) => ({
  from: { element: { type } },
  allow: { to: { element: { types: { anyOf: [type, ...allow] } } } },
}));

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.turbo/**',
    '.yolo-sisyphus/**',
    // Written by pnpm e2e; gitignored, and the Playwright trace viewer ships minified bundles.
    'playwright-report/**',
    'test-results/**',
    'tools/preflight/fixtures/**',
    // Written by openapi-typescript and the MSW generator; regenerate instead of editing.
    '**/src/generated/**',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.ts'], defaultProject: 'tsconfig.base.json' },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { boundaries, 'import-x': importX, parkshape: parkshapePlugin, unicorn },
    settings: {
      'import-x/internal-regex': '^@parkshape/',
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          conditionNames: [SOURCE_CONDITION, 'types', 'import', 'default'],
        }),
      ],
      'import/resolver': {
        typescript: { conditionNames: [SOURCE_CONDITION, 'types', 'import', 'default'] },
      },
      'boundaries/elements': boundaryElements,
    },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60 }],
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': 'off',
      '@typescript-eslint/max-params': ['error', { max: 4 }],
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        { ignore: [0, 1, -1], ignoreArrayIndexes: true, enforceConst: true, detectObjects: false },
      ],
      'no-nested-ternary': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'import-x/no-default-export': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object'],
          pathGroups: [{ pattern: '@parkshape/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'unicorn/filename-case': ['error', { case: 'kebabCase', ignore: TEST_DIRECTORY_NAMES }],
      'no-restricted-syntax': ['error', ...ENV_SYNTAX, ...MOTION_SYNTAX],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: VENDOR_SDK_PATTERN,
              message:
                'Import vendor SDKs only in packages/*/src/adapters, the scene and ui wrapper packages or the API entries',
            },
          ],
        },
      ],
      'parkshape/no-boolean-flag-params': 'error',
      'boundaries/dependencies': ['error', { default: 'disallow', policies: boundaryPolicies }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/naming-convention': namingConvention({ components: false }) },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      '@typescript-eslint/naming-convention': namingConvention({ components: true }),
      'unicorn/filename-case': [
        'error',
        { cases: { kebabCase: true, pascalCase: true }, ignore: TEST_DIRECTORY_NAMES },
      ],
    },
  },
  {
    files: UI_SOURCE_FILES,
    ignores: UI_SOURCE_EXEMPT,
    rules: { 'parkshape/no-literal-jsx-text': 'error' },
  },
  {
    files: TEST_PROGRAM_FILES,
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./{apps,packages,tools}/*/tsconfig.test.json'],
      },
    },
  },
  {
    // The root Playwright config runs the golden paths in e2e/ and shares their program.
    files: ['playwright.config.ts'],
    languageOptions: {
      parserOptions: { projectService: false, project: ['./e2e/tsconfig.json'] },
    },
  },
  {
    files: JS_FILES,
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // CommonJS config files (dependency-cruiser) can only load modules through require().
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [...TEST_FILES, ...CONFIG_FILES],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
  {
    files: [...CONFIG_FILES, 'eslint.config.js'],
    rules: { 'import-x/no-default-export': 'off' },
  },
  {
    files: VENDOR_SDK_EXEMPT,
    ignores: ['tools/preflight/fixtures/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // AGENTS.md: process.env and import.meta.env are read only in packages/config and tools.
    files: ['packages/config/**', 'tools/**'],
    ignores: ['tools/preflight/fixtures/**'],
    rules: { 'no-restricted-syntax': ['error', ...MOTION_SYNTAX] },
  },
  {
    files: ['packages/ui/src/motion/**'],
    rules: { 'no-restricted-syntax': ['error', ...ENV_SYNTAX] },
  },
]);
