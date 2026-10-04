/**
 * Reports literal text in JSX: text children, string and template literals rendered as
 * children, and literal values of user-facing attributes. CONTENT.md keeps every UI string
 * in the locale files, so components read copy by message ID or take it as a prop.
 * Whitespace, punctuation, numbers and unit symbols (0.5 m, 250 m², 1.4 ha) are allowed.
 */
const DEFAULT_ATTRIBUTES = ['alt', 'title', 'placeholder', 'aria-label'];
// Unit symbols that may follow a number without a message ID. Words such as "trees" may not.
const UNITS = ['m', 'm²', 'm³', 'km', 'cm', 'mm', 'ha', 'kg', 'px', 's', 'ms', 'h', 'x'];
const LETTER = /\p{L}/u;
const UNIT_WITH_NUMBERS = new RegExp(`^[^\\p{L}]*(?:${UNITS.join('|')})[^\\p{L}]*$`, 'u');

/** True for text that needs no translation: no letters, or only a unit symbol with numbers. */
export function isAllowedLiteral(text) {
  const trimmed = text.trim();
  return !LETTER.test(trimmed) || UNIT_WITH_NUMBERS.test(trimmed);
}

/** The literal strings an expression can render: branches of `a ? b : c` and `a && b` count. */
function literalParts(node) {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [{ node, text: node.value }] : [];
    case 'TemplateLiteral':
      return [{ node, text: node.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ') }];
    case 'ConditionalExpression':
      return [...literalParts(node.consequent), ...literalParts(node.alternate)];
    case 'LogicalExpression':
      return literalParts(node.right);
    default:
      return [];
  }
}

function attributeName(node) {
  return node.name.type === 'JSXNamespacedName'
    ? `${node.name.namespace.name}:${node.name.name.name}`
    : node.name.name;
}

function attributeParts(value) {
  if (value?.type === 'Literal') {
    return literalParts(value);
  }
  return value?.type === 'JSXExpressionContainer' ? literalParts(value.expression) : [];
}

export const noLiteralJsxText = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow literal UI text in JSX; read it from the locale files' },
    schema: [
      {
        type: 'object',
        properties: { attributes: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      literalText: 'Move "{{text}}" to the locale files and render it by message ID.',
      literalProp: 'Move the {{name}} text "{{text}}" to the locale files.',
    },
  },
  create(context) {
    const attributes = new Set(context.options[0]?.attributes ?? DEFAULT_ATTRIBUTES);
    const reportParts = (parts, messageId, data = {}) => {
      for (const part of parts.filter(({ text }) => !isAllowedLiteral(text))) {
        context.report({ node: part.node, messageId, data: { ...data, text: part.text.trim() } });
      }
    };
    return {
      JSXText(node) {
        reportParts([{ node, text: node.value }], 'literalText');
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === 'JSXElement' || node.parent.type === 'JSXFragment') {
          reportParts(literalParts(node.expression), 'literalText');
        }
      },
      JSXAttribute(node) {
        const name = attributeName(node);
        if (attributes.has(name)) {
          reportParts(attributeParts(node.value), 'literalProp', { name });
        }
      },
    };
  },
};
