import { useMemo, useState } from 'react';
import fixture from '../../fixtures/night-01.json';
import { resolveConfig } from '../core/ollama';
import { buildMessages } from '../core/prompt';
import { pickTimeline, scoreEvents } from '../core/timeline';
import type { HaEvent } from '../data/types';
import { friendlyError } from './errors';
import { defaultConfig, loadConfig, saveConfig } from './settings';
import { Timeline } from './Timeline';
import { useStory } from './useStory';

const history = fixture as HaEvent[];

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl tracking-tight text-text sm:text-5xl">Ghost in the House</h1>
        <p className="mt-3 text-muted">
          A night of smart home sensor events. Plain code picks the strangest few. A model running on this machine tells
          the story. Nothing leaves your network.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setScrollSignal((n) => n + 1);
              void story.start(buildMessages(picked), commitDraft());
            }}
            disabled={streaming}
            className="rounded-md bg-amber px-5 py-2.5 font-semibold text-ink hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            What happened last night?
          </button>
          {streaming && (
            <button
              type="button"
              onClick={story.stop}
              className="rounded-md border border-edge px-4 py-2.5 text-text hover:border-muted"
            >
              Stop
            </button>
          )}
        </div>
      </header>

      <main className="mt-10 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="story-heading" className="rounded-lg border border-edge bg-panel p-5">
          <h2 id="story-heading" className="font-serif text-xl text-text">
            The story
          </h2>

          {error && (
            <div role="alert" className="mt-3 rounded-md border border-danger/60 bg-danger/10 p-4">
              <p className="font-semibold text-danger">{error.title}</p>
              <p className="mt-1 text-sm text-text">{error.detail}</p>
              {error.commands.length > 0 && (
                <pre className="mt-3 overflow-x-auto rounded bg-ink p-3 font-mono text-sm text-ghost">
                  {error.commands.join('\n')}
                </pre>
              )}
            </div>
          )}

          <div aria-live="polite" aria-busy={streaming} className="mt-3 min-h-40">
            {story.status === 'idle' && !error && (
              <p className="text-muted">
                Press the button. The model will narrate only the highlighted events on the right, in a dry British
                voice, and will not be told which ones are strange.
              </p>
            )}
            {(story.text || streaming) && (
              <p className={`whitespace-pre-wrap font-serif text-lg leading-8 text-text ${streaming ? 'caret' : 'fade-in'}`}>
                {story.text}
              </p>
            )}
            {streaming && !story.text && <p className="sr-only">Waiting for the first words.</p>}
          </div>

          <details className="mt-4 text-sm text-muted">
            <summary className="cursor-pointer text-text">Model settings</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                Ollama address
                <input
                  value={draft.host}
                  onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                  onBlur={commitDraft}
                  spellCheck={false}
                  className="rounded border border-edge bg-ink px-2 py-1.5 font-mono text-text"
                />
              </label>
              <label className="grid gap-1">
                Model
                <input
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  onBlur={commitDraft}
                  spellCheck={false}
                  className="rounded border border-edge bg-ink px-2 py-1.5 font-mono text-text"
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
              className="mt-3 underline underline-offset-2 hover:text-text"
            >
              Reset to defaults
            </button>
          </details>
        </section>

        <Timeline
          events={all.scored}
          selected={all.selected}
          onlySelected={onlySelected}
          onToggleOnlySelected={setOnlySelected}
          scrollSignal={scrollSignal}
        />
      </main>

      <footer className="mt-10 text-sm text-muted">
        <p>The sensor night is fictional fixture data shaped like Home Assistant history.</p>
      </footer>
    </div>
  );
}
