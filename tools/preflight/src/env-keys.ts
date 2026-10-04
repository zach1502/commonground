export const ENV_SCHEMA_FILE = 'packages/config/src/env.ts';
export const ENV_EXAMPLE_FILE = '.env.example';

const SCHEMA_BLOCK = /envSchema\s*=\s*z\.object\(\{([\s\S]*?)\n\}\)/;
const SCHEMA_KEY = /^ {2}([A-Z][A-Z0-9_]*)\s*:/gm;
const EXAMPLE_KEY = /^([A-Z][A-Z0-9_]*)=/;

/** Keys declared in the zod object passed to `envSchema`. */
export function schemaKeys(source: string): string[] {
  const block = SCHEMA_BLOCK.exec(source)?.[1] ?? '';
  return [...block.matchAll(SCHEMA_KEY)].map((match) => match[1] ?? '');
}

export interface ExampleKey {
  readonly key: string;
  readonly line: number;
  readonly commented: boolean;
}

/** Keys assigned in .env.example, with whether a comment line sits directly above each. */
export function exampleKeys(source: string): ExampleKey[] {
  const lines = source.split('\n');
  return lines.flatMap((text, index) => {
    const key = EXAMPLE_KEY.exec(text)?.[1];
    if (key === undefined) {
      return [];
    }
    const previous = index > 0 ? (lines[index - 1] ?? '') : '';
    return [{ key, line: index + 1, commented: previous.trimStart().startsWith('#') }];
  });
}

export interface EnvDrift {
  readonly missingFromExample: string[];
  readonly missingFromSchema: string[];
  readonly uncommented: ExampleKey[];
}

/** Compares the schema keys with the .env.example keys in both directions. */
export function compareEnv(schemaSource: string, exampleSource: string): EnvDrift {
  const schema = schemaKeys(schemaSource);
  const example = exampleKeys(exampleSource);
  const exampleNames = new Set(example.map(({ key }) => key));
  const schemaNames = new Set(schema);
  return {
    missingFromExample: schema.filter((key) => !exampleNames.has(key)),
    missingFromSchema: example.map(({ key }) => key).filter((key) => !schemaNames.has(key)),
    uncommented: example.filter(({ commented }) => !commented),
  };
}
