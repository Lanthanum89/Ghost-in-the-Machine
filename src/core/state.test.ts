import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeEvent, type HaEvent } from '../data/types';
import { resolveMinute } from './clock';
import { houseAt } from './state';
import { scoreEvents } from './timeline';

const ev = makeEvent;
const at = (hhmm: string) => Date.parse(ev('light.kitchen', 'on', hhmm).last_changed);

describe('houseAt', () => {
  const history = [
    ev('device_tracker.alex_phone', 'home', '18:12'),
    ev('device_tracker.sam_phone', 'home', '18:47'),
    ev('device_tracker.sam_phone', 'not_home', '20:05'),
    ev('light.kitchen', 'on', '18:40'),
    ev('light.kitchen', 'off', '22:31'),
    ev('binary_sensor.back_door', 'on', '03:12'),
    ev('binary_sensor.back_door', 'off', '03:12:58'),
    ev('binary_sensor.hallway_motion', 'on', '02:47'),
    ev('sensor.spare_room_temperature', '19.3', '02:00'),
    ev('sensor.spare_room_temperature', '19.3', '02:30'),
    ev('sensor.spare_room_temperature', '19.2', '02:51'),
    ev('sensor.spare_room_temperature', '13.0', '03:01:30'),
    ev('climate.heating', 'heat', '03:40'),
  ];

  it('replays lights up to the chosen moment', () => {
    expect(houseAt(history, at('19:00')).lights.kitchen).toBe(true);
    expect(houseAt(history, at('23:00')).lights.kitchen).toBe(false);
    expect(houseAt(history, at('18:00')).lights.kitchen).toBeUndefined();
  });

  it('tracks doors opening and closing', () => {
    expect(houseAt(history, at('03:12:30')).doors.back_door).toBe(true);
    expect(houseAt(history, at('03:20')).doors.back_door).toBe(false);
  });

  it('counts phones that are home at that moment', () => {
    expect(houseAt(history, at('19:00'))).toMatchObject({ phonesHome: 2, phonesTotal: 2 });
    expect(houseAt(history, at('20:30'))).toMatchObject({ phonesHome: 1, phonesTotal: 2 });
  });

  it('records the latest movement and heating state', () => {
    const s = houseAt(history, at('03:50'));
    expect(s.lastMotion.hallway).toBe(at('02:47'));
    expect(s.heating).toBe(true);
    expect(houseAt(history, at('03:00')).heating).toBe(false);
  });

  it('reports temperature and its change over the previous hour', () => {
    const s = houseAt(history, at('03:02'));
    expect(s.temperatures.spare_room).toBe(13.0);
    expect(s.temperatureChange.spare_room).toBeCloseTo(-6.3);
    expect(houseAt(history, at('02:35')).temperatureChange.spare_room).toBeUndefined();
    expect(houseAt(history, at('02:35')).temperatures.spare_room).toBe(19.3);
  });
});

describe('replaying the fixture night at the instant a record entry or story time points to', () => {
  const night: HaEvent[] = JSON.parse(readFileSync('fixtures/night-01.json', 'utf8'));
  const scored = scoreEvents(night);
  const ms = (iso: string) => Date.parse(iso);

  it('shows the front door open at the exact instant it opened, although it closes 20 seconds later', () => {
    expect(houseAt(night, ms('2026-10-30T18:47:55Z')).doors.front_door).toBe(true);
    expect(houseAt(night, ms('2026-10-30T18:48:15Z')).doors.front_door).toBe(false);
  });

  it('shows the bathroom light on when the story says 01:13', () => {
    const instant = resolveMinute(ms('2026-10-31T01:13:00Z'), scored);
    expect(houseAt(night, instant).lights.bathroom).toBe(true);
  });

  it('shows the back door open when the story says 03:12, although it closes within the minute', () => {
    const instant = resolveMinute(ms('2026-10-31T03:12:00Z'), scored);
    expect(houseAt(night, instant).doors.back_door).toBe(true);
    expect(houseAt(night, ms('2026-10-31T03:13:00Z')).doors.back_door).toBe(false);
  });
});
