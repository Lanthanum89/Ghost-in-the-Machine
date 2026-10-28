import type { HaEvent } from './types';

/**
 * UNTESTED: this adapter has never been run against a real Home Assistant instance.
 *
 * It is written from the Home Assistant REST API documentation:
 *   GET /api/history/period/<timestamp>?end_time=...&filter_entity_id=a,b
 *   Authorization: Bearer <long-lived access token>
 * The response is an array with one array of state objects per entity.
 *
 * It runs in Node (HA_URL and HA_TOKEN come from the environment) and is not imported by the web app,
 * so the token is never bundled into the browser. A long-lived token can be created on your Home
 * Assistant profile page. Treat it like a password and never commit it.
 */

export interface HaConfig {
  url: string;
  token: string;
}

export interface HaStateRow {
  entity_id?: string;
  state: string;
  last_changed: string;
  attributes?: { friendly_name?: string };
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): HaConfig {
  const url = env.HA_URL?.trim().replace(/\/+$/, '');
  const token = env.HA_TOKEN?.trim();
  if (!url || !token) throw new Error('Set HA_URL and HA_TOKEN to read from Home Assistant');
  return { url, token };
}

export function historyUrl(config: HaConfig, start: Date, end: Date, entityIds: string[] = []): string {
  const params = new URLSearchParams({ end_time: end.toISOString() });
  if (entityIds.length) params.set('filter_entity_id', entityIds.join(','));
  return `${config.url}/api/history/period/${encodeURIComponent(start.toISOString())}?${params}`;
}

/**
 * Flattens Home Assistant's one-array-per-entity response into HaEvent rows.
 * With minimal_response only the first row of each entity carries entity_id and attributes,
 * so those are carried forward to the rest.
 */
export function mapHistory(response: HaStateRow[][]): HaEvent[] {
  const events: HaEvent[] = [];
  for (const rows of response) {
    const first = rows[0];
    const entity_id = first?.entity_id;
    if (!entity_id) continue;
    const friendly_name = first.attributes?.friendly_name ?? entity_id;
    for (const row of rows) {
      events.push({ entity_id: row.entity_id ?? entity_id, friendly_name, state: row.state, last_changed: row.last_changed });
    }
  }
  return events.sort((a, b) => Date.parse(a.last_changed) - Date.parse(b.last_changed));
}

export async function fetchHistory(
  config: HaConfig,
  start: Date,
  end: Date,
  entityIds: string[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<HaEvent[]> {
  const response = await fetchImpl(historyUrl(config, start, end, entityIds), {
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Home Assistant returned ${response.status}`);
  return mapHistory((await response.json()) as HaStateRow[][]);
}
