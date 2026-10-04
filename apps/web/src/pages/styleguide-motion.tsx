import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import {
  Button,
  Dialog,
  IndeterminateProgress,
  Meter,
  SkeletonBlock,
  SkeletonReveal,
  Stack,
  SuccessCheck,
  useSetReveal,
  VoteButtons,
} from '@parkshape/ui';

import { flipRows } from '../features/leaderboard/flip-rows';
import { ranksById } from '../features/leaderboard/rank-change';
import { useCardAdvance } from '../features/vote/card-advance';
import { format, messages } from '../messages';

const { motion, sample } = messages.styleguide;
const meterStatus = messages.editor.meters.status;
const ROWS = [sample.one, sample.two, sample.three];
const LOW = { value: 38, valueText: sample.meterBudgetValue, status: 'ok' } as const;
const HIGH = { value: 49, valueText: motion.meterHigh, status: 'warn' } as const;
const LIMIT = 50;
const SAMPLE_WAIT_MS = 1200;
const SUBMIT_WAIT_MS = 2000;

function Demo({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Stack gap="small">
      <h3>{title}</h3>
      {children}
    </Stack>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Demo title={motion.dialog}>
      <Button
        variant="secondary"
        onPress={() => {
          setOpen(true);
        }}
      >
        {motion.dialogOpen}
      </Button>
      {open ? (
        <Dialog
          title={motion.dialogTitle}
          onClose={() => {
            setOpen(false);
          }}
          actions={(close) => (
            <Button variant="secondary" onPress={close}>
              {motion.dialogClose}
            </Button>
          )}
        >
          <p>{motion.dialogBody}</p>
        </Dialog>
      ) : null}
    </Demo>
  );
}

