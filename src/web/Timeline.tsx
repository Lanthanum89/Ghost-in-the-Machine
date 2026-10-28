import { useEffect, useRef } from 'react';
import type { ScoredEvent } from '../core/timeline';

interface Props {
  events: ScoredEvent[];
  selected: Set<ScoredEvent>;
  onlySelected: boolean;
  onToggleOnlySelected: (value: boolean) => void;
  /** Bump this to scroll the list to the first strongly notable event. */
  scrollSignal: number;
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function Timeline({ events, selected, onlySelected, onToggleOnlySelected, scrollSignal }: Props) {
  const shown = onlySelected ? events.filter((e) => selected.has(e)) : events;
  const region = useRef<HTMLDivElement>(null);
  // Scroll to the first event that scored well above ordinary night-time activity.
  const anchor = shown.find((e) => selected.has(e) && e.score >= 5) ?? shown.find((e) => selected.has(e));

  useEffect(() => {
    if (!scrollSignal) return;
    const row = region.current?.querySelector<HTMLElement>('[data-anchor]');
    if (row && region.current) region.current.scrollTop = Math.max(0, row.offsetTop - 80);
  }, [scrollSignal]);

  return (
    <section aria-labelledby="timeline-heading" className="rounded-lg border border-edge bg-panel p-5">
      <h2 id="timeline-heading" className="font-serif text-xl text-text">
        What the sensors recorded
      </h2>
      <p className="mt-1 text-sm text-muted">
        {events.length} changes survived filtering. The {selected.size} highlighted ones were picked by plain rules, and
        are the only ones the model sees.
      </p>

      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={onlySelected}
          onChange={(e) => onToggleOnlySelected(e.target.checked)}
          className="h-4 w-4 accent-amber"
        />
        Show only the selected events
      </label>

      <div
        ref={region}
        tabIndex={0}
        role="region"
        aria-label="Sensor timeline, scrollable"
        className="relative mt-3 max-h-[32rem] overflow-y-auto rounded-md border border-edge"
      >
        <ol className="divide-y divide-edge">
          {shown.map((s) => {
            const picked = selected.has(s);
            return (
              <li
                key={`${s.event.entity_id}-${s.event.last_changed}`}
                data-anchor={s === anchor ? '' : undefined}
                className={picked ? 'border-l-4 border-amber bg-amber/10 px-3 py-2' : 'border-l-4 border-transparent px-3 py-2'}
              >
                <div className="flex items-baseline gap-3">
                  <time dateTime={s.event.last_changed} className="font-mono text-sm text-muted">
                    {clock(s.time)}
                  </time>
                  <span className={picked ? 'text-text' : 'text-muted'}>{s.text}</span>
                  {picked && (
                    <span className="ml-auto whitespace-nowrap rounded-full bg-amber px-2 text-xs font-semibold text-ink">
                      <span className="sr-only">Notable, </span>score {s.score}
                    </span>
                  )}
                </div>
                {picked && (
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-[3.25rem] text-sm text-amber">
                    {s.reasons.map((r) => (
                      <li key={r.rule}>
                        {r.points > 0 ? '+' : '−'}
                        {Math.abs(r.points)} {r.text}
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
