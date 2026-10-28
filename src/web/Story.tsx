import { Fragment } from 'react';
import { findMentions } from '../core/clock';

interface Props {
  text: string;
  streaming: boolean;
  start: number;
  end: number;
  onJump: (ms: number) => void;
}

/** The story as paragraphs. Every time it mentions becomes a button that moves the chart to that moment. */
export function Story({ text, streaming, start, end, onJump }: Props) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  let offset = 0;

  if (paragraphs.length === 0) {
    return streaming ? <p className="italic text-muted">The correspondent is composing&hellip;</p> : null;
  }

  return (
    <div className="story">
      {paragraphs.map((p, i) => {
        const pStart = text.indexOf(p, offset);
        offset = pStart + p.length;
        const mentions = findMentions(p, start, end);
        const parts: Array<string | { text: string; ms: number }> = [];
        let at = 0;
        for (const m of mentions) {
          parts.push(p.slice(at, m.start), { text: m.text, ms: m.ms });
          at = m.end;
        }
        parts.push(p.slice(at));
        const last = streaming && i === paragraphs.length - 1;
        return (
          <p key={i}>
            {parts.map((part, j) =>
              typeof part === 'string' ? (
                <Fragment key={j}>{part}</Fragment>
              ) : (
                <button
                  key={j}
                  type="button"
                  onClick={() => onJump(part.ms)}
                  aria-label={`Show ${part.text} on the chart`}
                  className="mention"
                >
                  {part.text}
                </button>
              ),
            )}
            {last && <span className="caret" aria-hidden="true" />}
          </p>
        );
      })}
    </div>
  );
}
