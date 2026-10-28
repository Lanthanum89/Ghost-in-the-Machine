import { useEffect, useMemo, useState } from 'react';
import fixture from '../../fixtures/night-01.json';
import { findMentions, formatClock, resolveMinute } from '../core/clock';
import { resolveConfig } from '../core/ollama';
import { buildMessages } from '../core/prompt';
import { houseAt } from '../core/state';
import { pickTimeline, scoreEvents } from '../core/timeline';
import { NIGHT_END, NIGHT_START, type HaEvent } from '../data/types';
import { friendlyError } from './errors';
import { Log } from './Log';
import { Plan } from './Plan';
import { buildLegs, buildMarks } from './plan';
import { defaultConfig, loadConfig, saveConfig } from './settings';
import { Story } from './Story';
import { Strip } from './Strip';
import { useStory } from './useStory';

const history = fixture as HaEvent[];
const START = Date.parse(NIGHT_START);
const END = Date.parse(NIGHT_END);

// The selection never changes for the bundled night, so work it out once.
const PICKED = pickTimeline(history);
const SCORED = scoreEvents(history);
const PICKED_KEYS = new Set(PICKED.map((p) => `${p.event.entity_id}@${p.event.last_changed}`));
// Same scored objects as in SCORED, so reference equality identifies the selected rows.
const SELECTED = new Set(SCORED.filter((s) => PICKED_KEYS.has(`${s.event.entity_id}@${s.event.last_changed}`)));
const MARKS = buildMarks(PICKED);
const LEGS = buildLegs(MARKS);

const DATES = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** A time named only to the minute becomes the instant of the event it points at. Exact times pass straight through setTime. */
const atMinute = (ms: number) => resolveMinute(ms, SCORED);

const NIGHT_LABEL = `${new Date(START).getUTCDate()} to ${DATES.format(new Date(END))}`;

