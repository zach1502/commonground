import path from 'node:path';

import { checkMarkdownSource, checkText } from './content-checker.js';
import { isDocFile, paragraphReadabilityFindings } from './readability.js';

const WARNING_SEVERITY = 1;

/** Turns checker findings into textlint reports; review words and hedges report as warnings. */
function createSender(context) {
  const { report, RuleError, locator } = context;
  return (node, finding) => {
    const padding = locator.range([finding.index, finding.index + finding.length]);
    const message = `${finding.message} (${finding.id})`;
    if (finding.severity === 'warning') {
      report(node, { message, padding, severity: WARNING_SEVERITY });
      return;
    }
    report(node, new RuleError(message, { padding }));
  };
}

/** Grade-level findings for the developer docs; other Markdown is not measured. */
function readabilityFindings(file, source) {
  if (file === undefined || !isDocFile(path.relative(process.cwd(), file))) {
    return [];
  }
  return paragraphReadabilityFindings(source);
}

/**
 * textlint rule: banned words, review words, and prose patterns from content-rules.json,
 * plus the Flesch-Kincaid grade of each paragraph in the developer docs.
 */
// eslint-disable-next-line import-x/no-default-export -- textlint loads a rule from its default export (#1)
export default function contentRules(context) {
  const { Syntax, getSource, getFilePath } = context;
  const send = createSender(context);
  return {
    [Syntax.Document](node) {
      const source = getSource(node);
      for (const finding of checkMarkdownSource(source)) {
        send(node, finding);
      }
      for (const finding of readabilityFindings(getFilePath(), source)) {
        send(node, finding);
      }
    },
    [Syntax.Str](node) {
      for (const finding of checkText(getSource(node), { scope: 'markdown' })) {
        send(node, finding);
      }
    },
  };
}
