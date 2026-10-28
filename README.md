# Ghost in the House

A night of smart home sensor events goes in. A short ghost story comes out, written by an open-weight model running on your own machine.

Built for the Hacktoberfest Open-Source AI Challenge, Week 4: Ghost in the Machine.

The page is a surveyor's plan of the house. The story streams in beside a floor plan and a chart of the whole night, and every time the story names a moment ("01:58") the plan and chart move to it, showing the lamps, doors, movement and temperatures as they were. The unexplained events are numbered and joined by a red route through the house, and the raw sensor record sits underneath.

## The principle

The model never sees raw logs and never decides what is spooky.

Deterministic code filters, scores and picks the strangest events, then formats them as plain English. The model only narrates a short, pre-selected timeline. Small local models write flat prose when you hand them a wall of data and ask them to find the story. They do much better when the finding has already been done.

## How it works

```
fixtures/night-01.json            (or, later, Home Assistant history)
        |
        v
  src/core/timeline.ts            filter, dedupe, score, pick ~20
        |   every point has a stated reason
        v
  src/core/prompt.ts              plain-English timeline + voice
        |   no scores, no rule names
        v
  src/core/ollama.ts  ---->  Ollama on your machine  (/api/chat, streamed)
        |
        v
  src/web/                        story streaming beside the annotated timeline
```

### Scoring rules

All rules are in `src/core/timeline.ts`, with their weights in `POINTS`. They are tested in `src/core/timeline.test.ts`.

| Rule | Points | Fires when |
| --- | --- | --- |
| Night | +1 | The event happened between 23:00 and 05:59 |
| Unexplained | +3 | A door opens, a light comes on, or (at night) movement is detected, with no movement or arrival in the previous 10 minutes. Lights need movement in the same room. Bedroom movement is expected at night |
| Asleep | +2 | The event is an activation at night while every phone is home |
| Rare | +2 | The entity changed twice or fewer all night |
| Sudden change | +5 | A number moved by 3 or more against its value 10 minutes earlier |
| Routine | -1 | The entity changed eight or more times, like a fridge or thermostat |

Events that score nothing are dropped. The rest are ranked, the top 20 are kept, and they go back into time order. On the bundled night that selects 15 events: the four planted anomalies score 8, 8, 5 and 5, and an ordinary bathroom trip at 01:13 scores 3 or less.

## Run it

