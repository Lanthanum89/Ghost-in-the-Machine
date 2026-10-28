import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { formatClock } from '../core/clock';
import { NOTABLE_SCORE, type ScoredEvent } from '../core/timeline';
import type { HaEvent } from '../data/types';

interface Props {
  events: ScoredEvent[];
  history: HaEvent[];
  selected: Set<ScoredEvent>;
  start: number;
  end: number;
  time: number;
  onTime: (ms: number) => void;
}

const W = 640;
const H = 222;
const X0 = 66;
const X1 = 628;
const ROWS = { door: 34, motion: 62, light: 90 } as const;
const T_TOP = 122;
const T_BOT = 178;
const AXIS = 198;
const MIN = 60_000;
const HOUR = 60 * MIN;
const T_RANGE: [number, number] = [12, 21];

export function Strip({ events, history, selected, start, end, time, onTime }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const x = (ms: number) => X0 + ((ms - start) / (end - start)) * (X1 - X0);
  const yTemp = (v: number) => T_BOT - ((v - T_RANGE[0]) / (T_RANGE[1] - T_RANGE[0])) * (T_BOT - T_TOP);

  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const frac = Math.min(1, Math.max(0, (vx - X0) / (X1 - X0)));
    onTime(Math.round((start + frac * (end - start)) / MIN) * MIN);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 10 * MIN : MIN;
    const keys: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: HOUR, PageDown: -HOUR };
    if (e.key in keys) onTime(Math.min(end, Math.max(start, time + keys[e.key]!)));
    else if (e.key === 'Home') onTime(start);
    else if (e.key === 'End') onTime(end);
    else return;
    e.preventDefault();
  };

  const spare = history
    .filter((h) => h.entity_id === 'sensor.spare_room_temperature')
    .map((h) => [Date.parse(h.last_changed), Number(h.state)] as const)
    .filter(([, v]) => !Number.isNaN(v));
  const trace = spare.map(([t, v]) => `${x(t).toFixed(1)} ${yTemp(v).toFixed(1)}`);
  const line = trace.length ? `M${trace.join(' L')}` : '';

  // The steepest ten-minute fall in the trace is drawn in red.
  let plungeFrom = -1;
  let plungeTo = -1;
  let worst = -3;
  spare.forEach(([t, v], i) => {
    const j = spare.findIndex(([t2]) => t2 >= t - 12 * MIN);
    if (j >= 0 && j < i && v - spare[j]![1] < worst) {
      worst = v - spare[j]![1];
      plungeFrom = j;
      plungeTo = i;
    }
  });
  const plunge = plungeFrom >= 0 ? `M${trace.slice(plungeFrom, plungeTo + 1).join(' L')}` : '';

  const nightStart = new Date(start);
  nightStart.setUTCHours(23, 0, 0, 0);
  const nightEnd = nightStart.getTime() + 7 * HOUR;
  const hours: number[] = [];
  for (let t = Math.ceil(start / HOUR) * HOUR; t <= end; t += HOUR) hours.push(t);

  const cx = x(time);
  const label = formatClock(time);

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      role="slider"
      tabIndex={0}
      aria-label="Time of night. Use the arrow keys to move through the night."
      aria-orientation="horizontal"
      aria-valuemin={start}
      aria-valuemax={end}
      aria-valuenow={time}
      aria-valuetext={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromPointer(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && setFromPointer(e)}
      onKeyDown={onKey}
      className="block h-auto w-full cursor-col-resize touch-none"
    >
      <defs>
        <pattern id="night" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-line)" strokeOpacity="0.09" strokeWidth="2" />
        </pattern>
      </defs>

      <rect x={x(nightStart.getTime())} y="18" width={x(nightEnd) - x(nightStart.getTime())} height={AXIS - 18} fill="url(#night)" />
      <text x={x(nightStart.getTime()) + 6} y="29" className="fill-muted font-mono" fontSize="10">
        night
      </text>

      {/* Row rails and labels */}
      <g className="font-mono" fontSize="10.5">
        {(
          [
            ['doors', ROWS.door],
            ['movement', ROWS.motion],
            ['lights', ROWS.light],
          ] as const
        ).map(([name, y]) => (
          <g key={name}>
            <text x="0" y={y + 4} className="fill-muted">
              {name}
            </text>
            <line x1={X0} x2={X1} y1={y} y2={y} className="stroke-line/20" strokeWidth="1" />
          </g>
        ))}
        <text x="0" y={T_TOP - 8} className="fill-muted">
          spare room, °C
        </text>
      </g>

      {/* Events */}
      <g>
        {events.map((s) => {
          const row = s.kind === 'door' ? ROWS.door : s.kind === 'motion' ? ROWS.motion : s.kind === 'light' ? ROWS.light : undefined;
          if (row === undefined) return null;
          const px = x(s.time);
          const notable = s.score >= NOTABLE_SCORE;
          const picked = selected.has(s);
          const key = `${s.event.entity_id}-${s.event.last_changed}`;
          if (notable) {
            return (
              <g key={key}>
                <line x1={px} x2={px} y1={row - 12} y2={row + 12} className="stroke-red" strokeWidth="2.2" />
                <text x={px} y={row - 16} textAnchor="middle" fontSize="10" className="fill-red font-mono" fontWeight="500">
                  {s.score}
                </text>
              </g>
            );
          }
          return (
            <line
              key={key}
              x1={px}
              x2={px}
              y1={row - (picked ? 9 : 5)}
              y2={row + (picked ? 9 : 5)}
              className={picked ? 'stroke-line' : 'stroke-line/45'}
              strokeWidth={picked ? 1.6 : 1}
            />
          );
        })}
      </g>

      {/* Spare room temperature */}
      <g className="font-mono" fontSize="10">
        {[14, 17, 20].map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={yTemp(v)} y2={yTemp(v)} className="stroke-line/12" strokeDasharray="2 5" />
            <text x={X0 - 6} y={yTemp(v) + 3.5} textAnchor="end" className="fill-muted">
              {v}
            </text>
          </g>
        ))}
      </g>
      <path d={line} className="fill-none stroke-line" strokeWidth="1.6" strokeLinejoin="round" />
      {plunge && <path d={plunge} className="fill-none stroke-red" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />}

      {/* Hour axis */}
      <g className="font-mono" fontSize="10">
        <line x1={X0} x2={X1} y1={AXIS} y2={AXIS} className="stroke-line/50" />
        {hours.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={AXIS} y2={AXIS + 5} className="stroke-line/50" />
            <text x={x(t)} y={AXIS + 18} textAnchor="middle" className="fill-muted">
              {String(new Date(t).getUTCHours()).padStart(2, '0')}
            </text>
          </g>
        ))}
      </g>

      {/* Scrub line */}
      <g>
        <line x1={cx} x2={cx} y1="15" y2={AXIS} className="stroke-red" strokeWidth="1.4" />
        <rect x={cx - 22} y="0" width="44" height="15" className="fill-red" />
        <text x={cx} y="11" textAnchor="middle" fontSize="10.5" fontWeight="500" className="fill-ground font-mono">
          {label}
        </text>
      </g>
    </svg>
  );
}
