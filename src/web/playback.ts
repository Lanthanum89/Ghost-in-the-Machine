import { findMentions } from '../core/clock';

/**
 * Where the plan and chart should be as a story starts. A story played in full at once (reduced motion) never
 * streams its times in one by one, so nothing would move them on a replay. Put them at its last mention instead.
 * A streamed story starts from dusk, and its mentions then carry the chart along.
 */
export function timeAtStart(opts: {
  instant: boolean;
  text: string;
  start: number;
  end: number;
  resolve: (ms: number) => number;
}): number {
  if (!opts.instant) return opts.start;
  const last = findMentions(opts.text, opts.start, opts.end).at(-1);
  return last ? opts.resolve(last.ms) : opts.start;
}
