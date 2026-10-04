import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { catalogIndex, designDocumentSchema, formatCad, type Category } from '@parkshape/core';
import { Button, ButtonLink, Stack } from '@parkshape/ui';

import type { Design, Project, User } from '../api/web-api';
import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';

import { contentsSentence, costSentence, type CategoryCount } from './design-facts';
import { shareLink } from './share';

interface InspectItem {
  readonly id: string;
  readonly catalogId: string;
  readonly name: string;
  readonly category: Category;
  readonly cost: string | null;
}

/** Items of one catalog entry, shown as one row with a count. */
interface ItemGroup {
  readonly catalogId: string;
  readonly name: string;
  readonly cost: string | null;
  readonly count: number;
}

type LegendRow = CategoryCount;

function inspectItems(design: Design): InspectItem[] {
  const document = designDocumentSchema.parse(design.document);
  return document.items.map((item) => {
    const entry = catalogIndex.get(item.catalogId);
    const perItem = entry?.unitCost.perItemCad;
    return {
      id: item.id,
      catalogId: item.catalogId,
      name: entry?.name ?? item.catalogId,
      category: entry?.category ?? 'ground',
      cost: perItem === undefined ? null : formatCad(perItem),
    };
  });
}

function itemGroups(items: readonly InspectItem[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();
  items.forEach(({ catalogId, name, cost }) => {
    const count = (groups.get(catalogId)?.count ?? 0) + 1;
    groups.set(catalogId, { catalogId, name, cost, count });
  });
  return [...groups.values()];
}

function costText(group: ItemGroup): string {
  if (group.cost === null) return messages.designPage.noPrice;
  if (group.count === 1) return group.cost;
  return format(messages.designPage.costEach, { cost: group.cost });
}

function legendRows(items: readonly InspectItem[], design: Design): LegendRow[] {
  const counts = new Map<Category, number>();
  const bump = (category: Category) => counts.set(category, (counts.get(category) ?? 0) + 1);
  items.forEach((item) => bump(item.category));
  designDocumentSchema
    .parse(design.document)
    .areas.forEach((area) => bump(catalogIndex.get(area.catalogId)?.category ?? 'garden'));
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

function Legend({
  rows,
  design,
}: {
  readonly rows: readonly LegendRow[];
  readonly design: Design;
}) {
  const contents = contentsSentence(rows);
  const cost = costSentence(design.metrics?.totals ?? null);
  return (
    <div className="web-design__legend">
      <h2>{messages.designPage.legendHeading}</h2>
      {contents === null ? null : (
        <p className="web-design__contents" data-kind="data">
          {contents}
        </p>
      )}
      {cost === null ? null : (
        <p className="web-design__contents" data-kind="data">
          {cost}
        </p>
      )}
    </div>
  );
}

function InspectPanel({ group }: { readonly group: ItemGroup | null }) {
  const text = messages.designPage;
  if (group === null) return null;
  return (
    <dl className="web-design__inspect">
      <dt>{text.detailName}</dt>
      <dd data-kind="data">{group.name}</dd>
      <dt>{text.detailCost}</dt>
      <dd data-kind="data">{costText(group)}</dd>
    </dl>
  );
}

function ShareButton({ project }: { readonly project: Project }) {
  const [copied, setCopied] = useState(false);
  const onShare = async () => {
    const title = messages.designPage.share;
    const text = format(messages.designPage.shareText, { name: project.name });
    const result = await shareLink(window.location.href, title, text);
    setCopied(result === 'copied');
  };
  return (
    <div className="web-design__share">
      <Button variant="secondary" onPress={() => void onShare()}>
        {messages.designPage.share}
      </Button>
      {copied ? (
        <p role="status" className="web-design__share-copied">
          {messages.designPage.shareCopied}
        </p>
      ) : null}
    </div>
  );
}

function AuthorActions({
  design,
  project,
  user,
  onMakeVersion,
}: {
  readonly design: Design;
  readonly project: Project;
  readonly user: User | null;
  readonly onMakeVersion: () => void;
}) {
  const isAuthor = user !== null && design.author !== null && design.author.id === user.id;
  if (!isAuthor) return null;
  if (design.status === 'draft') {
    return (
      <ButtonLink href={PATHS.design(project.id, design.id)}>{messages.designPage.edit}</ButtonLink>
    );
  }
  if (design.status === 'submitted') {
    return (
      <Button variant="secondary" onPress={onMakeVersion}>
        {messages.designPage.makeVersion}
      </Button>
    );
  }
  return null;
}

export interface DesignDetailsProps {
  readonly design: Design;
  readonly project: Project;
  readonly user: User | null;
  readonly onMakeVersion: () => void;
  /** The visitor's vote buttons, shown right under the byline. */
  readonly vote?: ReactNode;
  /** Review this design or See comments, first in the action row. */
  readonly review?: ReactNode;
  /** How the visitor got here; 'submitted' when the editor just sent the design in. */
  readonly arrival?: DesignArrival;
}

export type DesignArrival = 'submitted' | 'visit';

function Byline({ design }: { readonly design: Design }) {
  const text = messages.designPage;
  const counts = { up: design.up, down: design.down };
  return (
    <p className="web-design__byline" data-kind="data">
      {design.author === null
        ? format(text.votesOnly, counts)
        : format(text.byline, { ...counts, author: design.author.displayName })}
    </p>
  );
}

/** The grouped items as a ruled list; pressing a row shows its name and cost. */
function ItemInspector({ groups }: { readonly groups: readonly ItemGroup[] }) {
  const hintId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const active = groups.find((group) => group.catalogId === selected) ?? null;
  return (
    <div className="web-design__inspector">
      <p id={hintId} className="web-design__inspect-hint">
        {messages.designPage.inspectHint}
      </p>
      <ul aria-labelledby={hintId} className="web-design__items web-design__items--rows">
        {groups.map((group) => (
          <li key={group.catalogId}>
            <Button
              variant="tertiary"
              aria-pressed={group.catalogId === selected ? 'true' : 'false'}
              onPress={() => {
                setSelected(group.catalogId);
              }}
            >
              <span className="web-design__item-name" data-kind="data">
                {group.name}
              </span>
              {group.count > 1 ? (
                <span className="web-design__item-count ps-table__num" data-kind="data">
                  {format(messages.designPage.itemCount, { count: group.count })}
                </span>
              ) : null}
            </Button>
          </li>
        ))}
      </ul>
      <InspectPanel group={active} />
    </div>
  );
}

/** The design details: title, author and votes first, then the vote, share, legend and inspector. */
export function DesignDetails({
  design,
  project,
  user,
  onMakeVersion,
  vote,
  review,
  arrival = 'visit',
}: DesignDetailsProps): ReactNode {
  const items = useMemo(() => inspectItems(design), [design]);
  const rows = useMemo(() => legendRows(items, design), [items, design]);
  const groups = useMemo(() => itemGroups(items), [items]);
  return (
    <Stack gap="medium" className="web-design__details">
      <div className="web-design__head">
        <h1 className="web-design__title" data-kind="data">
          {design.title}
        </h1>
        <Byline design={design} />
        {arrival === 'submitted' ? <p role="status">{messages.designPage.submitted}</p> : null}
      </div>
      {vote}
      <div className="ps-inline ps-gap--small">
        {review}
        <AuthorActions
          design={design}
          project={project}
          user={user}
          onMakeVersion={onMakeVersion}
        />
        <ShareButton project={project} />
      </div>
      <Legend rows={rows} design={design} />
      <ItemInspector groups={groups} />
      <a className="web-design__back" href={PATHS.gallery(project.id)}>
        {messages.designPage.backToGallery}
      </a>
    </Stack>
  );
}
