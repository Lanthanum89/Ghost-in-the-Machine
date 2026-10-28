import { useEffect, useRef } from 'react';
import type { ScoredEvent } from '../core/timeline';

interface Props {
  events: ScoredEvent[];
  selected: Set<ScoredEvent>;
  onlySelected: boolean;
  onToggleOnlySelected: (value: boolean) => void;
  /** Bump this to scroll the list back to the first strongly notable event. */
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

  // Also runs on load, so the first thing on screen is the night's interesting stretch, not 18:03.
  useEffect(() => {
    const row = region.current?.querySelector<HTMLElement>('[data-anchor]');
    if (row && region.current) region.current.scrollTop = Math.max(0, row.offsetTop - 80);
  }, [scrollSignal, onlySelected]);

  return (
    <section id="record" aria-labelledby="record-heading" className="min-w-0 scroll-mt-6 lg:border-l lg:border-rule lg:pl-8">
      <p className="kicker text-spectre">The record &middot; Exhibit A</p>
      <h2 id="record-heading" className="mt-1.5 font-display text-[1.9rem] font-bold leading-tight text-headline">
        What the sensors recorded
      </h2>
      <p className="mt-2.5 text-[0.95rem] leading-relaxed text-muted">
        {events.length} changes survived filtering. The {selected.size} marked in orange were chosen by six plain rules,
        and are all the model was shown.
      </p>

      <label className="mt-4 inline-flex cursor-pointer items-center gap-2.5 text-sm text-paper">
        <input
          type="checkbox"
          checked={onlySelected}
          onChange={(e) => onToggleOnlySelected(e.target.checked)}
          className="h-4 w-4 accent-ember"
        />
        Show only the {selected.size} selected
      </label>

      <div
        ref={region}
        tabIndex={0}
        role="region"
        aria-label="Sensor timeline, scrollable"
        className="relative mt-3 max-h-[34rem] overflow-y-auto border-y-2 border-t-rule-strong border-b-rule"
      >
        <ol>
          {shown.map((s) => {
            const picked = selected.has(s);
            return (
              <li
                key={`${s.event.entity_id}-${s.event.last_changed}`}
                data-anchor={s === anchor ? '' : undefined}
                className={`border-b border-rule py-2.5 pr-2 ${picked ? 'border-l-[3px] border-l-ember bg-ember/[0.07] pl-3' : 'pl-[15px]'}`}
              >
                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2.5">
                  <time dateTime={s.event.last_changed} className="font-mono text-[0.8rem] tabular-nums text-spectre">
                    {clock(s.time)}
                  </time>
                  <span className={picked ? 'font-semibold text-headline' : 'text-muted'}>{s.text}</span>
                  {picked && (
                    <span className="bg-ember px-1.5 text-xs font-semibold text-ink">
                      <span className="sr-only">Notable, score </span>
                      {s.score}
                    </span>
                  )}
                </div>
                {picked && (
                  <ul className="mt-1.5 space-y-0.5 pl-[3.75rem] text-[0.8125rem] italic leading-snug text-ember-soft">
                    {s.reasons.map((r) => (
                      <li key={r.rule}>
                        <span className="not-italic tabular-nums">
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
