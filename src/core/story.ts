/** A story saved alongside the fixture night, so the page has something to show without a model running. */
export interface RecordedStory {
  /** "recorded" means a model wrote it from this timeline. "example" means a person wrote it to show the page. */
  source: 'recorded' | 'example';
  model: string | null;
  recordedAt: string | null;
  text: string;
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** One honest line saying where the story came from. */
export function describeStory(story: RecordedStory): string {
  if (story.source === 'recorded' && story.model && story.recordedAt) {
    return `Recorded from ${story.model} on ${DATE.format(new Date(story.recordedAt))}.`;
  }
  return 'A hand-written example, not model output.';
}