export function App() {
  const [config, setConfig] = useState(loadConfig);
  // Raw text while editing. It is normalised and saved on blur, so clearing a field or typing
  // a new address does not get rewritten mid-keystroke.
  const [draft, setDraft] = useState(() => ({ host: config.host, model: config.model }));
  const [onlySelected, setOnlySelected] = useState(false);
  // Opens on the last unexplained event, so the first thing you see is the haunted house.
  const [time, setTime] = useState(() => (MARKS.length ? MARKS[MARKS.length - 1]!.time : START));
  const story = useStory();

  const streaming = story.status === 'streaming';
  const error = story.status === 'error' ? friendlyError(story.error, config, window.location.origin) : null;
  const house = useMemo(() => houseAt(history, time), [time]);

  // As the story names a time, the chart and plan follow it.
  const mentions = useMemo(() => findMentions(story.text, START, END), [story.text]);
  const lastMention = mentions[mentions.length - 1]?.ms;
  useEffect(() => {
    if (lastMention !== undefined) setTime(atMinute(lastMention));
  }, [lastMention]);

  /** Normalises the draft, saves it if it changed, and returns the config to use. */
  const commitDraft = () => {
    const next = resolveConfig({ OLLAMA_HOST: draft.host, OLLAMA_MODEL: draft.model });
    setDraft({ host: next.host, model: next.model });
    if (next.host === config.host && next.model === config.model) return config;
    setConfig(next);
    saveConfig(next);
    return next;
  };

  const tell = () => {
    setTime(START);
    void story.start(buildMessages(PICKED), commitDraft());
  };

  const titleBlock: Array<[string, string]> = [
    ['sheet', '1 of 1'],
    ['subject', 'one house, one night'],
    ['drawn', 'by the sensors'],
    ['told', `by ${config.model}`],
    ['events', `${SCORED.length} recorded, ${PICKED.length} shown`],
    ['at', `${formatClock(time)}, ${house.phonesHome} of ${house.phonesTotal} phones home`],
  ];

  return (
    <div className="mx-auto max-w-[1360px] p-3 sm:p-5">
      <div className="sheet px-4 pb-8 pt-7 sm:px-9 sm:pb-10">
        <header className="grid items-end gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div>
            <p className="font-mono text-[0.7rem] text-muted">survey of a night &middot; {NIGHT_LABEL} &middot; 18:00 to 07:00</p>
            <h1
              data-text="Ghost in the House"
              className="ghosted mt-3 font-pica text-[clamp(3.1rem,10.5vw,8.25rem)] italic leading-[0.92] tracking-[-0.01em] text-headline"
            >
              Ghost in the House
            </h1>
            <p className="mt-3 max-w-xl text-[1.2rem] italic leading-snug text-muted">
              A plan of the ground floor, the night&rsquo;s sensor record, and what a language model made of both.
            </p>
          </div>
          <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] border border-line/45 font-mono text-[0.7rem] leading-snug">
            {titleBlock.map(([k, v]) => (
              <div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-line/25 last:border-b-0">
                <dt className="border-r border-line/25 px-2 py-1.5 text-muted">{k}</dt>
                <dd className="px-2 py-1.5 text-headline">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="mt-6 h-px bg-line/40" />

        <div className="layout mt-9">
          <main className="area-story">
            <h2 className="font-pica text-[2.6rem] italic leading-none text-headline">The telling</h2>
            <p className="mt-2 text-[1.08rem] italic text-muted">
              As told by <span className="font-mono text-[0.8rem] not-italic text-line">{config.model}</span>, who was
              shown only the {PICKED.length} marked entries and was not told which were strange.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button type="button" onClick={tell} disabled={streaming} className="stamp">
                What happened last night?
              </button>
              {streaming && (
                <button type="button" onClick={story.stop} className="font-mono text-[0.72rem] text-muted underline underline-offset-4 hover:text-headline">
                  stop
                </button>
              )}
            </div>

            {error && (
              <aside role="alert" className="mt-8 -rotate-[0.6deg] bg-slip p-5 text-[#1b1710]">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-[#6b2d1f]">Note to the inspector</p>
                <h3 className="mt-1 font-pica text-[1.7rem] italic leading-tight">{error.title}</h3>
                <p className="mt-1.5 text-[1.02rem] leading-snug">{error.detail}</p>
                {error.commands.length > 0 && (
                  <pre className="mt-3 overflow-x-auto bg-[#1b1710] p-3 font-mono text-[0.72rem] leading-relaxed text-slip">
                    {error.commands.join('\n')}
                  </pre>
                )}
              </aside>
            )}

            <div aria-live="polite" aria-busy={streaming} className="mt-8 min-h-48">
              {story.status === 'idle' && !error && (
                <p className="max-w-md text-[1.2rem] italic leading-snug text-muted">
                  Press the stamp. Each time the story names a moment, it becomes a link: the plan and the chart will
                  show the house as it was.
                </p>
              )}
              <Story text={story.text} streaming={streaming} start={START} end={END} onJump={(ms) => setTime(atMinute(ms))} />
            </div>

            <details className="mt-6 border-t border-line/25 pt-3 text-muted">
              <summary className="cursor-pointer font-mono text-[0.72rem] text-line">the press room: model settings</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[0.95rem] italic">
                  Ollama address
                  <input
                    value={draft.host}
                    onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                    onBlur={commitDraft}
                    spellCheck={false}
                    className="border border-line/45 bg-ground px-2.5 py-2 font-mono text-[0.78rem] not-italic text-headline"
                  />
                </label>
                <label className="grid gap-1 text-[0.95rem] italic">
                  Model
                  <input
                    value={draft.model}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                    onBlur={commitDraft}
                    spellCheck={false}
                    className="border border-line/45 bg-ground px-2.5 py-2 font-mono text-[0.78rem] not-italic text-headline"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  saveConfig(null);
                  const defaults = defaultConfig();
                  setConfig(defaults);
                  setDraft({ host: defaults.host, model: defaults.model });
                }}
                className="mt-3 font-mono text-[0.72rem] underline underline-offset-4 hover:text-headline"
              >
                reset to defaults
              </button>
            </details>
          </main>

          <div className="area-instrument space-y-7">
            <figure>
              <figcaption className="mb-2 flex items-baseline justify-between gap-4">
                <span className="text-[1.05rem] italic text-muted">
                  <span className="font-mono text-[0.7rem] not-italic">fig. 1</span>&ensp;The ground floor at{' '}
                  <span className="font-mono text-[0.9rem] not-italic text-red">{formatClock(time)}</span>
                </span>
              </figcaption>
              <Plan state={house} time={time} marks={MARKS} legs={LEGS} />
            </figure>

            <figure>
              <figcaption className="mb-1 text-[1.05rem] italic text-muted">
                <span className="font-mono text-[0.7rem] not-italic">fig. 2</span>&ensp;The night. Drag along it, or use the arrow keys.
              </figcaption>
              <Strip events={SCORED} history={history} selected={SELECTED} start={START} end={END} time={time} onTime={(ms) => setTime(atMinute(ms))} />
            </figure>

            <section aria-labelledby="key-heading">
              <h3 id="key-heading" className="font-mono text-[0.7rem] text-muted">
                key: the unexplained, in order
              </h3>
              <ol className="mt-2 divide-y divide-line/15 border-y border-line/25">
                {MARKS.map((m) => (
                  <li key={m.n}>
                    <button
                      type="button"
                      onClick={() => setTime(m.time)}
                      className="grid w-full grid-cols-[1.6rem_3rem_minmax(0,1fr)] items-baseline gap-x-2 py-2 text-left hover:bg-line/[0.05]"
                    >
                      <span className="font-mono text-[0.78rem] text-red">{m.n}</span>
                      <span className="font-mono text-[0.72rem] text-muted">{formatClock(m.time)}</span>
                      <span className="text-[1.02rem] leading-snug text-headline">
                        {m.text}
                        <span className="italic text-muted">, {m.why}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="area-log">
            <Log
              events={SCORED}
              selected={SELECTED}
              time={time}
              onlySelected={onlySelected}
              onToggleOnlySelected={setOnlySelected}
              onTime={setTime}
            />
          </div>
        </div>

        <footer className="mt-12 flex flex-wrap justify-between gap-x-8 gap-y-1 border-t border-line/25 pt-4 font-mono text-[0.68rem] text-muted">
          <p>Set in IM Fell and Martian Mono. The night is fictional fixture data shaped like Home Assistant history.</p>
          <p>MIT licensed &middot; open source &middot; no cloud AI</p>
        </footer>
      </div>
    </div>
  );
}
