import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { HaEvent } from '../data/types';
import { explainEvent, span } from './explain';
import { pickTimeline } from './timeline';

const night: HaEvent[] = JSON.parse(readFileSync('fixtures/night-01.json', 'utf8'));
const marked = pickTimeline(night).filter((s) => s.score >= 5);
const byEntity = (id: string) => marked.find((s) => s.event.entity_id === id)!;

describe('span', () => {
  it('uses the unit a person would say', () => {
    expect(span(53_000)).toBe('53 seconds');
    expect(span(165_000)).toBe('2 min 45 s');
    expect(span(12 * 60_000)).toBe('12 minutes');
    expect(span(88 * 60_000)).toBe('88 minutes');
    expect(span(100 * 60_000)).toBe('1 h 40 min');
  });
});

describe('explainEvent on the four marked events', () => {
  it('says what was recorded before the spare room light, and that a missing reading is not proof', () => {
    const e = explainEvent(night, byEntity('light.spare_room'));
    expect(e.changed).toMatch(/Spare room light turned on, and switched off again after 2 min 45 s/);
    expect(e.before.join(' ')).toMatch(/No motion was recorded in the spare room at any point before it/);
    expect(e.before.join(' ')).toMatch(/bedroom at 01:19/);
    expect(e.unknown).toMatch(/not proof/);
  });

  it('reports the hallway movement against the phones', () => {
    const e = explainEvent(night, byEntity('binary_sensor.hallway_motion'));
    expect(e.before.join(' ')).toMatch(/bedroom at 01:19/);
    expect(e.before.join(' ')).toMatch(/2 of 2 tracked phones were at home/);
    expect(e.unknown).toMatch(/not who or what/);
  });

  it('gives the temperature before, the heating and the open questions', () => {
    const e = explainEvent(night, byEntity('sensor.spare_room_temperature'));
    expect(e.before.join(' ')).toMatch(/19\.2°/);
    expect(e.before.join(' ')).toMatch(/heating was off/);
    expect(e.unknown).toMatch(/Why it fell/);
  });

  it('tells how long the back door stayed open and what the last motion was', () => {
    const e = explainEvent(night, byEntity('binary_sensor.back_door'));
    expect(e.changed).toMatch(/closed again after 53 seconds/);
    expect(e.before.join(' ')).toMatch(/hallway at 02:47/);
  });

  it('never claims more than the record shows', () => {
    for (const s of marked) {
      const e = explainEvent(night, s);
      expect([e.changed, ...e.before, e.unknown].join(' ')).not.toMatch(/asleep|nobody was|no one was|ghost/i);
    }
  });
});
