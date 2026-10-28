import { formatClock } from '../core/clock';
import type { HouseState } from '../core/state';
import { ANCHORS, HOUSE_OFFSET_X, ROOMS, VIEW, toPath, type Leg, type Mark } from './plan';

interface Props {
  state: HouseState;
  time: number;
  marks: Mark[];
  legs: Leg[];
}

const RECENT_MOTION_MS = 4 * 60_000;
const WALL = 2.5;

/** Gaps in interior walls. Drawn over the wall strokes in the ground colour. */
const DOORWAY_GAPS: Array<[x: number, y: number, w: number, h: number]> = [
  [120, 207.5, 30, 5],
  [400, 207.5, 30, 5],
  [100, 257.5, 30, 5],
  [250, 257.5, 30, 5],
  [405, 257.5, 30, 5],
];

function summarise(state: HouseState, time: number): string {
  const bits: string[] = [`Plan of the house at ${formatClock(time)}.`];
  const lit = Object.entries(state.lights).filter(([, on]) => on).map(([a]) => a.replace('_', ' '));
  bits.push(lit.length ? `Lights on: ${lit.join(', ')}.` : 'No lights on.');
  const open = Object.entries(state.doors).filter(([, o]) => o).map(([d]) => d.replace('_', ' '));
  if (open.length) bits.push(`Open: ${open.join(', ')}.`);
  // The same window as the rings drawn on the plan.
  const moving = Object.entries(state.lastMotion)
    .filter(([area, t]) => ROOMS[area] && time - t <= RECENT_MOTION_MS)
    .map(([area]) => area.replace('_', ' '));
  if (moving.length) bits.push(`Recent movement: ${moving.join(', ')}.`);
  const spare = state.temperatures.spare_room;
  if (spare !== undefined) bits.push(`Spare room ${spare.toFixed(1)} degrees.`);
  return bits.join(' ');
}

