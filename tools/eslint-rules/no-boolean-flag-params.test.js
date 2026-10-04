import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, it } from 'vitest';

import { noBooleanFlagParams } from './no-boolean-flag-params.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const booleanFlag = [{ messageId: 'booleanFlag' }];

ruleTester.run('no-boolean-flag-params', noBooleanFlagParams, {
  valid: [
    'function render(options: { verbose: boolean }) {}',
    'type Toggle = (checked: boolean) => void;',
    'function isReady(): boolean { return true; }',
    'const pick = (mode: "fast" | "slow") => mode;',
  ],
  invalid: [
    { code: 'function f(verbose: boolean) {}', errors: booleanFlag },
    { code: 'const f = (verbose: boolean = false) => verbose;', errors: booleanFlag },
    { code: 'const f = function (verbose: boolean) {};', errors: booleanFlag },
    { code: 'declare function f(verbose: boolean): void;', errors: booleanFlag },
    { code: 'interface Api { set(visible: boolean): void }', errors: booleanFlag },
    { code: 'class A { constructor(private readonly on: boolean) {} }', errors: booleanFlag },
    { code: 'abstract class A { abstract set(on: boolean): void }', errors: booleanFlag },
  ],
});
