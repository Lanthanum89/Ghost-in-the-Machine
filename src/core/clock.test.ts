import { describe, expect, it } from 'vitest';
import { clockToMs, findMentions, formatClock, resolveMinute } from './clock';

const start = Date.parse('2026-10-30T18:00:00Z');
const end = Date.parse('2026-10-31T07:00:00Z');

describe('clockToMs', () => {
  it('places evening times on the first day and small hours on the next', () => {
    expect(new Date(clockToMs(18, 3, start, end)!).toISOString()).toBe('2026-10-30T18:03:00.000Z');
    expect(new Date(clockToMs(1, 58, start, end)!).toISOString()).toBe('2026-10-31T01:58:00.000Z');
  });

  it('ignores times outside the night', () => {
    expect(clockToMs(12, 0, start, end)).toBeUndefined();
    expect(clockToMs(8, 30, start, end)).toBeUndefined();
  });
});

describe('findMentions', () => {
  it('finds whole times with their positions', () => {
    const text = 'At 01:58 the light came on. By 3:12 the door opened.';
    const found = findMentions(text, start, end);
    expect(found.map((f) => f.text)).toEqual(['01:58', '3:12']);
    expect(text.slice(found[0]!.start, found[0]!.end)).toBe('01:58');
    expect(formatClock(found[1]!.ms)).toBe('03:12');
  });

  it('does not match half-typed times while text is still streaming', () => {
    expect(findMentions('At 01:5', start, end)).toEqual([]);
    expect(findMentions('At 01:', start, end)).toEqual([]);
  });

  it('does not match numbers that are not times', () => {
    expect(findMentions('Room 101:23456 and 12:345', start, end)).toEqual([]);
    expect(findMentions('ratio 3:1', start, end)).toEqual([]);
  });
});

describe('resolveMinute', () => {
  const minute = Date.parse('2026-10-31T01:13:00Z');
  const at = (s: number) => minute + s * 1000;

  it('uses the start of the minute when nothing happened in it', () => {
    expect(resolveMinute(minute, [{ time: at(-5), score: 9 }, { time: at(61), score: 9 }])).toBe(minute);
  });

  it('picks the highest-scoring event in the minute', () => {
    expect(resolveMinute(minute, [{ time: at(5), score: 8 }, { time: at(40), score: 3 }])).toBe(at(5));
  });

  it('takes the latest event among equals, so the state includes all of them', () => {
    expect(resolveMinute(minute, [{ time: at(30), score: 3 }, { time: at(40), score: 3 }])).toBe(at(40));
  });

  it('floors a time that is not on a minute boundary', () => {
    expect(resolveMinute(at(20), [{ time: at(40), score: 3 }])).toBe(at(40));
  });
});
