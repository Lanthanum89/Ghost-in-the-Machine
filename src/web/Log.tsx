import { useEffect, useRef } from 'react';
import { formatClock } from '../core/clock';
import { NOTABLE_SCORE, POINTS, RULE_TEXT, type Reason, type ScoredEvent } from '../core/timeline';

interface Props {
  events: ScoredEvent[];
  selected: Set<ScoredEvent>;
  time: number;
  onlySelected: boolean;
  onToggleOnlySelected: (value: boolean) => void;
  onTime: (ms: number) => void;
}

const sign = (n: number) => (n > 0 ? '+' : '−');
const RULES = Object.keys(RULE_TEXT) as Array<Reason['rule']>;

/** The raw record: every change that survived filtering, with the picked ones annotated. */
export function Log({ events, selected, time, onlySelected, onToggleOnlySelected, onTime }: Props) {
  const shown = onlySelected ? events.filter((e) => selected.has(e)) : events;
  const region = useRef<HTMLDivElement>(null);
  const nowRow = [...shown].reverse().find((e) => e.time <= time);

  // Keep the row for the chart's current moment in view, without moving the page.
  useEffect(() => {
    const box = region.current;
    const row = box?.querySelector<HTMLElement>('[data-now]');
    if (box && row) box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 3);
  }, [nowRow, onlySelected]);

  return (
    <section aria-labelledby="record-heading" className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="record-heading" className="font-pica text-[2rem] italic leading-none text-headline">
          The raw record
        </h2>
        <span className="tag">recorded</span>
      </div>
      <p className="mt-2 text-[1.05rem] leading-snug text-line">
        {events.length} sensor changes survived filtering. Six rules picked {selected.size} of them to show the model. It never
        saw the rest, and which {selected.size} were chosen already shapes the story it tells.
      </p>

      <details className="mt-3 border-y border-line/25 py-2 text-[1.02rem]">
        <summary className="cursor-pointer font-mono text-[0.8rem] text-headline">how the {selected.size} were chosen</summary>
        <ul className="mt-3 space-y-2.5">
          {RULES.map((rule) => (
            <li key={rule} className="grid grid-cols-[2.4rem_minmax(0,1fr)] gap-x-2">
              <span className="font-mono text-[0.85rem] tabular-nums text-red">
                {sign(POINTS[rule])}
                {Math.abs(POINTS[rule])}
              </span>
              <span>
                <strong className="font-normal text-headline">{RULE_TEXT[rule].title}.</strong>{' '}
                <span className="text-line/90">{RULE_TEXT[rule].text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-line/90">
          Events that score above zero are ranked and the top 20 are kept. These are the project&rsquo;s own assumptions about
          what looks unusual, not measurements.
        </p>
      </details>

      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 font-mono text-[0.8rem] text-line">
        <input
          type="checkbox"
          checked={onlySelected}
          onChange={(e) => onToggleOnlySelected(e.target.checked)}
          className="h-4 w-4 accent-red"
        />
        show only the {selected.size} the model saw
      </label>

      <div
        ref={region}
        tabIndex={0}
        role="region"
        aria-label="Sensor record, scrollable"
        className="relative mt-3 max-h-[26rem] overflow-y-auto border-y border-line/40"
      >
        <ol className="font-mono text-[0.84rem] leading-snug">
          {shown.map((s) => {
            const picked = selected.has(s);
            const notable = s.score >= NOTABLE_SCORE;
            const isNow = s === nowRow;
            const top = [...s.reasons].sort((a, b) => b.points - a.points)[0];
            return (
              <li
                key={`${s.event.entity_id}-${s.event.last_changed}`}
                data-now={isNow ? '' : undefined}
                className={`border-b border-line/10 ${isNow ? 'bg-line/[0.07]' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onTime(s.time)}
                  className="grid w-full grid-cols-[3.4rem_minmax(0,1fr)_2rem] items-baseline gap-x-3 px-2 py-2 text-left"
                >
                  <time dateTime={s.event.last_changed} className={isNow ? 'text-red' : 'text-line/80'}>
                    {formatClock(s.time)}
                  </time>
                  <span className={notable ? 'text-red' : picked ? 'text-headline' : 'text-line/80'}>{s.text}</span>
                  <span className={`text-right tabular-nums ${notable ? 'text-red' : 'text-line'}`}>
                    {picked && (
                      <>
                        <span className="sr-only">score </span>
                        {s.score}
                      </>
                    )}
                  </span>
                </button>
                {picked && top && (
                  <details key={isNow ? 'now' : 'rest'} open={isNow} className="mb-2 ml-[4.4rem] mr-2 font-fell text-[1.02rem] leading-snug text-line">
                    <summary className="cursor-pointer">
                      {top.text}
                      <span className="text-line/70"> ({sign(top.points)}{Math.abs(top.points)}). All {s.reasons.length} reasons</span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-1">
                      {s.reasons.map((r) => (
                        <li key={r.rule}>
                          <span className="font-mono text-[0.78rem] tabular-nums text-red">
                            {sign(r.points)}
                            {Math.abs(r.points)}
                          </span>{' '}
                          {r.text}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
