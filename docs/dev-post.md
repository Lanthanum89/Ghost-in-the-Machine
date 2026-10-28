*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

## What I Built

Ghost in the House takes a night of smart home sensor events, picks the strangest with plain code, and asks an open-weight model running on your own machine to explain them as a short ghost story.

The page is a surveyor's plan of a quiet house. A floor plan and a chart of the whole night sit beside the story. Every time the story names a moment ("01:58"), the plan and chart jump to it and show the house as the sensors recorded it: lamps, open doors, movement, the spare room turning cold. The raw record sits underneath, so you can check the story against the evidence line by line.

The night is fictional sample data shaped like Home Assistant history, with four events nothing explains: a spare room light with no motion recorded in the room, hallway movement while every tracked phone is home, a 6 degree drop in ten minutes, and the back door opening with no motion recorded before it.

I tried to keep three kinds of claim apart, and the page labels them: what the sensors **recorded**, what my six rules **assume**, and what the **model** interpreted. A phone being at home does not prove anyone is asleep, and no recorded motion does not prove nobody moved, so the page says "no motion recorded" and nothing stronger.

## Demo

<!-- TODO: add a screen recording of live mode with a local model. -->

Live page: https://lanthanum89.github.io/Ghost-in-the-Machine/. It opens with a recorded story that plays straight away. Live mode needs Ollama on your own machine (see the README).

## Code

{% embed https://github.com/Lanthanum89/Ghost-in-the-Machine %}

## How I Built It

The rule I started with: the model never sees raw logs and never decides what is spooky.

Plain TypeScript filters the night's events, scores them with six explainable rules (night-time, no motion recorded before it, phones at home, rarity, sudden change, routine chatter) and picks about 20. Each point has a stated reason, and the page lists the rules. The model only narrates that short, pre-selected timeline, written as plain English with no scores or rule names. Choosing those events still shapes the story, and the page says so.

- **Model:** a small open-weight instruct model through Ollama, `llama3.1:8b` by default and one setting to change. Low-ish temperature, capped length, and a system prompt fixing a dry, understated British voice that tells it to say "no motion was recorded" rather than claim nobody was there.
- **Inference:** Ollama's streaming `/api/chat`, called straight from the browser. No cloud AI calls anywhere. Live mode checks Ollama is reachable before you press anything.
- **The plan and chart:** a replay of the sensor history, computed in code. A small parser finds times like `01:58` in the story as it streams and moves the chart to the matching moment. The model decides nothing visual.
- **App:** TypeScript, React, Vite, Tailwind and Vitest, as an installable PWA. Fonts are bundled open-licensed files, so nothing loads from a CDN.
- **Home Assistant:** `src/data/ha-client.ts` is a stub for the real history API. It has never been run against a real Home Assistant, and the README and code both say so.

## Why Does Open Innovation Matter?

Sensor data shows when a house is empty and when people are likely asleep. That should not go to someone else's server.

An open-weight model on your own network means the data never leaves the house, the tool works with the internet off, and it keeps working if a hosted service changes or disappears. The model is a setting you can swap. And because the selection step is ordinary code, you can read why each event was chosen, which makes it easier to see where the story comes from and where it does not.

<!-- Prize Categories: remove this section or list the partner categories you are entering. -->
