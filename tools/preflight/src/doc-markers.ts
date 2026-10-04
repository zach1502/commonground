import { lineOf } from './files.js';

const MARKER = /<!-- preflight:(?:begin section=([\w-]+)|end) -->/g;

export interface MarkerProblem {
  readonly line?: number;
  readonly message: string;
}

interface OpenMarker {
  readonly section: string;
  readonly line: number;
}

function unclosed(open: OpenMarker): MarkerProblem {
  return {
    line: open.line,
    message: `begin marker for section ${open.section} has no end marker`,
  };
}

/** Begin markers with no end before the next begin, and end markers with no begin. */
function pairingProblems(source: string): MarkerProblem[] {
  const problems: MarkerProblem[] = [];
  let open: OpenMarker | undefined;
  for (const match of source.matchAll(MARKER)) {
    const line = lineOf(source, match.index);
    const section = match[1];
    if (section === undefined && open === undefined) {
      problems.push({ line, message: 'end marker has no begin marker' });
    } else if (section !== undefined && open !== undefined) {
      problems.push(unclosed(open));
    }
    open = section === undefined ? undefined : { section, line };
  }
  return open === undefined ? problems : [...problems, unclosed(open)];
}

/**
 * Problems with a doc's generated blocks: a section the doc must carry but does not, and
 * markers that do not pair up. `sections` maps each section to the doc that carries it.
 */
export function markerProblemsFor(
  file: string,
  source: string,
  sections: Readonly<Record<string, string>>,
): MarkerProblem[] {
  const present = new Set([...source.matchAll(MARKER)].map((match) => match[1]));
  const missing = Object.entries(sections)
    .filter(([section, docFile]) => docFile === file && !present.has(section))
    .map(([section]) => ({ message: `no generated block for section ${section}` }));
  return [...missing, ...pairingProblems(source)];
}
