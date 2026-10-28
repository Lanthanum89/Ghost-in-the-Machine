import type { HaEvent } from '../data/types';
import { areaOf, kindOf } from './timeline';

/** What the house looked like at a moment, replayed from its state changes. */
export interface HouseState {
  /** Area to whether its light is on. */
  lights: Record<string, boolean>;
  /** Door entity name (back_door, front_door, fridge_door) to whether it is open. */
  doors: Record<string, boolean>;
  /** Area to the time of its latest movement. */
  lastMotion: Record<string, number>;
  /** Area to its latest temperature. */
  temperatures: Record<string, number>;
  /** Area to its temperature change over the previous hour, where known. */
  temperatureChange: Record<string, number>;
  heating: boolean;
  phonesHome: number;
  phonesTotal: number;
}

const HOUR = 3_600_000;

export function houseAt(history: HaEvent[], atMs: number): HouseState {
  const state: HouseState = {
    lights: {},
    doors: {},
    lastMotion: {},
    temperatures: {},
    temperatureChange: {},
    heating: false,
    phonesHome: 0,
    phonesTotal: 0,
  };
  const trackers = new Map<string, boolean>();
  const readings = new Map<string, Array<[number, number]>>();

  for (const ev of history) {
    const t = Date.parse(ev.last_changed);
    if (t > atMs) continue;
    const kind = kindOf(ev.entity_id);
    const area = areaOf(ev.entity_id);
    switch (kind) {
      case 'light':
        state.lights[area] = ev.state === 'on';
        break;
      case 'door':
        state.doors[area] = ev.state === 'on';
        break;
      case 'motion':
        if (ev.state === 'on') state.lastMotion[area] = Math.max(state.lastMotion[area] ?? 0, t);
        break;
      case 'climate':
        state.heating = ev.state === 'heat';
        break;
      case 'presence':
        trackers.set(ev.entity_id, ev.state === 'home');
        break;
      case 'temperature': {
        const value = Number(ev.state);
        if (Number.isNaN(value)) break;
        const list = readings.get(area) ?? [];
        list.push([t, value]);
        readings.set(area, list);
        break;
      }
      default:
        break;
    }
  }

  for (const [area, list] of readings) {
    const latest = list[list.length - 1]!;
    state.temperatures[area] = latest[1];
    const before = [...list].reverse().find(([t]) => t <= latest[0] - HOUR);
    if (before) state.temperatureChange[area] = latest[1] - before[1];
  }
  state.phonesTotal = trackers.size;
  state.phonesHome = [...trackers.values()].filter(Boolean).length;
  return state;
}
