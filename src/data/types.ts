/** One state change, shaped like a row of Home Assistant history output. */
export interface HaEvent {
  entity_id: string;
  friendly_name: string;
  state: string;
  last_changed: string;
}

export const FRIENDLY_NAMES: Record<string, string> = {
  'light.living_room': 'Living room light',
  'light.kitchen': 'Kitchen light',
  'light.hallway': 'Hallway light',
  'light.bathroom': 'Bathroom light',
  'light.bedroom': 'Bedroom light',
  'light.spare_room': 'Spare room light',
  'binary_sensor.living_room_motion': 'Living room motion',
  'binary_sensor.kitchen_motion': 'Kitchen motion',
  'binary_sensor.hallway_motion': 'Hallway motion',
  'binary_sensor.bathroom_motion': 'Bathroom motion',
  'binary_sensor.bedroom_motion': 'Bedroom motion',
  'binary_sensor.spare_room_motion': 'Spare room motion',
  'binary_sensor.front_door': 'Front door',
  'binary_sensor.back_door': 'Back door',
  'binary_sensor.fridge_door': 'Fridge door',
  'binary_sensor.fridge_compressor': 'Fridge compressor',
  'sensor.fridge_temperature': 'Fridge temperature',
  'sensor.living_room_temperature': 'Living room temperature',
  'sensor.spare_room_temperature': 'Spare room temperature',
  'climate.heating': 'Heating',
  'device_tracker.alex_phone': "Alex's phone",
  'device_tracker.sam_phone': "Sam's phone",
};

/** The fixture night starts at 18:00 on 30 October and ends at 07:00 on 31 October (GMT). */
export const NIGHT_START = '2026-10-30T18:00:00Z';
export const NIGHT_END = '2026-10-31T07:00:00Z';

/** Turns "HH:MM" or "HH:MM:SS" into a timestamp. Hours before noon fall on the 31st. */
export function stamp(time: string): string {
  const [h = '0', m = '0', s = '0'] = time.split(':');
  const day = Number(h) < 12 ? 31 : 30;
  const pad = (v: string) => v.padStart(2, '0');
  return `2026-10-${day}T${pad(h)}:${pad(m)}:${pad(s)}Z`;
}

export function makeEvent(entity_id: string, state: string, time: string): HaEvent {
  const friendly_name = FRIENDLY_NAMES[entity_id];
  if (!friendly_name) throw new Error(`Unknown entity: ${entity_id}`);
  return { entity_id, friendly_name, state, last_changed: stamp(time) };
}
