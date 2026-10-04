/**
 * dependency-cruiser: no import cycles, and the same package direction rules that
 * eslint-plugin-boundaries enforces (both read tools/eslint-rules/package-boundaries.json).
 */
const { elements } = require('./tools/eslint-rules/package-boundaries.json');

const escapePath = (path) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function directionRule({ type, path, allow }) {
  const forbidden = elements.filter((other) => other.type !== type && !allow.includes(other.type));
  if (forbidden.length === 0) {
    return [];
  }
  return [
    {
      name: `package-direction-${type}`,
      comment: `${path} may import only: ${allow.join(', ') || 'no internal packages'}`,
      severity: 'error',
      from: { path: `^${escapePath(path)}/` },
      to: { path: `^(${forbidden.map((other) => escapePath(other.path)).join('|')})/` },
    },
  ];
}

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Import cycles make load order and tests fragile.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Imports must resolve; an undeclared workspace package does not.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    ...elements.flatMap(directionRule),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|\\.turbo)/|^tools/preflight/fixtures/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['@parkshape/source', 'import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
  },
};
