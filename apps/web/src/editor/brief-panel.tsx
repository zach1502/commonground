import { formatCad } from '@parkshape/core';

import { format, messages } from '../messages';

import { briefSentencesAbout, type BriefSelection } from './brief-selection';

export interface BriefPanelProps {
  readonly brief: string;
  /** The one selected item, or null; the panel names it and the brief lines about it. */
  readonly selected?: BriefSelection | null;
}

/** What the brief says about the selection: its name, kind and cost, then the lines about it. */
function SelectionNote({ brief, selected }: { brief: string; selected: BriefSelection }) {
  const about = briefSentencesAbout(brief, selected);
  return (
    <div className="web-brief-selection">
      <p className="web-brief__text">
        {format(messages.editor.briefSelected, {
          name: selected.name,
          kind: selected.kind,
          cost: formatCad(selected.costCad),
        })}
      </p>
      {about.map((sentence) => (
        <p key={sentence} className="web-brief__text" data-kind="data">
          {sentence}
        </p>
      ))}
    </div>
  );
}

/**
 * The staff brief in the editor side panel, closed at first so the meters stay in view. While
 * one item is selected, a line under it names the item and repeats what the brief says about it.
 */
export function BriefPanel({ brief, selected = null }: BriefPanelProps) {
  const text = brief.trim();
  if (text === '' && selected === null) return null;
  return (
    <div className="web-brief">
      {text === '' ? null : (
        <details>
          <summary className="web-brief__summary">{messages.editor.brief}</summary>
          <p className="web-brief__text" data-kind="data">
            {text}
          </p>
        </details>
      )}
      {selected === null ? null : <SelectionNote brief={text} selected={selected} />}
    </div>
  );
}
