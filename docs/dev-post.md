*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

## What I Built

Ghost in the House takes a night of smart home sensor events and turns the strangest ones into a short ghost story, told by an open-weight model running on your own machine.

The page shows the story streaming in beside the real, boring sensor timeline behind it. Every event the model was given is highlighted, with the reason it was picked. The story says the spare room light came on at 01:58, and a few centimetres to the right is the log line it came from.

The data is fictional, shaped like Home Assistant history. It plants four anomalies in an otherwise dull night: a spare room light with no one in the room, hallway movement while both phones are home, a 6 degree temperature drop in 10 minutes, and the back door opening with no movement beforehand.

## Demo

<!-- TODO: add a screen recording. The live page needs a local Ollama, so a video is the most reliable demo. -->

Live page, once Pages is enabled: https://lanthanum89.github.io/Ghost-in-the-Machine/ (needs Ollama running on your own machine, see the README).

## Code

{% embed https://github.com/Lanthanum89/Ghost-in-the-Machine %}

## How I Built It

The rule I started with: the model never sees raw logs and never decides what is spooky.

Plain TypeScript filters the night's events, scores them with a handful of explainable rules (night-time, no causal predecessor, rare entity, sudden change, every phone home), and picks about 20. Each point has a stated reason, which is what the UI shows. The model only narrates that short, pre-selected timeline, written as plain English with no scores or rule names. That keeps a 3B to 8B model from producing flat prose, because the finding has already been done for it.

- **Model:** a small open-weight instruct model through Ollama, `llama3.1:8b` by default and one setting to change. Low-ish temperature, capped length, and a system prompt fixing a dry, understated British voice.
- **Inference:** Ollama's streaming `/api/chat`, called straight from the browser. No cloud AI calls anywhere.
- **App:** TypeScript, React, Vite, Tailwind, and Vitest. It is an installable PWA, so the page opens offline once visited.
- **Home Assistant:** `src/data/ha-client.ts` is a stub for the real history API. It has never been run against a real Home Assistant, and the README and code both say so.

## Why Does Open Innovation Matter?

Sensor data shows when a house is empty and when people are asleep. That should not go to someone else's server.

An open-weight model on your own network means the data never leaves the house, the tool works with the internet off, and it keeps working if a hosted service changes or disappears. The model is a setting you can swap. And because the selection step is ordinary code, you can read why each event was chosen, which a closed API would not let you do for the narration step either.

<!-- Prize Categories: remove this section or list the partner categories you are entering. -->