function ListDemo() {
  const [round, setRound] = useState(0);
  const list = useSetReveal<HTMLUListElement>(String(round));
  return (
    <Demo title={motion.list}>
      <Button
        variant="secondary"
        onPress={() => {
          setRound((now) => now + 1);
        }}
      >
        {motion.listAgain}
      </Button>
      <ul ref={list}>
        {ROWS.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </Demo>
  );
}

function ReorderDemo() {
  const [order, setOrder] = useState(ROWS);
  const body = useRef<HTMLTableSectionElement>(null);
  const before = useRef<ReadonlyMap<string, number> | null>(null);
  useLayoutEffect(() => {
    if (body.current !== null && before.current !== null) flipRows(body.current, before.current);
    before.current = null;
  }, [order]);
  const move = () => {
    before.current = ranksById(order);
    setOrder((now) => [...now.slice(-1), ...now.slice(0, -1)]);
  };
  return (
    <Demo title={motion.reorder}>
      <Button variant="secondary" onPress={move}>
        {motion.reorderMove}
      </Button>
      <table className="ps-table">
        <tbody ref={body}>
          {order.map((row, index) => (
            <tr key={row} data-design-id={row}>
              <td className="ps-table__num">{index + 1}</td>
              <td>{row}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Demo>
  );
}

function MeterDemo() {
  const [high, setHigh] = useState<'low' | 'high'>('low');
  const shown = high === 'high' ? HIGH : LOW;
  return (
    <Demo title={motion.meter}>
      <Button
        variant="secondary"
        onPress={() => {
          setHigh(high === 'high' ? 'low' : 'high');
        }}
      >
        {motion.meterChange}
      </Button>
      <Meter
        label={sample.meterBudget}
        limit={LIMIT}
        value={shown.value}
        status={shown.status}
        valueText={shown.valueText}
        statusText={meterStatus[shown.status]}
      />
    </Demo>
  );
}

/** Starts a fake wait, then ends it after `ms`; 'waiting' while it runs. */
function useSampleWait(ms: number) {
  const [state, setState] = useState<'waiting' | 'ready'>('ready');
  useEffect(() => {
    if (state !== 'waiting') return undefined;
    const handle = window.setTimeout(() => {
      setState('ready');
    }, ms);
    return () => {
      window.clearTimeout(handle);
    };
  }, [state, ms]);
  return {
    state,
    start: () => {
      setState('waiting');
    },
  };
}

function SkeletonDemo() {
  const wait = useSampleWait(SAMPLE_WAIT_MS);
  return (
    <Demo title={motion.skeleton}>
      <Button variant="secondary" onPress={wait.start}>
        {motion.skeletonAgain}
      </Button>
      {wait.state === 'waiting' ? <SkeletonBlock shape="line" /> : null}
      <SkeletonReveal state={wait.state} reveal="fade">
        <p>{motion.skeletonContent}</p>
      </SkeletonReveal>
    </Demo>
  );
}

function CardDemo() {
  const [index, setIndex] = useState(1);
  const card = useRef<HTMLDivElement>(null);
  const advance = useCardAdvance(card, index);
  const next = (result: 'up' | 'down' | 'skipped') => () => {
    advance.capture(result);
    setIndex((now) => now + 1);
  };
  return (
    <Demo title={motion.card}>
      <div ref={card}>
        <div className="web-vote__stage web-styleguide__stage">
          <p className="web-styleguide__card">{format(motion.cardTitle, { number: index })}</p>
        </div>
      </div>
      <VoteButtons
        upLabel={messages.vote.up}
        downLabel={messages.vote.down}
        skipLabel={messages.vote.skip}
        onUp={next('up')}
        onDown={next('down')}
        onSkip={next('skipped')}
      />
    </Demo>
  );
}

function VoteDemo() {
  const [chosen, setChosen] = useState<'up' | 'down' | null>(null);
  return (
    <Demo title={motion.vote}>
      <VoteButtons
        upLabel={messages.vote.up}
        downLabel={messages.vote.down}
        skipLabel={messages.vote.skip}
        chosen={chosen}
        onUp={() => {
          setChosen('up');
        }}
        onDown={() => {
          setChosen('down');
        }}
        onSkip={() => {
          setChosen(null);
        }}
      />
    </Demo>
  );
}

function SubmitDemo() {
  const wait = useSampleWait(SUBMIT_WAIT_MS);
  const [started, setStarted] = useState<'yes' | 'no'>('no');
  return (
    <Demo title={motion.submit}>
      <Button
        variant="secondary"
        onPress={() => {
          setStarted('yes');
          wait.start();
        }}
      >
        {motion.submitStart}
      </Button>
      {wait.state === 'waiting' ? (
        <IndeterminateProgress label={messages.submit.submitting} />
      ) : null}
      {wait.state === 'ready' && started === 'yes' ? (
        <p className="web-submit__done">
          <SuccessCheck />
          {motion.submitDone}
        </p>
      ) : null}
    </Demo>
  );
}

function MotionDemos() {
  return (
    <Stack gap="large">
      <Demo title={motion.press}>
        <div>
          <Button>{motion.pressButton}</Button>
        </div>
      </Demo>
      <DialogDemo />
      <ListDemo />
      <ReorderDemo />
      <MeterDemo />
      <SkeletonDemo />
      <CardDemo />
      <VoteDemo />
      <SubmitDemo />
    </Stack>
  );
}

/**
 * Each web motion with a button that starts it, inside a closed disclosure. The demos mount only
 * once it is open, so the page's word budget and first view stay as they were.
 */
export function MotionSection() {
  const [open, setOpen] = useState<'open' | 'closed'>('closed');
  return (
    <section className="web-styleguide__section" aria-label={messages.styleguide.sections.motion}>
      <h2 className="web-heading-2">{messages.styleguide.sections.motion}</h2>
      <details
        onToggle={(event) => {
          setOpen(event.currentTarget.open ? 'open' : 'closed');
        }}
      >
        <summary>{motion.summary}</summary>
        {open === 'open' ? <MotionDemos /> : null}
      </details>
    </section>
  );
}
