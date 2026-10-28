import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickTimeline } from '../core/timeline';
import type { HaEvent } from '../data/types';
import { ANCHORS, DOORWAYS, ROOMS, buildLegs, buildMarks, route } from './plan';

const history: HaEvent[] = JSON.parse(readFileSync('fixtures/night-01.json', 'utf8'));

describe('plan geometry', () => {
  it('has an anchor and a doorway for every room that opens onto the hallway', () => {
    for (const id of Object.keys(ROOMS)) expect(ANCHORS[id]).toBeDefined();
    for (const id of ['living_room', 'kitchen', 'bedroom', 'bathroom', 'spare_room']) expect(DOORWAYS[id]).toBeDefined();
  });

  it('keeps every anchor inside its room', () => {
    for (const [id, room] of Object.entries(ROOMS)) {
      const [x, y] = ANCHORS[id]!;
      expect(x).toBeGreaterThan(room.x);
      expect(x).toBeLessThan(room.x + room.w);
      expect(y).toBeGreaterThan(room.y);
      expect(y).toBeLessThan(room.y + room.h);
    }
  });

  it('routes between rooms through the hallway', () => {
    const r = route('spare_room', 'hallway');
    expect(r[0]).toEqual(ANCHORS.spare_room);
    expect(r).toContainEqual(DOORWAYS.spare_room);
    expect(route('spare_room', 'back_door')).toContainEqual(DOORWAYS.kitchen);
  });
});

describe('marks and legs on the fixture night', () => {
  const marks = buildMarks(pickTimeline(history));

  it('numbers the four unexplained events in time order', () => {
    expect(marks.map((m) => [m.n, m.area])).toEqual([
      [1, 'spare_room'],
      [2, 'hallway'],
      [3, 'spare_room'],
      [4, 'back_door'],
    ]);
    expect(marks.map((m) => m.time)).toEqual([...marks.map((m) => m.time)].sort((a, b) => a - b));
  });

  it('does not stack two marks in the same room', () => {
    expect(marks[0]!.at).not.toEqual(marks[2]!.at);
  });

  it('draws a leg whenever the haunting changes room', () => {
    const legs = buildLegs(marks);
    expect(legs).toHaveLength(3);
    expect(legs.map((l) => l.time)).toEqual([marks[1]!.time, marks[2]!.time, marks[3]!.time]);
  });
});
