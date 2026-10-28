import { scenarioEvents } from './scenario';
import { makeEvent, type HaEvent } from './types';

/** Believable background noise (fridge, heating, room temperature) layered over the authored scenario. */

const START_MIN = 18 * 60;
const END_MIN = 31 * 60; // 07:00 the next day, counted from the start of the 30th

/** Small seeded PRNG (mulberry32) so the same seed always produces the same night. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minutes since the start of the 30th, to "HH:MM:SS" (wrapping past midnight). */
function clock(minutes: number): string {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

const round1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** Heating schedule in minutes since 18:00 on the 30th, with a little jitter. */
const HEATING_RUNS: Array<[start: string, end: string]> = [
  ['18:00', '19:05'],
  ['20:15', '21:10'],
  ['22:00', '22:30'],
  ['03:40', '04:05'],
  ['05:30', '06:20'],
];

function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return (h < 12 ? h + 24 : h) * 60 + m;
}

export function generateNight({ seed = 1031 }: { seed?: number } = {}): HaEvent[] {
  const rand = mulberry32(seed);
  const jitter = (spread: number) => (rand() - 0.5) * 2 * spread;
  const events: HaEvent[] = [];

  // Heating cycles.
  const runs = HEATING_RUNS.map(([s, e]) => [toMinutes(s) + jitter(6), toMinutes(e) + jitter(6)] as const);
  for (const [start, end] of runs) {
    events.push(makeEvent('climate.heating', 'heat', clock(start)));
    events.push(makeEvent('climate.heating', 'idle', clock(end)));
  }
  const heatingOn = (t: number) => runs.some(([s, e]) => t >= s && t < e);

  // Fridge compressor cycles, with a temperature reading as each run ends.
  let t = START_MIN + 6 + jitter(3);
  let fridgeTemp = 4.2;
  while (t < END_MIN) {
    const runFor = 11 + rand() * 3;
    events.push(makeEvent('binary_sensor.fridge_compressor', 'on', clock(t)));
    t += runFor;
    if (t >= END_MIN) break;
    events.push(makeEvent('binary_sensor.fridge_compressor', 'off', clock(t)));
    fridgeTemp = Math.min(4.9, Math.max(3.6, fridgeTemp + jitter(0.4)));
    events.push(makeEvent('sensor.fridge_temperature', round1(fridgeTemp), clock(t + 0.5)));
    t += 26 + rand() * 8;
  }

  // Living room temperature: a slow random walk that follows the heating.
  let living = 19.6;
  for (let m = START_MIN + 20; m < END_MIN; m += 20) {
    const next = living + (heatingOn(m) ? 0.15 : -0.08) + jitter(0.05);
    const clamped = Math.min(21.6, Math.max(17.8, next));
    if (round1(clamped) !== round1(living)) {
      events.push(makeEvent('sensor.living_room_temperature', round1(clamped), clock(m + jitter(3))));
    }
    living = clamped;
  }

  return [...scenarioEvents, ...events].sort((a, b) =>
    a.last_changed === b.last_changed ? 0 : a.last_changed < b.last_changed ? -1 : 1,
  );
}
