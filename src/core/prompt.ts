import type { ScoredEvent } from './timeline';

/** The model only narrates a short, pre-selected timeline. It never sees raw logs, scores or rule names. */

export const MAX_WORDS = 300;

export const SYSTEM_PROMPT = `You write short ghost stories about a house, in the voice of a dry, slightly understated British narrator. Think M. R. James retold by someone who has just put the kettle on.

Rules:
- You will be given a timeline of what the house's sensors recorded overnight. The people who live there, Alex and Sam, were asleep.
- Use only the events in the timeline. Do not invent extra events, rooms, objects or times. You may invent atmosphere, but not facts.
- Mention the times. Keep the events in order.
- Events that have no ordinary explanation are the haunting. Ordinary events (a bathroom trip, the heating) are cover for it, so treat them lightly.
- Stay understated. No exclamation marks, no gore, no shouting. Let the facts do the frightening.
- Write in the past tense, in plain prose, with no headings, bullet points or title.
- Keep it under ${MAX_WORDS} words. End on a quiet, unsettling line.`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** "01:58 Spare room light turned on", one per line. Times are shown in UTC offset by utcOffsetMinutes. */
export function formatTimeline(events: ScoredEvent[], utcOffsetMinutes = 0): string {
  return events
    .map((s) => {
      const d = new Date(s.time + utcOffsetMinutes * 60_000);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm} ${s.text}`;
    })
    .join('\n');
}

export function buildMessages(events: ScoredEvent[], utcOffsetMinutes = 0): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Here is what the house recorded overnight:\n\n${formatTimeline(events, utcOffsetMinutes)}\n\nTell the story.`,
    },
  ];
}
