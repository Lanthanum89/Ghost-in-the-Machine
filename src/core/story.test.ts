import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findMentions } from './clock';
import { describeStory, type RecordedStory } from './story';

const START = Date.parse('2026-10-30T18:00:00Z');
const END = Date.parse('2026-10-31T07:00:00Z');

describe('describeStory', () => {
  it('credits a model only when one wrote it', () => {
    const recorded: RecordedStory = { source: 'recorded', model: 'llama3.1:8b', recordedAt: '2026-10-28T20:00:00Z', text: 'x' };
    expect(describeStory(recorded)).toBe('Recorded from llama3.1:8b on 28 October 2026.');
    expect(describeStory({ ...recorded, source: 'example' })).toMatch(/hand-written/);
    expect(describeStory({ ...recorded, model: null })).toMatch(/hand-written/);
  });
});

describe('the bundled story', () => {
  const story: RecordedStory = JSON.parse(readFileSync('fixtures/story-01.json', 'utf8'));

  it('is short and names the times the plan can follow', () => {
    expect(story.text.split(/\s+/).length).toBeLessThan(300);
    const times = findMentions(story.text, START, END).map((m) => m.text);
    expect(times).toEqual(expect.arrayContaining(['01:58', '02:47', '03:01', '03:12']));
  });

  it('does not claim anyone was asleep or that nobody was there', () => {
    expect(story.text).not.toMatch(/asleep|slept|nobody was (there|home)/i);
  });

  it('is labelled as the example it is until a model records one', () => {
    if (story.source === 'example') expect(story.model).toBeNull();
    else expect(story.model).toBeTruthy();
  });
});
