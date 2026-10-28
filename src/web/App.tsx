import { useEffect, useMemo, useState } from 'react';
import fixture from '../../fixtures/night-01.json';
import storyFixture from '../../fixtures/story-01.json';
import { findMentions, formatClock, resolveMinute } from '../core/clock';
import { explainEvent } from '../core/explain';
import { OllamaUnreachableError, probeOllama, resolveConfig, type Probe } from '../core/ollama';
import { buildMessages } from '../core/prompt';
import { houseAt } from '../core/state';
import { describeStory, type RecordedStory } from '../core/story';
import { pickTimeline, scoreEvents } from '../core/timeline';
import { NIGHT_END, NIGHT_START, stamp, type HaEvent } from '../data/types';
import { friendlyError } from './errors';
import { Log } from './Log';
import { Plan } from './Plan';
import { buildLegs, buildMarks } from './plan';
import { timeAtStart } from './playback';
import { defaultConfig, loadConfig, saveConfig } from './settings';
import { Story } from './Story';
import { Strip } from './Strip';
import { useStory } from './useStory';

const REPO_URL = 'https://github.com/Lanthanum89/Ghost-in-the-Machine';

const history = fixture as HaEvent[];
const RECORDED = storyFixture as RecordedStory;
const START = Date.parse(NIGHT_START);
const END = Date.parse(NIGHT_END);
/** The page opens just after lights out: a quiet house, before anything strange has been recorded. */
const OPENING = Date.parse(stamp('22:50'));

// The selection never changes for the bundled night, so work it out once.
const PICKED = pickTimeline(history);
const SCORED = scoreEvents(history);
/** Every reading in the history, before filtering drops repeats, motion clearing and doors closing. */
const READINGS = history.length;
const PICKED_KEYS = new Set(PICKED.map((p) => `${p.event.entity_id}@${p.event.last_changed}`));
// Same scored objects as in SCORED, so reference equality identifies the selected rows.
const SELECTED = new Set(SCORED.filter((s) => PICKED_KEYS.has(`${s.event.entity_id}@${s.event.last_changed}`)));
const MARKS = buildMarks(PICKED);
const LEGS = buildLegs(MARKS);

/** A time named only to the minute becomes the instant of the event it points at. Exact times pass straight through setTime. */
const atMinute = (ms: number) => resolveMinute(ms, SCORED);

const DATES = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const NIGHT_LABEL = `${new Date(START).getUTCDate()} to ${DATES.format(new Date(END))}`;

const READING_GUIDE = [
  ['recorded', 'The sensors', 'Each line of the raw record is a state change a sensor logged, and nothing more. A missing line means no change was recorded. It does not mean nothing happened.'],
  ['rule-based', 'This project', 'The marks, the rule scores and the word "unexplained" come from six rules written for this project. They are assumptions. A phone at home does not mean its owner was asleep.'],
  ['model', 'The story', 'The story is a language model’s reading of the events it was shown. Which events those were already shapes it. Treat it as fiction, not a finding.'],
] as const;

