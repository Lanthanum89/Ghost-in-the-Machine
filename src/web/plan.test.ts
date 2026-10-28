import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickTimeline } from '../core/timeline';
import type { HaEvent } from '../data/types';
import { ANCHORS, ROOMS, buildLegs, buildMarks } from './plan';

const history: HaEvent[] = JSON.parse(readFileSync('fixtures/night-01.json', 'utf8'));

describe('plan geometry', () => {
  it('has an anchor for every room and for the two exterior doors', () => {
    for (const id of [...Object.keys(ROOMS), 'back_door', 'front_door']) expect(ANCHORS[id]).toBeDefined();
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

  it('links each mark to the next in time order, as a straight line between two points', () => {
    const legs = buildLegs(marks);
    expect(legs).toHaveLength(3);
    expect(legs.map((l) => l.time)).toEqual([marks[1]!.time, marks[2]!.time, marks[3]!.time]);
    for (const [i, leg] of legs.entries()) expect(leg.points).toEqual([marks[i]!.at, marks[i + 1]!.at]);
  });

  it('describes missing motion as not recorded rather than as absence', () => {
    const text = marks.map((m) => m.why).join(' ');
    expect(text).toMatch(/no motion recorded/);
    expect(text).not.toMatch(/nobody|no one|asleep/i);
  });
});
