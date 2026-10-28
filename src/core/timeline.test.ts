import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANOMALIES } from '../data/scenario';
import { FRIENDLY_NAMES, makeEvent, type HaEvent } from '../data/types';
import { areaOf, filterEvents, kindOf, pickTimeline, scoreEvents } from './timeline';

const ev = makeEvent;
const phonesHome = [ev('device_tracker.alex_phone', 'home', '18:00'), ev('device_tracker.sam_phone', 'home', '18:01')];
const rules = (events: HaEvent[], target: HaEvent) =>
  scoreEvents(events)
    .find((s) => s.event === target)
    ?.reasons.map((r) => r.rule) ?? [];

describe('kindOf and areaOf', () => {
  it('classifies entities by id', () => {
    expect(kindOf('binary_sensor.hallway_motion')).toBe('motion');
    expect(kindOf('binary_sensor.back_door')).toBe('door');
    expect(kindOf('light.kitchen')).toBe('light');
    expect(kindOf('sensor.spare_room_temperature')).toBe('temperature');
    expect(kindOf('device_tracker.alex_phone')).toBe('presence');
    expect(areaOf('binary_sensor.spare_room_motion')).toBe('spare_room');
    expect(areaOf('light.spare_room')).toBe('spare_room');
  });

  it('knows every fixture entity', () => {
    for (const id of Object.keys(FRIENDLY_NAMES)) expect(kindOf(id)).not.toBe('other');
  });
});

describe('filterEvents', () => {
  it('drops unavailable states, repeats, motion clearing and doors closing', () => {
    const kept = filterEvents([
      ev('binary_sensor.hallway_motion', 'on', '02:00'),
      ev('binary_sensor.hallway_motion', 'off', '02:01'),
      ev('binary_sensor.back_door', 'on', '02:05'),
      ev('binary_sensor.back_door', 'off', '02:06'),
      ev('light.kitchen', 'on', '02:10'),
      ev('light.kitchen', 'on', '02:11'),
      ev('sensor.fridge_temperature', 'unavailable', '02:12'),
    ]);
    expect(kept.map((k) => `${k.entity_id}:${k.state}`)).toEqual([
      'binary_sensor.hallway_motion:on',
      'binary_sensor.back_door:on',
      'light.kitchen:on',
    ]);
  });
});

describe('scoring rules', () => {
  it('adds night points only between 23:00 and 05:59', () => {
    const evening = ev('light.kitchen', 'on', '21:30');
    const late = ev('light.kitchen', 'off', '23:30');
    const early = ev('light.kitchen', 'on', '05:30');
    const morning = ev('light.kitchen', 'off', '06:30');
    const all = [evening, late, early, morning];
    expect(rules(all, late)).toContain('night');
    expect(rules(all, early)).toContain('night');
    expect(rules(all, evening)).not.toContain('night');
    expect(rules(all, morning)).not.toContain('night');
  });

  it('flags a door opening with no recent movement or arrival', () => {
    const door = ev('binary_sensor.back_door', 'on', '03:12');
    expect(rules([...phonesHome, door], door)).toContain('unexplained');
  });

  it('does not flag a door preceded by movement or an arrival', () => {
    const door = ev('binary_sensor.back_door', 'on', '03:12');
    const moved = ev('binary_sensor.kitchen_motion', 'on', '03:05');
    expect(rules([...phonesHome, moved, door], door)).not.toContain('unexplained');

    const arrival = ev('device_tracker.alex_phone', 'home', '19:00');
    const front = ev('binary_sensor.front_door', 'on', '19:01');
    expect(rules([arrival, front], front)).not.toContain('unexplained');
  });

  it('treats movement older than the causal window as no cause', () => {
    const door = ev('binary_sensor.back_door', 'on', '03:12');
    const stale = ev('binary_sensor.kitchen_motion', 'on', '02:45');
    expect(rules([...phonesHome, stale, door], door)).toContain('unexplained');
  });

  it('needs movement in the same room to explain a light', () => {
    const light = ev('light.spare_room', 'on', '01:58');
    const elsewhere = ev('binary_sensor.hallway_motion', 'on', '01:57');
    const sameRoom = ev('binary_sensor.spare_room_motion', 'on', '01:57');
    expect(rules([elsewhere, light], light)).toContain('unexplained');
    expect(rules([sameRoom, light], light)).not.toContain('unexplained');
  });

  it('expects night-time motion in the bedroom, and ignores daytime motion', () => {
    const bedroom = ev('binary_sensor.bedroom_motion', 'on', '01:12');
    const hallway = ev('binary_sensor.hallway_motion', 'on', '02:47');
    const daytime = ev('binary_sensor.living_room_motion', 'on', '14:00');
    const all = [...phonesHome, bedroom, hallway, daytime];
    expect(rules(all, bedroom)).not.toContain('unexplained');
    expect(rules(all, hallway)).toContain('unexplained');
    expect(rules(all, daytime)).not.toContain('unexplained');
  });

  it('adds phones-at-home points only when every phone is home at night', () => {
    const hallway = ev('binary_sensor.hallway_motion', 'on', '02:47');
    expect(rules([...phonesHome, hallway], hallway)).toContain('phones');

    const away = [...phonesHome, ev('device_tracker.sam_phone', 'not_home', '22:00')];
    expect(rules([...away, hallway], hallway)).not.toContain('phones');
    expect(rules([hallway], hallway)).not.toContain('phones');
  });

  it('marks rarely changing entities as rare and chatty ones as routine', () => {
    const door = ev('binary_sensor.back_door', 'on', '03:12');
    expect(rules([door], door)).toContain('rare');

    const readings = Array.from({ length: 10 }, (_, i) => ev('sensor.fridge_temperature', `4.${i}`, `0${i}:00`));
    const scored = scoreEvents(readings);
    expect(scored.every((s) => s.reasons.some((r) => r.rule === 'routine'))).toBe(true);
  });

  it('flags a sudden temperature plunge but not a slow drift', () => {
    const plunge = [
      ev('sensor.spare_room_temperature', '19.2', '02:51'),
      ev('sensor.spare_room_temperature', '13.0', '03:01:30'),
    ];
    const hit = scoreEvents(plunge).find((s) => s.event === plunge[1]);
    expect(hit?.reasons.map((r) => r.rule)).toContain('delta');
    expect(hit?.delta).toBeCloseTo(-6.2);
    expect(hit?.text).toBe('Spare room temperature fell from 19.2 to 13.0 degrees in 10 minutes');

    const drift = [
      ev('sensor.spare_room_temperature', '19.2', '02:00'),
      ev('sensor.spare_room_temperature', '19.0', '02:30'),
      ev('sensor.spare_room_temperature', '18.8', '03:00'),
    ];
    expect(scoreEvents(drift).flatMap((s) => s.reasons.map((r) => r.rule))).not.toContain('delta');
  });

  it('shows a reason with points for every rule that fired', () => {
    const door = ev('binary_sensor.back_door', 'on', '03:12');
    const scored = scoreEvents([...phonesHome, door]).find((s) => s.event === door)!;
    expect(scored.score).toBe(scored.reasons.reduce((n, r) => n + r.points, 0));
    expect(scored.reasons.every((r) => r.text.length > 0)).toBe(true);
  });
});

