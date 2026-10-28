import type { HaEvent } from '../data/types';

/**
 * Deterministic event selection. Every point comes from a plain rule with a stated reason,
 * so the UI can show why an event was picked. The model never sees this scoring.
 */

export type Kind = 'motion' | 'door' | 'light' | 'temperature' | 'climate' | 'appliance' | 'presence' | 'other';

export interface Reason {
  rule: 'night' | 'unexplained' | 'asleep' | 'rare' | 'delta' | 'routine';
  points: number;
  text: string;
}

export interface ScoredEvent {
  event: HaEvent;
  kind: Kind;
  area: string;
  /** Epoch milliseconds of last_changed. */
  time: number;
  score: number;
  reasons: Reason[];
  /** Plain-English summary of the change, for the prompt and the timeline panel. */
  text: string;
  /** For sudden numeric changes: signed change over the delta window. */
  delta?: number;
}

export interface ScoreOptions {
  /** Hours (0-23) counted as night, after applying utcOffsetMinutes. Default 23:00 to 05:59. */
  nightStartHour: number;
  nightEndHour: number;
  /** Local offset from UTC in minutes. The fixture is in GMT, so the default is 0. */
  utcOffsetMinutes: number;
  /** How far back to look for something that could have caused an event. */
  causalWindowMs: number;
  /** A numeric change at least this big against the value one window ago counts as sudden. */
  deltaThreshold: number;
  deltaWindowMs: number;
  /** Areas where night-time motion is expected, because people sleep there. */
  sleepingAreas: string[];
  /** Entities with this many events or fewer in the night count as rare. */
  rareMax: number;
  /** Entities with this many events or more count as routine chatter. */
  routineMin: number;
}

export const DEFAULT_OPTIONS: ScoreOptions = {
  nightStartHour: 23,
  nightEndHour: 6,
  utcOffsetMinutes: 0,
  causalWindowMs: 10 * 60_000,
  deltaThreshold: 3,
  deltaWindowMs: 10 * 60_000,
  sleepingAreas: ['bedroom'],
  rareMax: 2,
  routineMin: 8,
};

/** A score at or above this is shown as an unexplained event, not just a night-time one. */
export const NOTABLE_SCORE = 5;

export const POINTS = { night: 1, unexplained: 3, asleep: 2, rare: 2, delta: 5, routine: -1 } as const;

export function kindOf(entityId: string): Kind {
  if (entityId.startsWith('device_tracker.')) return 'presence';
  if (entityId.startsWith('light.')) return 'light';
  if (entityId.startsWith('climate.')) return 'climate';
  if (entityId.endsWith('_motion')) return 'motion';
  if (entityId.endsWith('_compressor')) return 'appliance';
  if (entityId.endsWith('_door')) return 'door';
  if (entityId.endsWith('_temperature')) return 'temperature';
  return 'other';
}

export function areaOf(entityId: string): string {
  const name = entityId.split('.')[1] ?? entityId;
  return name.replace(/_(motion|temperature|compressor)$/, '');
}

const words = (s: string) => s.replace(/_/g, ' ');

/** Drops noise: unavailable states, motion clearing, doors closing, and repeats of the same state. */
export function filterEvents(events: HaEvent[]): HaEvent[] {
  const last = new Map<string, string>();
  const kept: HaEvent[] = [];
  for (const ev of events) {
    if (ev.state === 'unavailable' || ev.state === 'unknown') continue;
    const prev = last.get(ev.entity_id);
    last.set(ev.entity_id, ev.state);
    if (prev === ev.state) continue;
    const kind = kindOf(ev.entity_id);
    if ((kind === 'motion' || kind === 'door') && ev.state === 'off') continue;
    kept.push(ev);
  }
  return kept;
}

export function describe(ev: HaEvent): string {
  const name = ev.friendly_name;
  switch (kindOf(ev.entity_id)) {
    case 'motion':
      return `${name} detected movement`;
    case 'door':
      return `${name} opened`;
    case 'light':
      return `${name} turned ${ev.state}`;
    case 'presence':
      return ev.state === 'home' ? `${name} arrived home` : `${name} left the house`;
    case 'temperature':
      return `${name} read ${ev.state} degrees`;
    case 'climate':
      return ev.state === 'heat' ? 'The heating came on' : 'The heating switched off';
    case 'appliance':
      return `${name} ${ev.state === 'on' ? 'started running' : 'stopped running'}`;
    default:
      return `${name} changed to ${words(ev.state)}`;
  }
}

function isNight(ms: number, o: ScoreOptions): boolean {
  const h = new Date(ms + o.utcOffsetMinutes * 60_000).getUTCHours();
  return o.nightStartHour > o.nightEndHour ? h >= o.nightStartHour || h < o.nightEndHour : h >= o.nightStartHour && h < o.nightEndHour;
}

const isActivation = (ev: HaEvent, kind: Kind) =>
  (kind === 'motion' || kind === 'door' || kind === 'light') && (ev.state === 'on' || kind === 'door');

/**
 * Scores every event that survives filtering. Pass the full, unfiltered history so rarity,
 * phone presence and causal predecessors are judged against everything that happened.
 */