export function Plan({ state, time, marks, legs }: Props) {
  const shownMarks = marks.filter((m) => m.time <= time);
  const current = shownMarks[shownMarks.length - 1];
  const spareTemp = state.temperatures.spare_room;
  const spareChange = state.temperatureChange.spare_room;
  const spareCold = spareChange !== undefined && spareChange <= -3;
  const backDoorOpen = state.doors.back_door === true;
  const frontDoorOpen = state.doors.front_door === true;

  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={summarise(state, time)} className="block h-auto w-full">
      <defs>
        <radialGradient id="lamp">
          <stop offset="0" stopColor="var(--color-lamp)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--color-lamp)" stopOpacity="0" />
        </radialGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="var(--color-red)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      <g transform={`translate(${HOUSE_OFFSET_X} 0)`}>

      {/* Lit rooms */}
      {Object.entries(ROOMS).map(([id, r]) => (
        <rect
          key={id}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="var(--color-lamp)"
          className="lamp-wash"
          style={{ opacity: state.lights[id] ? 0.13 : 0 }}
        />
      ))}

      {/* Furniture, kept faint so the rooms read first */}
      <g className="fill-none stroke-line/35" strokeWidth="1.2">
        <rect x="40" y="128" width="112" height="36" rx="4" />
        <rect x="40" y="118" width="112" height="10" rx="3" />
        <rect x="300" y="28" width="210" height="16" />
        <circle cx="435" cy="150" r="22" />
        <rect x="36" y="296" width="78" height="86" rx="4" />
        <rect x="42" y="302" width="30" height="16" rx="3" />
        <rect x="78" y="302" width="30" height="16" rx="3" />
        <rect x="222" y="274" width="30" height="74" rx="12" />
        <rect x="500" y="274" width="66" height="26" />
        <rect x="524" y="30" width="40" height="40" />
      </g>

      {/* Walls */}
      <g className="fill-none stroke-line" strokeWidth={WALL} strokeLinejoin="miter">
        {Object.entries(ROOMS).map(([id, r]) => (
          <rect key={id} x={r.x} y={r.y} width={r.w} height={r.h} />
        ))}
      </g>
      <g className="fill-ground">
        {DOORWAY_GAPS.map(([x, y, w, h]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />
        ))}
        {backDoorOpen && <rect x="576" y="90" width="9" height="40" />}
        {frontDoorOpen && <rect x="15" y="222" width="9" height="26" />}
      </g>
      {/* Door leaves and swings, for the two exterior doors */}
      <g className="fill-none stroke-line" strokeWidth="1.6">
        {backDoorOpen ? (
          <>
            <line x1="580" y1="90" x2="620" y2="90" />
            <path d="M620 90 A40 40 0 0 1 580 130" strokeDasharray="3 4" className="stroke-line/60" />
          </>
        ) : (
          <>
            <line x1="574" y1="90" x2="586" y2="90" />
            <line x1="574" y1="130" x2="586" y2="130" />
          </>
        )}
        {frontDoorOpen ? (
          <>
            <line x1="20" y1="222" x2="46" y2="222" />
            <path d="M46 222 A26 26 0 0 1 20 248" strokeDasharray="3 4" className="stroke-line/60" />
          </>
        ) : (
          <>
            <line x1="14" y1="222" x2="26" y2="222" />
            <line x1="14" y1="248" x2="26" y2="248" />
          </>
        )}
      </g>

      {/* Labels */}
      <g className="font-mono" fontSize="12" letterSpacing="0.02em">
        {Object.entries(ROOMS).map(([id, r]) => (
          <text key={id} x={r.x + 10} y={r.y + 20} className="fill-muted">
            {r.label}
          </text>
        ))}
        <text x="522" y="85" className="fill-muted" fontSize="10.5">
          fridge
        </text>
        <text x="590" y="140" className="fill-muted" fontSize="11">
          back door
        </text>
        <text x="8" y="239" className="fill-muted" fontSize="11" textAnchor="end">
          front door
        </text>
      </g>

      {spareTemp !== undefined && (
        <g className="font-mono">
          <text x="330" y="314" fontSize="28" fontWeight="500" className={spareCold ? 'fill-red' : 'fill-line'}>
            {spareTemp.toFixed(1)}°
          </text>
          {spareChange !== undefined && Math.abs(spareChange) >= 0.5 && (
            <text x="330" y="334" fontSize="12" className={spareCold ? 'fill-red' : 'fill-muted'}>
              {spareChange > 0 ? '+' : '−'}
              {Math.abs(spareChange).toFixed(1)}° in 1 h
            </text>
          )}
        </g>
      )}

      {/* Lamps and movement */}
      {Object.entries(ANCHORS)
        .filter(([id]) => ROOMS[id])
        .map(([id, [x, y]]) => {
          const on = state.lights[id] === true;
          const moving = state.lastMotion[id] !== undefined && time - state.lastMotion[id]! <= RECENT_MOTION_MS;
          return (
            <g key={id}>
              <circle cx={x} cy={y} r={on ? 46 : 0} fill="url(#lamp)" className="lamp-wash" />
              <circle cx={x} cy={y} r="4" className={on ? 'fill-lamp' : 'fill-none stroke-line/40'} strokeWidth="1.2" />
              {moving && <circle cx={x} cy={y} r="14" className="ring fill-none stroke-line" strokeWidth="1.4" />}
            </g>
          );
        })}

      {/* The haunting: legs of the route, then numbered marks */}
      <g className="fill-none stroke-red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {legs
          .filter((l) => l.time <= time)
          .map((l) => (
            <path key={l.time} d={toPath(l.points)} strokeDasharray="7 6" className="leg" markerEnd="url(#arrow)" />
          ))}
      </g>
      {shownMarks.map((m) => (
        <g key={m.n} className="font-mono">
          {m === current && <circle cx={m.at[0]} cy={m.at[1]} r="15" className="ring fill-none stroke-red" strokeWidth="1.5" />}
          <circle cx={m.at[0]} cy={m.at[1]} r="11" className="fill-ground stroke-red" strokeWidth="1.8" />
          <text x={m.at[0]} y={m.at[1] + 4} textAnchor="middle" fontSize="12" fontWeight="500" className="fill-red">
            {m.n}
          </text>
        </g>
      ))}
      </g>
    </svg>
  );
}
