/** Wall-clock times mentioned in prose ("01:58") mapped back onto the night being described. */

export interface ClockMention {
  start: number;
  end: number;
  text: string;
  /** Epoch milliseconds inside the night window. */
  ms: number;
}

const CLOCK = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const DAY = 86_400_000;

/** The first moment at or after windowStart that reads hh:mm (UTC), or undefined if it falls after windowEnd. */
export function clockToMs(hh: number, mm: number, windowStart: number, windowEnd: number): number | undefined {
  const d = new Date(windowStart);
  d.setUTCHours(hh, mm, 0, 0);
  let ms = d.getTime();
  if (ms < windowStart) ms += DAY;
  return ms <= windowEnd ? ms : undefined;
}

/** Times in the text that fall inside the night. Half-typed times such as "01:5" are not matched. */
export function findMentions(text: string, windowStart: number, windowEnd: number): ClockMention[] {
  const found: ClockMention[] = [];
  for (const m of text.matchAll(CLOCK)) {
    const ms = clockToMs(Number(m[1]), Number(m[2]), windowStart, windowEnd);
    if (ms !== undefined) found.push({ start: m.index, end: m.index + m[0].length, text: m[0], ms });
  }
  return found;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const MINUTE = 60_000;

/**
 * A time written as hh:mm names a whole minute, but the house changes in seconds. Pick the instant inside
 * that minute to show: the latest of the highest-scoring events in it, so the state includes what the
 * story is pointing at. With no event in the minute, nothing changes inside it, so its start will do.
 */
export function resolveMinute(minuteMs: number, events: Array<{ time: number; score: number }>): number {
  const start = Math.floor(minuteMs / MINUTE) * MINUTE;
  const inside = events.filter((e) => e.time >= start && e.time < start + MINUTE);
  if (inside.length === 0) return start;
  const best = Math.max(...inside.map((e) => e.score));
  return Math.max(...inside.filter((e) => e.score === best).map((e) => e.time));
}
