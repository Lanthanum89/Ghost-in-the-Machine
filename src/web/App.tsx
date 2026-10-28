import { useEffect, useMemo, useState } from 'react';
import fixture from '../../fixtures/night-01.json';
import storyFixture from '../../fixtures/story-01.json';
import { findMentions, formatClock, resolveMinute } from '../core/clock';
import { OllamaUnreachableError, probeOllama, resolveConfig, type Probe } from '../core/ollama';
import { buildMessages } from '../core/prompt';
import { houseAt } from '../core/state';
import { describeStory, type RecordedStory } from '../core/story';
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

const REPO_URL = 'https://github.com/Lanthanum89/Ghost-in-the-Machine';

const history = fixture as HaEvent[];
const RECORDED = storyFixture as RecordedStory;
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

/** A time named only to the minute becomes the instant of the event it points at. Exact times pass straight through setTime. */
const atMinute = (ms: number) => resolveMinute(ms, SCORED);

const DATES = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const NIGHT_LABEL = `${new Date(START).getUTCDate()} to ${DATES.format(new Date(END))}`;

const READING_GUIDE = [
  ['recorded', 'The sensors', 'Each line of the raw record is a state change a sensor logged, and nothing more. A missing line means no change was recorded. It does not mean nothing happened.'],
  ['rule-based', 'This project', 'The marks, the scores and the word "unexplained" come from six rules written for this project. They are assumptions. A phone at home does not mean its owner was asleep.'],
  ['model', 'The story', 'The story is a language model’s reading of 15 of 162 events. The choice of those 15 already shapes it. Treat it as fiction, not a finding.'],
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
  // Opens on the last marked event, so the first thing you see is the house at its strangest.
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
    setTime(START);
    if (mode === 'recorded') story.play(RECORDED.text, prefersReducedMotion());
    else void story.start(buildMessages(PICKED), commitDraft());
  };

  const titleBlock: Array<[string, string]> = [
    ['subject', 'a fictional night'],
    ['told', mode === 'live' ? `live, by ${config.model}` : describeStory(RECORDED).replace(/\.$/, '')],
    ['events', `${SCORED.length} recorded, ${PICKED.length} shown to the model`],
    ['at', `${formatClock(time)}, ${house.phonesHome} of ${house.phonesTotal} tracked phones home`],
  ];
  const probeNote = mode === 'live' ? liveNote(probe, config.host, config.model) : null;
  const unreachable = probe !== 'checking' && probe.status === 'down' ? friendlyError(new OllamaUnreachableError(config.host), config, window.location.origin) : null;

  return (
    <div className="mx-auto max-w-[1360px] p-3 sm:p-5">
      <div className="sheet px-4 pb-8 pt-6 sm:px-9 sm:pb-10">
        <header className="grid items-end gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div>
            <p className="font-mono text-[0.8rem] text-line">
              survey of a night &middot; {NIGHT_LABEL} &middot; <strong className="font-medium text-red">fictional sample data</strong>
            </p>
            <h1 className="ghosted mt-2 font-pica text-[clamp(2.7rem,7.4vw,5.7rem)] italic leading-[0.95] tracking-[-0.01em] text-headline">
              <span className="ghost-layer" aria-hidden="true">
                Ghost in the House
              </span>
              Ghost in the House
            </h1>
            <p className="mt-3 max-w-2xl text-[clamp(1.25rem,2.2vw,1.55rem)] leading-snug text-headline">
              A quiet house. Four events nothing explains. A language model asked to explain them.
            </p>
          </div>
          <dl className="grid grid-cols-[4.9rem_minmax(0,1fr)] border border-line/45 font-mono text-[0.78rem] leading-snug">
            {titleBlock.map(([k, v]) => (
              <div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-line/25 last:border-b-0">
                <dt className="border-r border-line/25 px-2 py-1.5 text-line/80">{k}</dt>
                <dd className="px-2 py-1.5 text-headline">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="mt-5 h-px bg-line/40" />

        <div className="layout mt-8">
          <main className="area-story">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-pica text-[2.4rem] italic leading-none text-headline">The telling</h2>
              <span className="tag">model&rsquo;s interpretation</span>
            </div>
            <p className="mt-2 max-w-xl text-[1.08rem] leading-snug text-line">
              A language model&rsquo;s reading of {PICKED.length} of the night&rsquo;s {SCORED.length} events. It was not told
              which are strange. Treat it as fiction, not a finding.
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
                    <span className="block font-mono text-[0.84rem] text-headline peer-focus-visible:underline">{title}</span>
                    <span className="mt-0.5 block text-[1.02rem] leading-snug text-line">{hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === 'recorded' ? (
              <p className="mt-3 text-[1.02rem] text-line">{describeStory(RECORDED)}</p>
            ) : (
              <div role="status" className="mt-3 text-[1.02rem] text-line">
                {probeNote}
                {unreachable && (
                  <pre className="mt-2 overflow-x-auto border-l-2 border-red bg-white/[0.04] p-3 font-mono text-[0.78rem] leading-relaxed text-headline">
                    {unreachable.commands.join('\n')}
                  </pre>
                )}
                <button
                  type="button"
                  onClick={() => setProbeRun((n) => n + 1)}
                  className="mt-2 font-mono text-[0.8rem] text-line underline underline-offset-4 hover:text-headline"
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
                <button type="button" onClick={story.stop} className="font-mono text-[0.8rem] text-line underline underline-offset-4 hover:text-headline">
                  stop
                </button>
              )}
            </div>

            {error && (
              <aside role="alert" className="mt-8 -rotate-[0.6deg] bg-slip p-5 text-[#1b1710]">
                <p className="font-mono text-[0.74rem] uppercase tracking-[0.12em] text-[#6b2d1f]">Note to the inspector</p>
                <h3 className="mt-1 font-pica text-[1.7rem] italic leading-tight">{error.title}</h3>
                <p className="mt-1.5 text-[1.05rem] leading-snug">{error.detail}</p>
                {error.commands.length > 0 && (
                  <pre className="mt-3 overflow-x-auto bg-[#1b1710] p-3 font-mono text-[0.78rem] leading-relaxed text-slip">
                    {error.commands.join('\n')}
                  </pre>
                )}
              </aside>
            )}

            <div aria-live="polite" aria-busy={streaming} className="mt-7 min-h-40">
              {story.status === 'idle' && !error && (
                <p className="max-w-md text-[1.2rem] leading-snug text-line">
                  Press the stamp. Each time the story names a moment it becomes a link: the plan and the chart show the
                  house as the sensors last recorded it.
                </p>
              )}
              <Story text={story.text} streaming={streaming} start={START} end={END} onJump={(ms) => setTime(atMinute(ms))} />
            </div>

            {mode === 'live' && (
              <details className="mt-4 border-t border-line/25 pt-3 text-line">
                <summary className="cursor-pointer font-mono text-[0.8rem] text-headline">the press room: model settings</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[1.02rem]">
                    Ollama address
                    <input
                      value={draft.host}
                      onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                      onBlur={commitDraft}
                      spellCheck={false}
                      className="border border-line/45 bg-ground px-2.5 py-2 font-mono text-[0.84rem] text-headline"
                    />
                  </label>
                  <label className="grid gap-1 text-[1.02rem]">
                    Model
                    <input
                      value={draft.model}
                      onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      onBlur={commitDraft}
                      spellCheck={false}
                      className="border border-line/45 bg-ground px-2.5 py-2 font-mono text-[0.84rem] text-headline"
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
                  className="mt-3 font-mono text-[0.8rem] underline underline-offset-4 hover:text-headline"
                >
                  reset to defaults
                </button>
              </details>
            )}
          </main>

          <div className="area-instrument space-y-7">
            <section aria-labelledby="start-heading">
              <h2 id="start-heading" className="font-pica text-[1.7rem] italic leading-tight text-headline">
                Start here: four events nothing explains
              </h2>
              <ol className="mt-3 grid gap-px border border-line/30 bg-line/20 sm:grid-cols-2">
                {MARKS.map((m) => (
                  <li key={m.n} className="bg-ground">
                    <button
                      type="button"
                      onClick={() => setTime(m.time)}
                      className="grid h-full w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 px-3 py-2.5 text-left hover:bg-line/[0.06]"
                    >
                      <span className="font-mono text-[0.9rem] text-red">{m.n}</span>
                      <span>
                        <span className="block font-mono text-[0.8rem] text-line">{formatClock(m.time)}</span>
                        <span className="block text-[1.08rem] leading-snug text-headline">{m.text}</span>
                        <span className="block text-[0.98rem] leading-snug text-line">{m.why}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            <figure>
              <figcaption className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[1.05rem] text-line">
                <span>
                  <span className="font-mono text-[0.8rem]">fig. 1</span>&ensp;The ground floor at{' '}
                  <span className="font-mono text-[0.95rem] text-red">{formatClock(time)}</span>
                </span>
                <span className="tag">recorded state</span>
                <span className="tag">rule-based marks</span>
              </figcaption>
              <Plan state={house} time={time} marks={MARKS} legs={LEGS} />
              <p className="mt-1 text-[0.98rem] leading-snug text-line">
                Dashed links join the marked events in time order. They show sequence, not a tracked route.
              </p>
            </figure>

            <figure>
              <figcaption className="mb-1 text-[1.05rem] text-line">
                <span className="font-mono text-[0.8rem]">fig. 2</span>&ensp;The night. Drag along it, or use the arrow keys.
              </figcaption>
              <Strip events={SCORED} history={history} selected={SELECTED} start={START} end={END} time={time} onTime={(ms) => setTime(atMinute(ms))} />
            </figure>
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

        <section aria-labelledby="guide-heading" className="mt-12 border-t-4 border-double border-line/50 pt-6">
          <h2 id="guide-heading" className="font-pica text-[1.9rem] italic leading-none text-headline">
            What is fact, what is assumption, what is the model
          </h2>
          <div className="mt-5 grid gap-8 md:grid-cols-3">
            {READING_GUIDE.map(([tag, who, text]) => (
              <div key={tag}>
                <p className="flex items-center gap-3">
                  <span className="tag">{tag}</span>
                  <span className="font-mono text-[0.8rem] text-line">{who}</span>
                </p>
                <p className="mt-2 text-[1.08rem] leading-snug text-headline">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap justify-between gap-x-8 gap-y-2 border-t border-line/25 pt-4 font-mono text-[0.78rem] text-line">
          <p>Set in IM Fell and Martian Mono. Sensor data is fictional, shaped like Home Assistant history.</p>
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
