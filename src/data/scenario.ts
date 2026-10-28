import { makeEvent, type HaEvent } from './types';

/** Hand-authored events: the evening routine, one ordinary night-time trip, and the planted anomalies. */

export interface Anomaly {
  id: string;
  description: string;
  event: HaEvent;
}

const e = makeEvent;

function pulse(entity: string, on: string, off: string): HaEvent[] {
  return [e(entity, 'on', on), e(entity, 'off', off)];
}

/** Evening: people arrive, cook, relax, then the house is put to bed by about 22:40. */
const evening: HaEvent[] = [
  e('device_tracker.alex_phone', 'home', '18:12:10'),
  e('binary_sensor.front_door', 'on', '18:12:40'),
  e('binary_sensor.hallway_motion', 'on', '18:13:05'),
  e('light.hallway', 'on', '18:13:08'),
  e('binary_sensor.front_door', 'off', '18:13:20'),
  e('binary_sensor.hallway_motion', 'off', '18:13:45'),
  ...pulse('binary_sensor.living_room_motion', '18:14:30', '18:52:00'),
  e('light.living_room', 'on', '18:14:35'),
  e('light.hallway', 'off', '18:20:00'),

  ...pulse('binary_sensor.kitchen_motion', '18:40:12', '19:25:00'),
  e('light.kitchen', 'on', '18:40:20'),
  ...pulse('binary_sensor.fridge_door', '18:41:00', '18:41:25'),

  e('device_tracker.sam_phone', 'home', '18:47:30'),
  e('binary_sensor.front_door', 'on', '18:47:55'),
  ...pulse('binary_sensor.hallway_motion', '18:48:10', '18:48:50'),
  e('binary_sensor.front_door', 'off', '18:48:15'),

  e('device_tracker.sam_phone', 'not_home', '20:05:00'),
  e('device_tracker.sam_phone', 'home', '20:41:00'),
  e('binary_sensor.front_door', 'on', '20:41:20'),
  ...pulse('binary_sensor.hallway_motion', '20:41:40', '20:42:10'),
  e('binary_sensor.front_door', 'off', '20:41:50'),

  ...pulse('binary_sensor.kitchen_motion', '21:30:00', '21:48:00'),
  ...pulse('binary_sensor.fridge_door', '21:31:00', '21:31:30'),
  ...pulse('binary_sensor.living_room_motion', '21:50:00', '22:29:00'),

  // Lights out by 22:40.
  e('light.living_room', 'off', '22:30:00'),
  e('light.kitchen', 'off', '22:31:00'),
  ...pulse('binary_sensor.hallway_motion', '22:32:00', '22:33:00'),
  ...pulse('binary_sensor.bathroom_motion', '22:33:05', '22:39:30'),
  e('light.bathroom', 'on', '22:33:10'),
  e('light.bathroom', 'off', '22:39:00'),
  ...pulse('binary_sensor.hallway_motion', '22:39:40', '22:40:20'),
  e('light.hallway', 'off', '22:40:10'),
  ...pulse('binary_sensor.bedroom_motion', '22:40:40', '22:49:00'),
  e('light.bedroom', 'on', '22:41:00'),
  e('light.bedroom', 'off', '22:48:00'),
];

/** An ordinary, explainable night-time trip to the bathroom. A good scorer rates this low. */
const bathroomTrip: HaEvent[] = [
  e('binary_sensor.bedroom_motion', 'on', '01:12:20'),
  e('binary_sensor.hallway_motion', 'on', '01:12:50'),
  e('binary_sensor.bathroom_motion', 'on', '01:13:30'),
  e('light.bathroom', 'on', '01:13:40'),
  e('binary_sensor.bedroom_motion', 'off', '01:13:50'),
  e('binary_sensor.hallway_motion', 'off', '01:13:55'),
  e('light.bathroom', 'off', '01:18:10'),
  e('binary_sensor.bathroom_motion', 'off', '01:18:20'),
  ...pulse('binary_sensor.hallway_motion', '01:18:40', '01:19:00'),
  ...pulse('binary_sensor.bedroom_motion', '01:19:10', '01:19:40'),
];

/** The spare room is unoccupied all night, so its temperature should creep, not plunge. */
const spareRoomTemperature: HaEvent[] = [
  ['18:30', '19.8'], ['19:00', '19.8'], ['19:30', '19.7'], ['20:00', '19.7'],
  ['20:30', '19.6'], ['21:00', '19.6'], ['21:30', '19.5'], ['22:00', '19.5'],
  ['22:30', '19.5'], ['23:00', '19.4'], ['23:30', '19.4'], ['00:00', '19.4'],
  ['00:30', '19.3'], ['01:00', '19.3'], ['01:30', '19.3'], ['02:00', '19.3'],
  ['02:30', '19.3'], ['02:51:00', '19.2'],
  // The plunge: 6.2 degrees in ten and a half minutes.
  ['02:54:00', '17.9'], ['02:57:00', '16.2'], ['03:00:00', '14.5'], ['03:01:30', '13.0'],
  ['03:30', '13.1'], ['04:00', '13.6'], ['04:30', '14.2'], ['05:00', '15.0'],
  ['05:30', '15.8'], ['06:00', '16.6'], ['06:30', '17.3'],
].map(([time, state]) => e('sensor.spare_room_temperature', state!, time!));

/** The planted anomalies. Each has no ordinary explanation elsewhere in the night. */
export const ANOMALIES: Anomaly[] = [
  {
    id: 'spare-room-light',
    description: 'Spare room light switches on with no motion in the room',
    event: e('light.spare_room', 'on', '01:58:20'),
  },
  {
    id: 'hallway-motion',
    description: 'Hallway motion while every phone is home and the house is asleep',
    event: e('binary_sensor.hallway_motion', 'on', '02:47:10'),
  },
  {
    id: 'spare-room-cold',
    description: 'Spare room temperature falls about 6 degrees in 10 minutes',
    event: e('sensor.spare_room_temperature', '13.0', '03:01:30'),
  },
  {
    id: 'back-door',
    description: 'Back door opens with no motion beforehand',
    event: e('binary_sensor.back_door', 'on', '03:12:05'),
  },
];

const anomalyExtras: HaEvent[] = [
  e('light.spare_room', 'off', '02:01:05'),
  e('binary_sensor.hallway_motion', 'off', '02:47:42'),
  e('binary_sensor.back_door', 'off', '03:12:58'),
];

/** Morning: someone gets up at about 06:45 and the day starts normally. */
const morning: HaEvent[] = [
  e('binary_sensor.bedroom_motion', 'on', '06:44:00'),
  e('light.bedroom', 'on', '06:44:10'),
  e('binary_sensor.hallway_motion', 'on', '06:45:00'),
  e('light.hallway', 'on', '06:45:05'),
  e('binary_sensor.bathroom_motion', 'on', '06:46:00'),
  e('light.bathroom', 'on', '06:46:10'),
  e('binary_sensor.hallway_motion', 'off', '06:46:20'),
  e('binary_sensor.kitchen_motion', 'on', '06:50:00'),
  e('light.kitchen', 'on', '06:50:05'),
  ...pulse('binary_sensor.fridge_door', '06:52:00', '06:52:20'),
];

export const scenarioEvents: HaEvent[] = [
  ...evening,
  ...bathroomTrip,
  ...spareRoomTemperature,
  ...ANOMALIES.map((a) => a.event),
  ...anomalyExtras,
  ...morning,
];
