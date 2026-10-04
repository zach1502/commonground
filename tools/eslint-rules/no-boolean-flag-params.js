/**
 * Reports function parameters annotated as `boolean`. A call such as `render(true)`
 * hides intent at the call site; an options object or a discriminated union names it.
 * Callback type literals (`(checked: boolean) => void`) are not checked: they describe
 * values passed to the caller, not flags the caller passes in.
 */
const MESSAGE = 'Use an options object or a discriminated union instead of a boolean flag';

const FUNCTION_NODES = [
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
  'TSMethodSignature',
];

/** Unwraps default values (`flag: boolean = false`) and constructor parameter properties. */
function annotatedTarget(param) {
  if (param.type === 'TSParameterProperty') {
    return annotatedTarget(param.parameter);
  }
  if (param.type === 'AssignmentPattern') {
    return param.left;
  }
  return param;
}

function isBooleanAnnotated(param) {
  const target = annotatedTarget(param);
  return target.typeAnnotation?.typeAnnotation.type === 'TSBooleanKeyword';
}

export const noBooleanFlagParams = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow boolean flag parameters' },
    schema: [],
    messages: { booleanFlag: MESSAGE },
  },
  create(context) {
    const check = (node) => {
      for (const param of node.params) {
        if (isBooleanAnnotated(param)) {
          context.report({ node: param, messageId: 'booleanFlag' });
        }
      }
    };
    return Object.fromEntries(FUNCTION_NODES.map((type) => [type, check]));
  },
};
