import type { HaEvent } from '../data/types';
import { formatClock } from './clock';
import { houseAt } from './state';
import { kindOf, type ScoredEvent } from './timeline';

/** A plain account of one event: what changed, what the record says about the moments before it, and what it cannot say. */
export interface Explanation {
  changed: string;
  before: string[];
  unknown: string;
}

const MINUTE = 60_000;
const words = (s: string) => s.replace(/_/g, ' ');
const areaOf = (entityId: string) => (entityId.split('.')[1] ?? entityId).replace(/_(motion|temperature|compressor)$/, '');

/** "53 seconds", "2 min 45 s", "12 minutes", "1 h 28 min". */
export function span(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 600) return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Derived from the history alone. The only authored text is what the record cannot tell us, by kind of sensor. */
export function explainEvent(history: HaEvent[], s: ScoredEvent): Explanation {
  const events = history
    .map((e) => ({ e, t: Date.parse(e.last_changed) }))
    .sort((a, b) => a.t - b.t);

  const next = (state: string) => events.find((x) => x.e.entity_id === s.event.entity_id && x.t > s.time && x.e.state === state);
  const closed = next('off');
  let changed = s.text;
  if (closed && s.kind === 'door') changed += `, and closed again after ${span(closed.t - s.time)}`;
  if (closed && s.kind === 'light') changed += `, and switched off again after ${span(closed.t - s.time)}`;
  if (closed && s.kind === 'motion') changed += `; the sensor cleared after ${span(closed.t - s.time)}`;

  const before: string[] = [];
  const motions = events.filter((x) => kindOf(x.e.entity_id) === 'motion' && x.e.state === 'on' && x.t < s.time);
  const lastAnywhere = motions[motions.length - 1];
  before.push(
    lastAnywhere
      ? `The last motion recorded anywhere was in the ${words(areaOf(lastAnywhere.e.entity_id))} at ${formatClock(lastAnywhere.t)}, ${span(s.time - lastAnywhere.t)} earlier.`
      : 'No motion had been recorded earlier in the night.',
  );

  if (s.kind === 'light') {
    const lastHere = [...motions].reverse().find((x) => areaOf(x.e.entity_id) === s.area);
    before.push(
      lastHere
        ? `The last motion in the ${words(s.area)} was at ${formatClock(lastHere.t)}, ${span(s.time - lastHere.t)} earlier.`
        : `No motion was recorded in the ${words(s.area)} at any point before it.`,
    );
  }

  if (s.kind === 'temperature' && s.delta !== undefined) {
    before.push(`Ten minutes earlier it read ${(Number(s.event.state) - s.delta).toFixed(1)}°.`);
  }

  const house = houseAt(history, s.time - 1);
  if (s.kind === 'temperature') before.push(`The heating was ${house.heating ? 'on' : 'off'}.`);
  if (house.phonesTotal > 0) before.push(`${house.phonesHome} of ${house.phonesTotal} tracked phones were at home.`);

  const unknown: Record<string, string> = {
    light: 'Who or what switched it on. A missing motion reading is not proof that the room was empty.',
    motion: 'What moved. A motion sensor reports movement, not who or what caused it.',
    door: 'Who or what opened it. The sensor reports open and closed, nothing about the cause.',
    temperature: `Why it ${(s.delta ?? 0) > 0 ? 'rose' : 'fell'}. There is no window or heater sensor in this record, so an open window, a draught or a faulty sensor all fit.`,
  };

  return { changed: `${changed}.`, before, unknown: unknown[s.kind] ?? 'The record does not say what caused it.' };
}