export function scoreEvents(history: HaEvent[], options: Partial<ScoreOptions> = {}): ScoredEvent[] {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const sorted = [...history].sort((a, b) => Date.parse(a.last_changed) - Date.parse(b.last_changed));
  const times = sorted.map((e) => Date.parse(e.last_changed));

  const counts = new Map<string, number>();
  for (const ev of sorted) counts.set(ev.entity_id, (counts.get(ev.entity_id) ?? 0) + 1);

  const trackers = [...new Set(sorted.filter((e) => kindOf(e.entity_id) === 'presence').map((e) => e.entity_id))];
  const allHomeAt = (index: number) => {
    if (trackers.length === 0) return false;
    const latest = new Map<string, string>();
    for (let i = 0; i <= index; i++) {
      const ev = sorted[i]!;
      if (kindOf(ev.entity_id) === 'presence') latest.set(ev.entity_id, ev.state);
    }
    return trackers.every((t) => latest.get(t) === 'home');
  };

  /** Was there recent movement (or an arrival) that could explain this activation? */
  const hasPredecessor = (index: number, kind: Kind, area: string) => {
    const t = times[index]!;
    for (let i = index - 1; i >= 0 && t - times[i]! <= o.causalWindowMs; i--) {
      const prev = sorted[i]!;
      const prevKind = kindOf(prev.entity_id);
      if (prevKind === 'presence' && prev.state === 'home' && kind !== 'light') return true;
      if (prevKind === 'motion' && prev.state === 'on') {
        if (kind === 'light' && areaOf(prev.entity_id) !== area) continue;
        return true;
      }
    }
    return false;
  };

  const valueAtOrBefore = (entity: string, ms: number): number | undefined => {
    let value: number | undefined;
    for (let i = 0; i < sorted.length && times[i]! <= ms; i++) {
      if (sorted[i]!.entity_id === entity) {
        const n = Number(sorted[i]!.state);
        if (!Number.isNaN(n)) value = n;
      }
    }
    return value;
  };

  const surviving = new Set(filterEvents(sorted));
  const scored: ScoredEvent[] = [];

  sorted.forEach((ev, index) => {
    if (!surviving.has(ev)) return;
    const kind = kindOf(ev.entity_id);
    const area = areaOf(ev.entity_id);
    const time = times[index]!;
    const night = isNight(time, o);
    const reasons: Reason[] = [];
    const add = (rule: Reason['rule'], text: string) => reasons.push({ rule, points: POINTS[rule], text });

    if (night) add('night', 'happened at night');

    if (isActivation(ev, kind)) {
      // Daytime motion needs no cause, so only night-time motion can be unexplained.
      const exempt = kind === 'motion' && (!night || o.sleepingAreas.includes(area));
      if (!exempt && !hasPredecessor(index, kind, area)) {
        add('unexplained', kind === 'light' ? `no movement in the ${words(area)} beforehand` : 'no movement anywhere in the house beforehand');
      }
      if (night && allHomeAt(index)) add('asleep', 'every phone was home and the house was asleep');
    }

    const count = counts.get(ev.entity_id) ?? 0;
    if (count <= o.rareMax) add('rare', `${ev.friendly_name} only changed ${count === 1 ? 'once' : `${count} times`} all night`);
    else if (count >= o.routineMin) add('routine', `${ev.friendly_name} changes constantly`);

    let text = describe(ev);
    let delta: number | undefined;
    if (kind === 'temperature') {
      const now = Number(ev.state);
      const before = valueAtOrBefore(ev.entity_id, time - o.deltaWindowMs);
      if (before !== undefined && Math.abs(now - before) >= o.deltaThreshold) {
        delta = now - before;
        const verb = delta < 0 ? 'fell' : 'rose';
        const mins = o.deltaWindowMs / 60_000;
        add('delta', `${verb} ${Math.abs(delta).toFixed(1)} degrees in ${mins} minutes`);
        text = `${ev.friendly_name} ${verb} from ${before.toFixed(1)} to ${now.toFixed(1)} degrees in ${mins} minutes`;
      }
    }

    scored.push({ event: ev, kind, area, time, score: reasons.reduce((sum, r) => sum + r.points, 0), reasons, text, delta });
  });

  return scored;
}

/** Keeps the strongest sudden change per entity within a cluster, so one plunge becomes one event. */
function collapseDeltas(scored: ScoredEvent[], gapMs: number): ScoredEvent[] {
  const drop = new Set<ScoredEvent>();
  const byEntity = new Map<string, ScoredEvent[]>();
  for (const s of scored) {
    if (s.delta === undefined) continue;
    byEntity.set(s.event.entity_id, [...(byEntity.get(s.event.entity_id) ?? []), s]);
  }
  for (const list of byEntity.values()) {
    let cluster: ScoredEvent[] = [];
    const flush = () => {
      if (cluster.length > 1) {
        const best = cluster.reduce((a, b) => (Math.abs(b.delta!) > Math.abs(a.delta!) ? b : a));
        for (const s of cluster) if (s !== best) drop.add(s);
      }
      cluster = [];
    };
    for (const s of list) {
      if (cluster.length && s.time - cluster[cluster.length - 1]!.time > gapMs) flush();
      cluster.push(s);
    }
    flush();
  }
  return scored.filter((s) => !drop.has(s));
}

/** Filters, scores and picks the top events by score (ties go to the later event), returned in time order. */
export function pickTimeline(history: HaEvent[], limit = 20, options: Partial<ScoreOptions> = {}): ScoredEvent[] {
  return collapseDeltas(scoreEvents(history, options), 15 * 60_000)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.time - a.time)
    .slice(0, limit)
    .sort((a, b) => a.time - b.time);
}
