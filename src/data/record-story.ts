import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMentions } from '../core/clock';
import { resolveConfig, streamChat } from '../core/ollama';
import { buildMessages } from '../core/prompt';
import type { RecordedStory } from '../core/story';
import { pickTimeline } from '../core/timeline';
import { NIGHT_END, NIGHT_START, type HaEvent } from './types';

/**
 * Asks your local Ollama model to narrate the fixture night once and saves the result, so the public page can show
 * a real model-written story without anyone having to run a model. Reads OLLAMA_HOST and OLLAMA_MODEL from the environment.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const history: HaEvent[] = JSON.parse(readFileSync(resolve(root, 'fixtures/night-01.json'), 'utf8'));
const config = resolveConfig(process.env);

console.log(`Asking ${config.model} at ${config.host} for a story...`);
let text = '';
try {
  for await (const token of streamChat(buildMessages(pickTimeline(history)), config)) {
    text += token;
    process.stdout.write(token);
  }
} catch (err) {
  console.error(`\nCould not record a story: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
console.log('\n');

text = text.trim();
const mentions = findMentions(text, Date.parse(NIGHT_START), Date.parse(NIGHT_END));
if (mentions.length === 0) {
  console.error('The story names no times like 01:58, so the plan could not follow it. Not saved. Run it again.');
  process.exit(1);
}

const story: RecordedStory = { source: 'recorded', model: config.model, recordedAt: new Date().toISOString(), text };
writeFileSync(resolve(root, 'fixtures/story-01.json'), JSON.stringify(story, null, 2) + '\n');
console.log(`Saved fixtures/story-01.json (${mentions.length} times named). Read it, and run again if you do not like it.`);
