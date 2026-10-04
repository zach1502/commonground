/**
 * Styles read design tokens (CSS custom properties from @bcgov/design-tokens and our own
 * tokens) instead of raw values, and avoid decorative effects.
 *
 * Planned caps for radius and shadow (not enforced yet): once the token layer exists,
 * border-radius will accept only var(--layout-border-radius-small) and
 * var(--layout-border-radius-medium), the @bcgov/design-tokens names that DESIGN.md uses,
 * and box-shadow only var(--elevation-low) (token elevation.low). The rule below already
 * forces both properties through var(); the cap becomes a
 * declaration-property-value-allowed-list entry when the tokens are defined.
 */
// Regex entries cover every colour property (outline-color, border-top-color and the rest)
// and every border property, including the shorthands.
const TOKEN_PROPERTIES = [
  '/color$/',
  'background',
  '/^border/',
  'outline',
  'fill',
  'stroke',
  'font-family',
  'font-size',
  'box-shadow',
];
const ALLOWED_KEYWORDS = ['transparent', 'inherit', 'currentColor', 'none', '0'];
// Line styles carry no colour or size, so border and outline values may name them.
const LINE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'hidden', 'collapse', 'separate'];
const ALLOWED_VALUES = {
  '': ALLOWED_KEYWORDS,
  '/^border/': [...ALLOWED_KEYWORDS, ...LINE_STYLES],
  outline: [...ALLOWED_KEYWORDS, ...LINE_STYLES],
};
const NO_DECORATION = {
  background: ['/gradient/'],
  'background-image': ['/gradient/'],
  'backdrop-filter': ['/.*/'],
  'background-clip': ['text'],
};

function strictValue(ignoreFunctions) {
  return [
    TOKEN_PROPERTIES,
    {
      ignoreFunctions,
      ignoreValues: ALLOWED_VALUES,
      message: 'Use a design token via var() for "${property}" instead of "${value}"',
    },
  ];
}

export default {
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.turbo/**',
    'playwright-report/**',
    'test-results/**',
    'tools/preflight/fixtures/**',
  ],
  rules: {
    'scale-unlimited/declaration-strict-value': strictValue(false),
    'declaration-property-value-disallowed-list': [
      NO_DECORATION,
      { message: 'Decorative effects (gradients, backdrop-filter, text clipping) are not allowed' },
    ],
  },
  overrides: [
    {
      // An @font-face rule names the family that the font token points at. Descriptors do not
      // accept var(), so the self-hosted font file may spell the family name.
      files: ['apps/web/src/fonts.css'],
      rules: {
        'scale-unlimited/declaration-strict-value': [
          TOKEN_PROPERTIES.filter((property) => property !== 'font-family'),
          strictValue(false)[1],
        ],
      },
    },
    {
      // Terrain shading and the heatmap legend need real gradients.
      files: ['packages/scene/**/*.css', '**/*heatmap-legend*'],
      rules: {
        'scale-unlimited/declaration-strict-value': strictValue(
          Object.fromEntries(
            TOKEN_PROPERTIES.map((property) => [property, property === 'background']),
          ),
        ),
        'declaration-property-value-disallowed-list': [
          { 'backdrop-filter': ['/.*/'], 'background-clip': ['text'] },
          {
            message: 'Decorative effects (backdrop-filter, text clipping) are not allowed',
          },
        ],
      },
    },
  ],
};
