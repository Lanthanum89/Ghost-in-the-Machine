import { useEffect, useRef } from 'react';
import { formatClock } from '../core/clock';
import { NOTABLE_SCORE, type ScoredEvent } from '../core/timeline';
import { LEAD_MS } from './plan';

interface Props {
  events: ScoredEvent[];
  selected: Set<ScoredEvent>;
  time: number;
  onlySelected: boolean;
  onToggleOnlySelected: (value: boolean) => void;
  onTime: (ms: number) => void;
}

/** The raw record: every change that survived filtering, with the picked ones annotated. */
export function Log({ events, selected, time, onlySelected, onToggleOnlySelected, onTime }: Props) {
  const shown = onlySelected ? events.filter((e) => selected.has(e)) : events;
  const region = useRef<HTMLDivElement>(null);
  const nowRow = [...shown].reverse().find((e) => e.time <= time + LEAD_MS);

  // Keep the row for the chart's current moment in view, without moving the page.
  useEffect(() => {
    const box = region.current;
    const row = box?.querySelector<HTMLElement>('[data-now]');
    if (box && row) box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 3);
  }, [nowRow, onlySelected]);

  return (
    <section aria-labelledby="record-heading" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="record-heading" className="font-pica text-2xl italic text-headline">
          The raw record
        </h2>
        <label className="inline-flex cursor-pointer items-center gap-2 font-mono text-[0.72rem] text-muted">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => onToggleOnlySelected(e.target.checked)}
            className="h-3.5 w-3.5 accent-red"
          />
          only the {selected.size} shown to the model
        </label>
      </div>
      <p className="mt-1 text-[0.95rem] italic text-muted">
        {events.length} changes survived filtering. Plain rules marked {selected.size}; the model saw only those.
      </p>

      <div
        ref={region}
        tabIndex={0}
        role="region"
        aria-label="Sensor record, scrollable"
        className="relative mt-3 max-h-[26rem] overflow-y-auto border-y border-line/40"
      >
        <ol className="font-mono text-[0.78rem] leading-snug">
          {shown.map((s) => {
            const picked = selected.has(s);
            const notable = s.score >= NOTABLE_SCORE;
            const isNow = s === nowRow;
            return (
              <li
                key={`${s.event.entity_id}-${s.event.last_changed}`}
                data-now={isNow ? '' : undefined}
                className={`border-b border-line/10 ${isNow ? 'bg-line/[0.07]' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onTime(s.time)}
                  className="grid w-full grid-cols-[3.2rem_minmax(0,1fr)_2rem] items-baseline gap-x-3 px-2 py-1.5 text-left"
                >
                  <time dateTime={s.event.last_changed} className={isNow ? 'text-red' : 'text-muted'}>
                    {formatClock(s.time)}
                  </time>
                  <span className={notable ? 'text-red' : picked ? 'text-headline' : 'text-muted'}>{s.text}</span>
                  <span className={`text-right tabular-nums ${notable ? 'text-red' : 'text-line/70'}`}>
                    {picked && (
                      <>
                        <span className="sr-only">score </span>
                        {s.score}
                      </>
                    )}
                  </span>
                </button>
                {picked && (
                  <ul className="mb-2 ml-[4.45rem] mr-2 space-y-0.5 font-fell text-[0.95rem] italic leading-snug text-line/80">
                    {s.reasons.map((r) => (
                      <li key={r.rule}>
                        <span className="font-mono text-[0.72rem] not-italic tabular-nums text-muted">
                          {r.points > 0 ? '+' : '−'}
                          {Math.abs(r.points)}
                        </span>{' '}
                        {r.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