describe('pickTimeline', () => {
  it('collapses a plunge to one event and returns time order', () => {
    const readings = [
      ['02:30', '19.3'], ['02:51:00', '19.2'], ['02:54:00', '17.9'], ['02:57:00', '16.2'], ['03:00:00', '14.5'], ['03:01:30', '13.0'],
    ].map(([t, v]) => ev('sensor.spare_room_temperature', v!, t!));
    const picked = pickTimeline(readings);
    const deltas = picked.filter((p) => p.delta !== undefined);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.event.state).toBe('13.0');
  });

  it('respects the limit and drops zero-score events', () => {
    const lights = Array.from({ length: 30 }, (_, i) => ev('light.kitchen', i % 2 ? 'off' : 'on', `19:${String(i).padStart(2, '0')}`));
    expect(pickTimeline(lights, 5).length).toBeLessThanOrEqual(5);
    expect(pickTimeline(lights).every((p) => p.score > 0)).toBe(true);
  });

  describe('on the committed fixture', () => {
    const history: HaEvent[] = JSON.parse(readFileSync('fixtures/night-01.json', 'utf8'));
    const picked = pickTimeline(history);

    it('selects about 20 events in chronological order', () => {
      expect(picked.length).toBeGreaterThanOrEqual(12);
      expect(picked.length).toBeLessThanOrEqual(20);
      const times = picked.map((p) => p.time);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('includes every planted anomaly and scores each above anything ordinary', () => {
      const anomalyKeys = new Set(ANOMALIES.map((a) => `${a.event.entity_id}@${a.event.last_changed}`));
      const isAnomaly = (p: (typeof picked)[number]) => anomalyKeys.has(`${p.event.entity_id}@${p.event.last_changed}`);
      expect(picked.filter(isAnomaly)).toHaveLength(ANOMALIES.length);
      const weakestAnomaly = Math.min(...picked.filter(isAnomaly).map((p) => p.score));
      const strongestOrdinary = Math.max(...picked.filter((p) => !isAnomaly(p)).map((p) => p.score));
      expect(weakestAnomaly).toBeGreaterThan(strongestOrdinary);
    });

    it('does not select the fridge or routine heating', () => {
      expect(picked.some((p) => p.kind === 'appliance' || p.kind === 'climate')).toBe(false);
    });
  });
});
