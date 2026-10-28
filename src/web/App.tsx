import { useMemo, useState } from 'react';
import fixture from '../../fixtures/night-01.json';
import { resolveConfig } from '../core/ollama';
import { buildMessages } from '../core/prompt';
import { pickTimeline, scoreEvents } from '../core/timeline';
import type { HaEvent } from '../data/types';
import { friendlyError } from './errors';
import { defaultConfig, loadConfig, saveConfig } from './settings';
import { Ghost } from './Ghost';
import { Timeline } from './Timeline';
import { useStory } from './useStory';

const history = fixture as HaEvent[];

/** "Saturday 31 October 2026", taken from the night's last event so the dateline is never hand-typed. */
const DATELINE = new Date(history[history.length - 1]!.last_changed).toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const STEPS = [
  ['I', 'The sensors keep a diary', 'Doors, lights, motion and thermostats log every change, in the shape Home Assistant records them. Dull, and honest.'],
  ['II', 'Plain code picks the strange ones', 'Six explainable rules score each event: night, no cause, rare, sudden, everyone home. No model decides what is spooky.'],
  ['III', 'A local model tells it', 'An open-weight model on your machine narrates only that short timeline. It works with the internet off.'],
] as const;

const SKELETON_WIDTHS = ['100%', '94%', '98%', '71%', '100%', '88%', '96%', '54%'];

