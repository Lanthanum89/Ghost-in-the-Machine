import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateNight } from './generate';
import { ANOMALIES } from './scenario';

describe('generateNight', () => {
  const events = generateNight();

  it('is deterministic for a given seed', () => {
    expect(generateNight()).toEqual(events);
    expect(generateNight({ seed: 7 })).not.toEqual(events);
  });

  it('is sorted by time and uses the Home Assistant history shape', () => {
    const times = events.map((x) => x.last_changed);
    expect(times).toEqual([...times].sort());
    for (const x of events) {
      expect(Object.keys(x).sort()).toEqual(['entity_id', 'friendly_name', 'last_changed', 'state']);
      expect(Number.isNaN(Date.parse(x.last_changed))).toBe(false);
    }
  });

  it('contains every planted anomaly', () => {
    for (const a of ANOMALIES) expect(events).toContainEqual(a.event);
  });

  it('keeps the house quiet between lights out and morning, bar the planted events', () => {
    const quiet = events.filter(
      (x) => x.last_changed > '2026-10-30T22:50:00Z' && x.last_changed < '2026-10-31T06:40:00Z',
    );
    const movers = quiet.filter((x) => /^(light|binary_sensor\.(?!fridge))/.test(x.entity_id));
    const ids = new Set(movers.map((x) => x.entity_id));
    expect([...ids].sort()).toEqual([
      'binary_sensor.back_door',
      'binary_sensor.bathroom_motion',
      'binary_sensor.bedroom_motion',
      'binary_sensor.hallway_motion',
      'light.bathroom',
      'light.spare_room',
    ]);
  });

  it('matches the committed fixture', () => {
    const fixture = JSON.parse(readFileSync('fixtures/night-01.json', 'utf8'));
    expect(fixture).toEqual(events);
  });
});
