import { noBooleanFlagParams } from './no-boolean-flag-params.js';
import { noLiteralJsxText } from './no-literal-jsx-text.js';

/** Local ESLint plugin; registered as `parkshape` in eslint.config.js. */
export const parkshapePlugin = {
  meta: { name: '@parkshape/eslint-rules' },
  rules: {
    'no-boolean-flag-params': noBooleanFlagParams,
    'no-literal-jsx-text': noLiteralJsxText,
  },
};
