import { DOC_FILES } from './docs.js';
import { fileExists, readText } from './files.js';

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const H2 = /^## (.+)$/;
const ALWAYS = { file: 'AGENTS.md', heading: 'Code limits' };
// Segments too common to say anything about which rules apply.
const GENERIC_SEGMENTS = new Set([
  'src',
  'apps',
  'packages',
  'tools',
  'test',
  'tests',
  'lib',
  '.',
  '..',
]);
const WILDCARD = /[*?{}[\]]/;

export interface DocSection {
  readonly file: string;
  readonly heading: string;
  readonly text: string;
}

/** Splits a Markdown doc at H2 headings, ignoring headings inside fenced code. */
export function h2Sections(file: string, source: string): DocSection[] {
  const sections: { heading: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of source.split('\n')) {
    inFence = FENCE.test(line) ? !inFence : inFence;
    const heading = inFence ? null : H2.exec(line);
    if (heading !== null) {
      sections.push({ heading: heading[1] ?? '', lines: [line] });
    } else {
      sections.at(-1)?.lines.push(line);
    }
  }
  return sections.map(({ heading, lines }) => ({ file, heading, text: lines.join('\n').trim() }));
}

/** Literal path segments and package names a glob names, lower-cased. */
export function contextTerms(glob: string): string[] {
  const segments = glob
    .split('/')
    .filter((segment) => segment !== '' && !WILDCARD.test(segment))
    .map((segment) => segment.toLowerCase())
    .filter((segment) => !GENERIC_SEGMENTS.has(segment));
  const [top, name] = glob.split('/');
  const isPackage =
    (top === 'packages' || top === 'apps') && name !== undefined && !WILDCARD.test(name);
  const packageTerms = isPackage ? [`${top}/${name}`, `@parkshape/${name}`] : [];
  return [...new Set([...packageTerms, ...segments])];
}

function mentions(section: DocSection, terms: readonly string[]): boolean {
  const haystack = section.text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

/** Doc sections that apply to the glob, plus the code limits section every time. */
export function contextSections(rootDir: string, glob: string): DocSection[] {
  const terms = contextTerms(glob);
  return DOC_FILES.filter((file) => fileExists(rootDir, file)).flatMap((file) =>
    h2Sections(file, readText(rootDir, file)).filter(
      (section) =>
        (section.file === ALWAYS.file && section.heading === ALWAYS.heading) ||
        mentions(section, terms),
    ),
  );
}

/** The --context report as printable lines. */
export function formatContext(glob: string, sections: readonly DocSection[]): string[] {
  const header = [`Context for ${glob}: ${String(sections.length)} doc sections apply.`, ''];
  return [
    ...header,
    ...sections.flatMap((section) => [`>> ${section.file} / ${section.heading}`, section.text, '']),
  ];
}
