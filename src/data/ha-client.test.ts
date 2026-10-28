import { describe, expect, it } from 'vitest';
import { configFromEnv, fetchHistory, historyUrl, mapHistory } from './ha-client';

// These tests only check this file against the response shape described in the Home Assistant docs.
// They say nothing about how a real instance behaves.

const config = { url: 'http://ha.local:8123', token: 'secret' };

describe('ha-client (untested against a real Home Assistant)', () => {
  it('requires HA_URL and HA_TOKEN', () => {
    expect(() => configFromEnv({})).toThrow(/HA_URL/);
    expect(configFromEnv({ HA_URL: 'http://ha.local:8123/', HA_TOKEN: ' t ' })).toEqual({ url: 'http://ha.local:8123', token: 't' });
  });

  it('builds the history URL', () => {
    const url = historyUrl(config, new Date('2026-10-30T18:00:00Z'), new Date('2026-10-31T07:00:00Z'), ['light.kitchen', 'binary_sensor.back_door']);
    expect(url).toBe(
      'http://ha.local:8123/api/history/period/2026-10-30T18%3A00%3A00.000Z' +
        '?end_time=2026-10-31T07%3A00%3A00.000Z&filter_entity_id=light.kitchen%2Cbinary_sensor.back_door',
    );
  });

  it('flattens rows and carries entity_id and name forward', () => {
    const events = mapHistory([
      [
        { entity_id: 'light.kitchen', state: 'on', last_changed: '2026-10-31T01:00:00+00:00', attributes: { friendly_name: 'Kitchen light' } },
        { state: 'off', last_changed: '2026-10-31T02:00:00+00:00' },
      ],
      [{ entity_id: 'binary_sensor.back_door', state: 'on', last_changed: '2026-10-31T01:30:00+00:00' }],
    ]);
    expect(events.map((e) => [e.entity_id, e.friendly_name, e.state])).toEqual([
      ['light.kitchen', 'Kitchen light', 'on'],
      ['binary_sensor.back_door', 'binary_sensor.back_door', 'on'],
      ['light.kitchen', 'Kitchen light', 'off'],
    ]);
  });

  it('sends the bearer token and surfaces HTTP errors', async () => {
    let auth = '';
    const ok = (async (_url: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).Authorization!;
      return new Response('[]');
    }) as unknown as typeof fetch;
    await fetchHistory(config, new Date(0), new Date(1), [], ok);
    expect(auth).toBe('Bearer secret');

    const denied = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    await expect(fetchHistory(config, new Date(0), new Date(1), [], denied)).rejects.toThrow(/401/);
  });
});
