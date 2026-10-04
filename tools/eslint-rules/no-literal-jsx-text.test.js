import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';

import { isAllowedLiteral, noLiteralJsxText } from './no-literal-jsx-text.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
const literalText = [{ messageId: 'literalText' }];
const literalProp = [{ messageId: 'literalProp' }];

describe('isAllowedLiteral', () => {
  it('allows whitespace, punctuation, numbers and numbers with units', () => {
    for (const text of [
      '',
      '  \n ',
      '·',
      '(',
      ') ·',
      ':',
      '42',
      '0.5 m',
      '250 m²',
      '7%',
      '1.4 ha',
      'm²',
      ' m',
    ]) {
      expect(isAllowedLiteral(text), text).toBe(true);
    }
  });

  it('rejects words, even next to numbers', () => {
    for (const text of ['Save', '12 trees', 'Tree canopy', 'metres', 'mm m']) {
      expect(isAllowedLiteral(text), text).toBe(false);
    }
  });
});

ruleTester.run('no-literal-jsx-text', noLiteralJsxText, {
  valid: [
    'const a = <p>{t("design.title")}</p>;',
    'const a = <p> · </p>;',
    'const a = <span>{count} m²</span>;',
    'const a = <span>0.5 m</span>;',
    'const a = <img alt={t("tree.alt")} src="/tree.png" />;',
    'const a = <input placeholder={label} type="text" />;',
    'const a = <div className="panel" data-testid="vote-card" />;',
    'const a = <p title="" />;',
    'const a = <p>{`${count}`}</p>;',
    'const a = <p>{"·"}</p>;',
  ],
  invalid: [
    { code: 'const a = <p>Submit design</p>;', errors: literalText },
    { code: 'const a = <p>{"Submit design"}</p>;', errors: literalText },
    { code: 'const a = <p>{`${count} trees`}</p>;', errors: literalText },
    { code: 'const a = <p>{done ? "Done" : t("x")}</p>;', errors: literalText },
    { code: 'const a = <p>{done && "Done"}</p>;', errors: literalText },
    { code: 'const a = <img alt="A tree" src="/t.png" />;', errors: literalProp },
    { code: 'const a = <input placeholder={"Name"} />;', errors: literalProp },
    { code: 'const a = <button aria-label="Close" />;', errors: literalProp },
    { code: 'const a = <abbr title={`Metres`} />;', errors: literalProp },
    {
      code: 'const a = <p title={on ? "On" : "Off"} />;',
      errors: [...literalProp, ...literalProp],
    },
  ],
});