You need Node 22 or later, pnpm, and [Ollama](https://ollama.com).

```bash
ollama pull llama3.1:8b
```

```bash
ollama serve
```

If Ollama is already running as a desktop app or service (the Windows and Mac installers start it for you), skip `ollama serve`. If it says the port is already in use, Ollama is already running.

```bash
pnpm install
```

```bash
pnpm dev
```

Open the address Vite prints and press **What happened last night?**

If Ollama is not running, or does not have the model, the page says so and shows the command to fix it. The timeline still works without it.

### Choosing a model

The default is `llama3.1:8b`. I could not check the Ollama library from the environment this was built in, so confirm the tag at [ollama.com/library](https://ollama.com/library) if a pull fails. Any small instruct model in the 3B to 8B range should work, and a smaller one suits modest hardware.

Change it in either place:

- Copy `.env.example` to `.env` and set `OLLAMA_MODEL`, then restart `pnpm dev`.
- Or open **Model settings** on the page. This is saved in your browser and overrides the build default.

### Environment variables

| Variable | Default | Used by |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://localhost:11434` | The browser app |
| `OLLAMA_MODEL` | `llama3.1:8b` | The browser app |
| `HA_URL` | none | The Home Assistant adapter only (Node, never bundled) |
| `HA_TOKEN` | none | The Home Assistant adapter only (Node, never bundled) |

Only `OLLAMA_*` and `VITE_*` variables are exposed to the browser. Never commit `.env`.

### Scripts

```bash
pnpm test        # Vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint
pnpm build       # typecheck, then production build into dist/
pnpm preview     # serve the build
pnpm fixture     # regenerate fixtures/night-01.json from the seeded generator
```

## Installable, and the GitHub Pages copy

The app is a PWA. A small service worker caches the page, so once it has been opened it loads with no connection. It never touches requests to Ollama.

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on pushes to `main`. In the repository settings, set Pages to deploy from **GitHub Actions**. The site would then be at `https://lanthanum89.github.io/Ghost-in-the-Machine/`.

A page served from Pages talks to **your** Ollama, in your browser, at `http://localhost:11434`. GitHub only hosts the static files. Two things have to be true for that to work:

1. Ollama must allow the page's origin. On macOS and Linux:

   ```bash
   OLLAMA_ORIGINS=https://lanthanum89.github.io ollama serve
   ```

   On Windows PowerShell, set it once and then quit and reopen Ollama from the tray:

   ```powershell
   setx OLLAMA_ORIGINS "https://lanthanum89.github.io"
   ```

2. Your browser must allow an HTTPS page to reach `http://localhost`. Chromium-based browsers generally treat localhost as trustworthy, though newer versions may ask for local network permission. Safari has historically blocked it. I have only tested this against a local mock in Chromium, not across browsers.

A phone cannot reach an Ollama running on another machine over plain HTTP from an HTTPS page. On a phone the installed app is a look at the UI, not a working setup. For a full demo, run `pnpm dev` or `pnpm build && pnpm preview` on the machine that runs Ollama.

## Does it run fully offline?

Yes for the bundled demo, once set up. After you have installed Ollama and pulled a model, the fake night, the scoring, the model and the UI all run on your machine with no internet. There are no cloud AI calls anywhere in the code.

What is **not** tested: the live Home Assistant adapter. `src/data/ha-client.ts` is a stub shaped from the Home Assistant REST API documentation. It has never been run against a real Home Assistant instance, and it is clearly marked untested in the code. Until someone tries it on a real house, treat the sensor data as fictional.

## Why open-weight and local matters here

Smart home sensor data is unusually revealing. A log of door and motion events shows when the house is empty, when everyone is asleep, which room someone goes to at 03:00, and when they usually come home. That is exactly what a burglar or a data broker wants.

Sending that to a hosted model means trusting a third party with it, forever, under terms that can change. Running an open-weight model on your own network means:

- The data never leaves the house.
- The tool works with the internet off, and keeps working if a service shuts down or changes its prices.
- You can pick, swap and inspect the model. The model name is one setting.
- The deterministic selection step is plain code you can read, so you can see why each event was chosen.

## Project layout

```
src/data/scenario.ts     hand-authored night with the planted anomalies
src/data/generate.ts     seeded background noise (fridge, heating, temperatures)
src/data/ha-client.ts    stub for the Home Assistant history API (untested)
src/core/timeline.ts     filter, dedupe, score, pick, describe
src/core/prompt.ts       system prompt and timeline formatting
src/core/ollama.ts       streaming Ollama client with typed errors
src/web/                 React page: house plan, night chart, story, raw record
src/web/fonts/           bundled fonts and their licences
fixtures/night-01.json   committed fixture, so the demo is reproducible
```

The planted anomalies, all at night while both phones are home:

- 01:58 the spare room light switches on, with no movement in the room
- 02:47 hallway movement
- 03:01 the spare room temperature has fallen 6 degrees in 10 minutes
- 03:12 the back door opens, with no movement beforehand

## Fonts

The page is set in IM Fell English and IM Fell Double Pica (the narrator and the title) and Martian Mono (the machine's voice), bundled as WOFF2 files in `src/web/fonts/`. They are SIL Open Font License 1.1 fonts, with their licence texts alongside, and were copied from the `@fontsource` packages rather than added as dependencies. Nothing is loaded from a font CDN, so the page makes no third-party requests and the service worker caches the fonts for offline use.

## Licence

MIT for the code. See [LICENSE](LICENSE). The bundled fonts keep their own licences.
