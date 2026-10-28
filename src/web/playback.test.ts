import { describe, expect, it } from 'vitest';
import { timeAtStart } from './playback';

const start = Date.parse('2026-10-30T18:00:00Z');
const end = Date.parse('2026-10-31T07:00:00Z');
const resolve = (ms: number) => ms + 5_000;
const text = 'At 01:58 the light came on. At 03:12 the back door opened.';

describe('timeAtStart', () => {
  it('starts a streamed story at dusk, letting its mentions carry the chart', () => {
    expect(timeAtStart({ instant: false, text, start, end, resolve })).toBe(start);
  });

  it('puts an instantly shown story at its last mention, on every replay', () => {
    const expected = resolve(Date.parse('2026-10-31T03:12:00Z'));
    expect(timeAtStart({ instant: true, text, start, end, resolve })).toBe(expected);
    expect(timeAtStart({ instant: true, text, start, end, resolve })).toBe(expected);
  });

  it('falls back to dusk when the text names no times', () => {
    expect(timeAtStart({ instant: true, text: 'Nothing was recorded.', start, end, resolve })).toBe(start);
  });
});