type Mode = 'recorded' | 'live';

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function App() {
  const [config, setConfig] = useState(loadConfig);
  // Raw text while editing. It is normalised and saved on blur, so clearing a field or typing
  // a new address does not get rewritten mid-keystroke.
  const [draft, setDraft] = useState(() => ({ host: config.host, model: config.model }));
  const [mode, setMode] = useState<Mode>('recorded');
  const [probe, setProbe] = useState<Probe | 'checking'>('checking');
  const [probeRun, setProbeRun] = useState(0);
  const [onlySelected, setOnlySelected] = useState(false);
  const [time, setTime] = useState(OPENING);
  /** Number of the marked event being looked at, and whether the walkthrough is guiding the visitor. */
  const [selected, setSelected] = useState<number | null>(null);
  const [guided, setGuided] = useState(false);
  const story = useStory();

  const streaming = story.status === 'streaming';
  const error = story.status === 'error' ? friendlyError(story.error, config, window.location.origin) : null;
  const house = useMemo(() => houseAt(history, time), [time]);
  const mark = selected ? MARKS[selected - 1] : undefined;
  const explanation = useMemo(() => (mark ? explainEvent(history, mark.event) : null), [mark]);

  // As the story names a time, the chart and plan follow it.
  const mentions = useMemo(() => findMentions(story.text, START, END), [story.text]);
  const lastMention = mentions[mentions.length - 1]?.ms;
  useEffect(() => {
    if (lastMention !== undefined) setTime(atMinute(lastMention));
  }, [lastMention]);

  // In live mode, find out whether Ollama is there before anyone presses the stamp.
  useEffect(() => {
    if (mode !== 'live') return;
    let current = true;
    setProbe('checking');
    void probeOllama(config).then((result) => current && setProbe(result));
    return () => {
      current = false;
    };
  }, [mode, config, probeRun]);

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
    // The story drives the plan and chart now, so a selected event would no longer match them.
    setGuided(false);
    setSelected(null);
    if (mode === 'recorded') {
      const instant = prefersReducedMotion();
      setTime(timeAtStart({ instant, text: RECORDED.text, start: START, end: END, resolve: atMinute }));
      story.play(RECORDED.text, instant);
    } else {
      // The chart only moves once the model has named a time, so a failed connection leaves it where you were.
      void story.start(buildMessages(PICKED), commitDraft());
    }
  };

  // Choosing an event or exploring the night takes over from a story that is still being told. Otherwise its next
  // time would move the plan and chart away from the event the explanation and walkthrough are about.
  const selectMark = (n: number) => {
    const target = MARKS[n - 1];
    if (!target) return;
    story.stop();
    setSelected(n);
    setTime(target.time);
  };
  const exploreNight = () => {
    story.stop();
    setGuided(false);
    setSelected(null);
    setTime(START);
  };
  const startWalkthrough = () => {
    setGuided(true);
    selectMark(1);
  };

  const titleBlock: Array<[string, string]> = [
    ['subject', 'a fictional night'],
    ['story', mode === 'live' ? `live, from ${config.model}` : describeStory(RECORDED).replace(/\.$/, '')],
    ['events', `${READINGS} readings, ${SCORED.length} after filtering, ${PICKED.length} shown to the model, ${MARKS.length} marked`],
    ['at', `${formatClock(time)}, ${house.phonesHome} of ${house.phonesTotal} tracked phones home`],
  ];
  const probeNote = mode === 'live' ? liveNote(probe, config.host, config.model) : null;
  const unreachable = probe !== 'checking' && probe.status === 'down' ? friendlyError(new OllamaUnreachableError(config.host), config, window.location.origin) : null;

  return (
    <div className="mx-auto max-w-[1360px] p-3 sm:p-5">
      <div className="sheet px-4 pb-8 pt-6 sm:px-9 sm:pb-10">
        <header className="grid items-end gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <p className="font-mono text-[0.8125rem] text-line">
              survey of a night &middot; {NIGHT_LABEL} &middot; <strong className="font-medium text-red">fictional sample data</strong>
            </p>
            <h1 className="ghosted mt-2 text-[clamp(2.2rem,5.4vw,4rem)] font-medium leading-[1.05] tracking-[-0.02em] text-headline">
              <span className="ghost-layer" aria-hidden="true">
                Ghost in the House
              </span>
              Ghost in the House
            </h1>
            <p className="mt-3 max-w-2xl text-[clamp(1.15rem,1.8vw,1.35rem)] leading-snug text-headline">
              A quiet house. Four events nothing explains. A language model asked to explain them.
            </p>
            <p className="mt-2 max-w-2xl text-[1.0625rem] leading-normal text-line">
              The sensors logged <strong className="font-medium text-headline">{READINGS}</strong> readings.{' '}
              <strong className="font-medium text-headline">{SCORED.length}</strong> changes survive filtering, six rules picked{' '}
              <strong className="font-medium text-headline">{PICKED.length}</strong> to show the model, and {MARKS.length} of those are marked
              in red as unexplained.
            </p>
          </div>
          <dl className="grid grid-cols-[4.6rem_minmax(0,1fr)] border border-line/45 font-mono text-[0.8125rem] leading-snug">
            {titleBlock.map(([k, v]) => (
              <div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-line/25 last:border-b-0">
                <dt className="border-r border-line/25 px-2 py-1.5 text-line">{k}</dt>
                <dd className="px-2 py-1.5 text-headline">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="mt-5 h-px bg-line/40" />

        <div className="layout mt-8">
          <main className="area-story">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-[1.6rem] font-semibold leading-tight tracking-tight text-headline">The telling</h2>
              <span className="tag">AI account</span>
            </div>
            <p className="mt-2 max-w-xl text-[1.0625rem] leading-normal text-line">
              A language model&rsquo;s reading of the {PICKED.length} events it was shown. It was not told which are strange. Treat
              it as fiction, not a finding.
            </p>

            <fieldset className="mt-5">
              <legend className="sr-only">Where the story comes from</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['recorded', 'Recorded story', 'Plays now. Nothing to install.'],
                    ['live', 'Live', 'Written now by a model on your machine. Needs Ollama.'],
                  ] as const
                ).map(([value, title, hint]) => (
                  <label
                    key={value}
                    className={`block cursor-pointer border px-3 py-2.5 ${mode === value ? 'border-red bg-red/[0.08]' : 'border-line/40 hover:border-line/70'}`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => {
                        story.reset();
                        setMode(value);
                      }}
                      className="peer sr-only"
                    />
                    <span className="block font-mono text-[0.875rem] text-headline peer-focus-visible:underline">{title}</span>
                    <span className="mt-0.5 block text-[1rem] leading-snug text-line">{hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === 'recorded' ? (
              <p className="mt-3 text-[1rem] text-line">{describeStory(RECORDED)}</p>
            ) : (
              <div role="status" className="mt-3 text-[1rem] text-line">
                {probeNote}
                {unreachable && (
                  <pre className="mt-2 overflow-x-auto border-l-2 border-red bg-white/[0.04] p-3 font-mono text-[0.8125rem] leading-relaxed text-headline">
                    {unreachable.commands.join('\n')}
                  </pre>
                )}
                <button
                  type="button"
                  onClick={() => setProbeRun((n) => n + 1)}
                  className="mt-2 block font-mono text-[0.8125rem] text-line underline underline-offset-4 hover:text-headline"
                >
                  check again
                </button>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button type="button" onClick={tell} disabled={streaming} className="stamp">
                What happened last night?
              </button>
              {streaming && (
                <button type="button" onClick={story.stop} className="font-mono text-[0.8125rem] text-line underline underline-offset-4 hover:text-headline">
                  stop
                </button>
              )}
            </div>

            {error && (
              <aside role="alert" className="mt-8 -rotate-[0.6deg] bg-slip p-5 text-[#1b1710]">
                <p className="font-mono text-[0.75rem] uppercase tracking-[0.12em] text-[#6b2d1f]">Note to the inspector</p>
                <h3 className="mt-1 text-[1.35rem] font-semibold leading-tight">{error.title}</h3>
                <p className="mt-1.5 text-[1.0625rem] leading-snug">{error.detail}</p>
                {error.commands.length > 0 && (
                  <pre className="mt-3 overflow-x-auto bg-[#1b1710] p-3 font-mono text-[0.8125rem] leading-relaxed text-slip">
                    {error.commands.join('\n')}
                  </pre>
                )}
              </aside>
            )}

            <div aria-live="polite" aria-busy={streaming} className="mt-7 min-h-40">
              {story.status === 'idle' && !error && (
                <p className="max-w-md text-[1.0625rem] leading-normal text-line">
                  Press the stamp. Each time the story names a moment it becomes a link: the plan and the chart show the
                  house as the sensors last recorded it.
                </p>
              )}
              <Story text={story.text} streaming={streaming} start={START} end={END} onJump={(ms) => setTime(atMinute(ms))} />
            </div>

            {mode === 'live' && (
              <details className="mt-4 border-t border-line/25 pt-3 text-line">
                <summary className="cursor-pointer font-mono text-[0.875rem] text-headline">Model connection settings</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[1rem]">
                    Ollama address
                    <input
                      value={draft.host}
                      onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                      onBlur={commitDraft}
                      spellCheck={false}
                      className="border border-line/45 bg-ground px-2.5 py-2 font-mono text-[0.875rem] text-headline"
                    />
                  </label>
                  <label className="grid gap-1 text-[1rem]">
                    Model
                    <input
                      value={draft.model}
                      onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      onBlur={commitDraft}
                      spellCheck={false}
                      className="border border-line/45 bg-ground px-2.5 py-2 font-mono text-[0.875rem] text-headline"
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
                  className="mt-3 font-mono text-[0.8125rem] underline underline-offset-4 hover:text-headline"
                >
                  reset to defaults
                </button>
              </details>
            )}
          </main>

          <div className="area-instrument space-y-6">
            <section aria-labelledby="start-heading">
              <h2 id="start-heading" className="text-[1.6rem] font-semibold leading-tight tracking-tight text-headline">
                Four events nothing explains
              </h2>
              <p className="mt-1 text-[1.0625rem] leading-normal text-line">
                The house opens just after lights out. Take the walkthrough, pick an event, or explore the night from 18:00.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startWalkthrough}
                  className="border-2 border-red px-4 py-2 font-mono text-[0.875rem] text-red hover:bg-red hover:text-ground"
                >
                  Walk through the four events
                </button>
                <button
                  type="button"
                  onClick={exploreNight}
                  className="border border-line/50 px-4 py-2 font-mono text-[0.875rem] text-headline hover:border-line"
                >
                  Explore the night from 18:00
                </button>
              </div>
              <ol className="mt-3 grid gap-px border border-line/30 bg-line/20 sm:grid-cols-2">
                {MARKS.map((m) => (
                  <li key={m.n} className="bg-ground">
                    <button
                      type="button"
                      aria-pressed={selected === m.n}
                      onClick={() => {
                        setGuided(false);
                        selectMark(m.n);
                      }}
                      className={`grid h-full w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 px-3 py-2.5 text-left hover:bg-line/[0.06] ${selected === m.n ? 'bg-red/[0.12] outline outline-2 -outline-offset-2 outline-red' : ''}`}
                    >
                      <span className="font-mono text-[0.9375rem] text-red">{m.n}</span>
                      <span>
                        <span className="block font-mono text-[0.8125rem] text-line">{formatClock(m.time)}</span>
                        <span className="block text-[1rem] leading-snug text-headline">{m.text}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="selected-heading" aria-live="polite" className="border border-line/40 p-4">
              {mark && explanation ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 id="selected-heading" className="text-[1.15rem] font-semibold leading-tight text-headline">
                      Event <span className="font-mono text-red">{mark.n}</span> at <span className="font-mono">{formatClock(mark.time)}</span>
                    </h3>
                    <span className="tag">rule score {mark.event.score}, not a probability</span>
                    <span className="tag">recorded facts</span>
                  </div>
                  <dl className="mt-3 space-y-3 text-[1.0625rem] leading-normal">
                    <div>
                      <dt className="font-mono text-[0.8125rem] text-line">what changed</dt>
                      <dd className="text-headline">{explanation.changed}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[0.8125rem] text-line">recorded beforehand</dt>
                      <dd>
                        <ul className="space-y-1 text-headline">
                          {explanation.before.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[0.8125rem] text-line">what remains unknown</dt>
                      <dd className="text-headline">{explanation.unknown}</dd>
                    </div>
                  </dl>
                  {guided && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/25 pt-3">
                      <span className="mr-auto font-mono text-[0.8125rem] text-line">
                        walkthrough, step {mark.n} of {MARKS.length}
                      </span>
                      <button
                        type="button"
                        disabled={mark.n === 1}
                        onClick={() => selectMark(mark.n - 1)}
                        className="border border-line/50 px-3 py-1.5 font-mono text-[0.8125rem] text-headline hover:border-line disabled:opacity-40"
                      >
                        Previous
                      </button>
                      {mark.n < MARKS.length ? (
                        <button
                          type="button"
                          onClick={() => selectMark(mark.n + 1)}
                          className="border-2 border-red px-3 py-1.5 font-mono text-[0.8125rem] text-red hover:bg-red hover:text-ground"
                        >
                          Next event
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setGuided(false)}
                          className="border-2 border-red px-3 py-1.5 font-mono text-[0.8125rem] text-red hover:bg-red hover:text-ground"
                        >
                          Finish, then press the stamp
                        </button>
                      )}
                      <button type="button" onClick={() => setGuided(false)} className="px-2 py-1.5 font-mono text-[0.8125rem] text-line underline underline-offset-4 hover:text-headline">
                        stop
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3 id="selected-heading" className="text-[1.15rem] font-semibold leading-tight text-headline">
                    Select an event
                  </h3>
                  <p className="mt-1 text-[1.0625rem] leading-normal text-line">
                    Pick one of the four above, or a red number on the plan. This panel then shows what changed, what the
                    sensors recorded beforehand, and what the record cannot tell you.
                  </p>
                </>
              )}
            </section>

            <figure>
              <figcaption className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[1.0625rem] text-line">
                <span>
                  <span className="font-mono text-[0.8125rem]">fig. 1</span>&ensp;The ground floor at{' '}
                  <span className="font-mono text-[0.9375rem] text-red">{formatClock(time)}</span>
                </span>
                <span className="tag">recorded state</span>
                <span className="tag">rule-based marks</span>
              </figcaption>
              <Plan state={house} time={time} marks={MARKS} legs={LEGS} selected={selected} onSelect={(n) => { setGuided(false); selectMark(n); }} />
              <p className="mt-1 text-[1rem] leading-snug text-line">
                Dashed links join the marked events in time order. They show sequence, not a tracked route.
              </p>
            </figure>

            <figure>
              <figcaption className="mb-1 text-[1.0625rem] leading-snug text-line">
                <span className="font-mono text-[0.8125rem]">fig. 2</span>&ensp;The night. Drag along it, or use the arrow keys. Red
                numbers are rule scores, not probabilities.
              </figcaption>
              <Strip events={SCORED} history={history} selected={SELECTED} start={START} end={END} time={time} onTime={(ms) => setTime(atMinute(ms))} />
            </figure>
          </div>

          <div className="area-log">
            <Log
              events={SCORED}
              total={READINGS}
              selected={SELECTED}
              time={time}
              onlySelected={onlySelected}
              onToggleOnlySelected={setOnlySelected}
              onTime={setTime}
            />
          </div>
        </div>

        <section aria-labelledby="guide-heading" className="mt-12 border-t-4 border-double border-line/50 pt-6">
          <h2 id="guide-heading" className="text-[1.6rem] font-semibold leading-tight tracking-tight text-headline">
            What is fact, what is assumption, what is the model
          </h2>
          <div className="mt-5 grid gap-8 md:grid-cols-3">
            {READING_GUIDE.map(([tag, who, text]) => (
              <div key={tag}>
                <p className="flex items-center gap-3">
                  <span className="tag">{tag}</span>
                  <span className="font-mono text-[0.8125rem] text-line">{who}</span>
                </p>
                <p className="mt-2 text-[1.0625rem] leading-normal text-headline">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap justify-between gap-x-8 gap-y-2 border-t border-line/25 pt-4 font-mono text-[0.8125rem] text-line">
          <p>Set in IBM Plex Sans and Plex Mono. Sensor data is fictional, shaped like Home Assistant history.</p>
          <p>
            <a href={REPO_URL} className="underline underline-offset-4 hover:text-headline">
              source on GitHub
            </a>{' '}
            &middot;{' '}
            <a href={`${REPO_URL}/blob/main/LICENSE`} className="underline underline-offset-4 hover:text-headline">
              MIT licence
            </a>{' '}
            &middot; no cloud AI
          </p>
        </footer>
      </div>
    </div>
  );
}

function liveNote(probe: Probe | 'checking', host: string, model: string): string {
  if (probe === 'checking') return `Looking for Ollama at ${host}...`;
  if (probe.status === 'ready') return `Ollama is running at ${host} and has ${model}. Ready.`;
  if (probe.status === 'missing-model') return `Ollama is running at ${host} but does not have ${model}. Run: ollama pull ${model}`;
  return `No Ollama found at ${host}. Start it first, then check again, or use the recorded story.`;
}
