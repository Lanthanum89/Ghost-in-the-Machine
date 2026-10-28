import { NOTABLE_SCORE, type ScoredEvent } from '../core/timeline';

/** Geometry of the house plan, in SVG units (viewBox 0 0 730 440), and where the marked events sit on it. */

export type Point = [number, number];

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export const VIEW = { w: 730, h: 440 };

/** Room for the front door's label to the left of the house, in SVG units. */
export const HOUSE_OFFSET_X = 70;


export const ROOMS: Record<string, Room> = {
  living_room: { x: 20, y: 20, w: 270, h: 190, label: 'living room' },
  kitchen: { x: 290, y: 20, w: 290, h: 190, label: 'kitchen' },
  hallway: { x: 20, y: 210, w: 560, h: 50, label: 'hallway' },
  bedroom: { x: 20, y: 260, w: 190, h: 160, label: 'bedroom' },
  bathroom: { x: 210, y: 260, w: 110, h: 160, label: 'bathroom' },
  spare_room: { x: 320, y: 260, w: 260, h: 160, label: 'spare room' },
};

/** Where a lamp, a movement ring or a marker sits inside each room. */
export const ANCHORS: Record<string, Point> = {
  living_room: [155, 118],
  kitchen: [435, 125],
  hallway: [300, 235],
  bedroom: [115, 345],
  bathroom: [265, 345],
  spare_room: [510, 356],
  back_door: [580, 110],
  front_door: [20, 235],
};

export interface Mark {
  n: number;
  /** The scored event this mark stands for. */
  event: ScoredEvent;
  time: number;
  area: string;
  text: string;
  why: string;
  at: Point;
}

/** The unexplained events, numbered in time order. Marks that share a room are nudged apart. */
export function buildMarks(picked: ScoredEvent[]): Mark[] {
  const seen = new Map<string, number>();
  return picked
    .filter((s) => s.score >= NOTABLE_SCORE)
    .sort((a, b) => a.time - b.time)
    .map((s, i) => {
      const base = ANCHORS[s.area] ?? ANCHORS.hallway!;
      const count = seen.get(s.area) ?? 0;
      seen.set(s.area, count + 1);
      const best = [...s.reasons].sort((a, b) => b.points - a.points)[0];
      return {
        n: i + 1,
        event: s,
        time: s.time,
        area: s.area,
        text: s.text,
        why: best?.text ?? '',
        at: [base[0] + count * 30 - (s.area === 'back_door' ? 22 * (count + 1) : 0), base[1] - count * 26],
      };
    });
}

export interface Leg {
  /** Appears once the scrub time passes this. */
  time: number;
  points: Point[];
}

/**
 * A link between each pair of consecutive marks, in time order. It shows sequence only: nothing here
 * tracks anyone through the house, so it is drawn as a straight line and not as a walking route.
 */
export function buildLegs(marks: Mark[]): Leg[] {
  return marks.slice(1).map((b, i) => ({ time: b.time, points: [marks[i]!.at, b.at] }));
}

export const toPath = (points: Point[]): string => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