export function App() {
  const picked = useMemo(() => pickTimeline(history), []);
  // Same scored objects as `picked`, so reference equality identifies the selected rows.
  const all = useMemo(() => {
    const pickedKeys = new Set(picked.map((p) => `${p.event.entity_id}@${p.event.last_changed}`));
    const scored = scoreEvents(history);
    const selected = new Set(scored.filter((s) => pickedKeys.has(`${s.event.entity_id}@${s.event.last_changed}`)));
    return { scored, selected };
  }, [picked]);

  const [config, setConfig] = useState(loadConfig);
  // Raw text while editing. It is normalised and saved on blur, so clearing a field or typing
  // a new address does not get rewritten mid-keystroke.
  const [draft, setDraft] = useState(() => ({ host: config.host, model: config.model }));
  const [onlySelected, setOnlySelected] = useState(false);
  const [scrollSignal, setScrollSignal] = useState(0);
  const story = useStory();

  const streaming = story.status === 'streaming';
  const error = story.status === 'error' ? friendlyError(story.error, config, window.location.origin) : null;

  /** Normalises the draft, saves it if it changed, and returns the config to use. */
  const commitDraft = () => {
    const next = resolveConfig({ OLLAMA_HOST: draft.host, OLLAMA_MODEL: draft.model });
    setDraft({ host: next.host, model: next.model });
    if (next.host === config.host && next.model === config.model) return config;
    setConfig(next);
    saveConfig(next);
    return next;
  };

  const paragraphs = story.text.split(/\n{2,}/).filter((p) => p.trim());
  let press = config.host;
  try {
    press = new URL(config.host).host;
  } catch {
    /* Show the raw text while the address is being edited. */
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-5 sm:px-10">
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-[0.6875rem] uppercase tracking-[0.14em] text-muted sm:text-xs">
        <span>Late edition &middot; {DATELINE}</span>
        <span>Vol. I &middot; No. 1</span>
        <span>Printed on your own machine</span>
      </div>

      <header className="mt-3 border-b border-rule-strong pb-4 pt-4 text-center">
        <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <p className="hidden max-w-[11.5rem] justify-self-start border border-rule-strong px-3 py-2 text-xs italic leading-snug text-paper/80 lg:block">
            All the night&rsquo;s events,
            <br />
            fit to haunt
          </p>
          <h1 className="font-fraktur text-[clamp(2.6rem,9.5vw,5.9rem)] font-bold leading-none tracking-[0.005em] text-headline">
            Ghost in the House
          </h1>
          <p className="hidden max-w-[11.5rem] justify-self-end border border-rule-strong px-3 py-2 text-xs italic leading-snug text-paper/80 lg:block">
            Nothing leaves
            <br />
            your network
          </p>
        </div>
        <p className="mt-2 text-xs italic text-paper/80 lg:hidden">All the night&rsquo;s events, fit to haunt</p>
      </header>
      <div className="mt-[3px] flex items-center gap-3 text-muted">
        <span className="h-px flex-1 bg-rule-strong" />
        <Ghost size={20} />
        <span className="h-px flex-1 bg-rule-strong" />
      </div>
      <nav
        aria-label="Sections"
        className="mt-1 flex justify-center gap-5 border-b border-rule py-2.5 text-xs uppercase tracking-[0.18em] sm:gap-9"
      >
        <a href="#story" className="hover:text-ember">The story</a>
        <a href="#record" className="hover:text-ember">The record</a>
        <a href="#how" className="hover:text-ember">How it works</a>
      </nav>

      <div className="mt-9 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-12">
        <main id="story" className="min-w-0 scroll-mt-6">
          <p className="kicker text-ember">Domestic affairs &middot; Overnight</p>
          <h2 className="mt-2.5 font-display text-[clamp(2.4rem,6vw,4.25rem)] font-black leading-[1.03] tracking-tight text-balance text-headline">
            What happened last night?
          </h2>
          <p className="mt-4 max-w-2xl font-display text-[1.2rem] font-medium italic leading-snug text-pretty text-paper/85 sm:text-[1.45rem]">
            A night of sensor readings, and a correspondent who has never left the house.
          </p>
          <div className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-1 border-y border-rule py-2.5 text-[0.8125rem] text-muted">
            <span>
              By <strong className="font-semibold text-paper">the house</strong>, narrated locally by{' '}
              <span className="font-mono text-[0.78rem] text-spectre">{config.model}</span>
            </span>
            <span>
              {picked.length} of {all.scored.length} events &middot; via {press}
            </span>
          </div>

          {error && (
            <aside role="alert" className="mt-7 border border-ember p-5">
              <p className="kicker text-ember">Correction</p>
              <h3 className="mt-1 font-display text-2xl font-bold text-headline">{error.title}</h3>
              <p className="mt-1.5 text-[0.95rem] leading-relaxed text-paper/90">{error.detail}</p>
              {error.commands.length > 0 && (
                <pre className="mt-3 overflow-x-auto border-l-2 border-spectre bg-white/[0.04] p-3 font-mono text-[0.8125rem] leading-relaxed text-spectre">
                  {error.commands.join('\n')}
                </pre>
              )}
            </aside>
          )}

          <div aria-live="polite" aria-busy={streaming} className="mt-8 min-h-56">
            {story.status === 'idle' && !error && (
              <div>
                <p className="kicker text-muted">Awaiting dispatch</p>
                <p className="mt-2 max-w-xl text-[1.05rem] italic leading-relaxed text-paper/80">
                  Press the button. The model will narrate only the entries marked on the right, in a dry British voice,
                  and will not be told which of them are strange.
                </p>
                <div aria-hidden="true" className="mt-6 max-w-xl space-y-3.5 opacity-60">
                  {SKELETON_WIDTHS.map((w, i) => (
                    <div key={i} className="h-px bg-rule-strong" style={{ width: w }} />
                  ))}
                </div>
              </div>
            )}
            {(paragraphs.length > 0 || streaming) && (
              <div className={`story max-w-[38rem] text-[1.22rem] leading-[1.7] text-paper ${streaming ? '' : 'rise'}`}>
                {paragraphs.length === 0 && <p className="italic text-muted">The correspondent is composing&hellip;</p>}
                {paragraphs.map((p, i) => (
                  <p key={i}>
                    {p}
                    {streaming && i === paragraphs.length - 1 && <span className="caret" aria-hidden="true" />}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setScrollSignal((n) => n + 1);
                void story.start(buildMessages(picked), commitDraft());
              }}
              disabled={streaming}
              className="min-h-12 bg-ember px-7 font-text text-sm font-semibold uppercase tracking-[0.16em] text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              What happened last night?
            </button>
            {streaming && (
              <button
                type="button"
                onClick={story.stop}
                className="min-h-12 border border-rule-strong px-5 text-sm uppercase tracking-[0.14em] text-paper hover:border-ember hover:text-ember"
              >
                Stop
              </button>
            )}
          </div>

          <details className="mt-8 border-t border-rule pt-4 text-sm text-muted">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-paper">
              The press room: model settings
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                Ollama address
                <input
                  value={draft.host}
                  onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                  onBlur={commitDraft}
                  spellCheck={false}
                  className="border border-rule-strong bg-ink px-2.5 py-2 font-mono text-sm text-paper"
                />
              </label>
              <label className="grid gap-1">
                Model
                <input
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  onBlur={commitDraft}
                  spellCheck={false}
                  className="border border-rule-strong bg-ink px-2.5 py-2 font-mono text-sm text-paper"
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
              className="mt-3 underline underline-offset-2 hover:text-paper"
            >
              Reset to defaults
            </button>
          </details>
        </main>

        <Timeline
          events={all.scored}
          selected={all.selected}
          onlySelected={onlySelected}
          onToggleOnlySelected={setOnlySelected}
          scrollSignal={scrollSignal}
        />
      </div>

      <section id="how" aria-labelledby="how-heading" className="mt-16 scroll-mt-6 border-t-4 border-double border-rule-strong pt-6">
        <h2 id="how-heading" className="kicker text-muted">
          How a ghost story is made, in three steps
        </h2>
        <div className="mt-6 grid gap-10 md:grid-cols-3 md:gap-0">
          {STEPS.map(([numeral, title, text], i) => (
            <div key={numeral} className={i > 0 ? 'md:border-l md:border-rule md:pl-10' : 'md:pr-10'}>
              <p className="font-display text-5xl font-black leading-none text-ember">{numeral}</p>
              <h3 className="mt-3 font-display text-[1.35rem] font-bold leading-snug text-headline">{title}</h3>
              <p className="mt-1.5 leading-relaxed text-paper/80">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-14 flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-rule pt-4 text-[0.8125rem] text-muted">
        <p>Set in Playfair Display, Source Serif 4 and UnifrakturCook. The night is fictional fixture data.</p>
        <p>MIT licensed &middot; open source &middot; no cloud AI</p>
      </footer>
    </div>
  );
}
