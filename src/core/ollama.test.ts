import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOST,
  DEFAULT_MODEL,
  OllamaError,
  OllamaModelMissingError,
  OllamaUnreachableError,
  resolveConfig,
  streamChat,
} from './ollama';
import { SYSTEM_PROMPT, buildMessages, formatTimeline } from './prompt';
import { pickTimeline } from './timeline';
import { makeEvent } from '../data/types';

const messages = [{ role: 'user' as const, content: 'hello' }];
const config = { host: 'http://ollama.test', model: 'tiny:1b' };

/** Builds a fetch that streams the given chunks of raw text, split exactly as supplied. */
function streamingFetch(chunks: string[], init: ResponseInit = { status: 200 }): typeof fetch {
  return (async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(body, init);
  }) as typeof fetch;
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const part of gen) out += part;
  return out;
}

const line = (content: string, done = false) => JSON.stringify({ message: { content }, done }) + '\n';

describe('resolveConfig', () => {
  it('uses defaults when env is empty or blank', () => {
    expect(resolveConfig()).toEqual({ host: DEFAULT_HOST, model: DEFAULT_MODEL });
    expect(resolveConfig({ OLLAMA_HOST: '  ', OLLAMA_MODEL: '' })).toEqual({ host: DEFAULT_HOST, model: DEFAULT_MODEL });
  });

  it('reads env, trims trailing slashes and adds a scheme', () => {
    expect(resolveConfig({ OLLAMA_HOST: 'http://box.lan:11434/', OLLAMA_MODEL: 'qwen3:8b' })).toEqual({
      host: 'http://box.lan:11434',
      model: 'qwen3:8b',
    });
    expect(resolveConfig({ OLLAMA_HOST: 'box.lan:11434' }).host).toBe('http://box.lan:11434');
  });
});

describe('streamChat', () => {
  it('yields tokens in order, even when lines are split across chunks', async () => {
    const full = line('The ') + line('house ') + line('sighed.') + line('', true);
    const cut = [full.slice(0, 20), full.slice(20, 55), full.slice(55)];
    expect(await collect(streamChat(messages, config, {}, undefined, streamingFetch(cut)))).toBe('The house sighed.');
  });

  it('sends the model, messages, stream flag and capped options', async () => {
    let sent: { url: string; body: Record<string, unknown> } | undefined;
    const spy = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return new Response(line('', true));
    }) as unknown as typeof fetch;
    await collect(streamChat(messages, config, { temperature: 0.3 }, undefined, spy));
    expect(sent?.url).toBe('http://ollama.test/api/chat');
    expect(sent?.body).toMatchObject({ model: 'tiny:1b', stream: true, options: { temperature: 0.3, num_predict: 450 } });
  });

  it('throws OllamaUnreachableError when the connection fails', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(collect(streamChat(messages, config, {}, undefined, down))).rejects.toBeInstanceOf(OllamaUnreachableError);
  });

  it('rethrows an abort instead of calling it unreachable', async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = (async () => {
      throw new DOMException('Aborted', 'AbortError');
    }) as unknown as typeof fetch;
    await expect(collect(streamChat(messages, config, {}, controller.signal, aborted))).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws OllamaModelMissingError on a 404 or a not-found error line', async () => {
    const missing = streamingFetch(['{"error":"model not found"}'], { status: 404 });
    await expect(collect(streamChat(messages, config, {}, undefined, missing))).rejects.toBeInstanceOf(OllamaModelMissingError);

    const inStream = streamingFetch(['{"error":"model \\"tiny:1b\\" not found, try pulling it first"}\n']);
    await expect(collect(streamChat(messages, config, {}, undefined, inStream))).rejects.toBeInstanceOf(OllamaModelMissingError);
  });

  it('throws OllamaError for other failures and unreadable output', async () => {
    const broken = streamingFetch(['oops'], { status: 500 });
    await expect(collect(streamChat(messages, config, {}, undefined, broken))).rejects.toBeInstanceOf(OllamaError);

    const garbage = streamingFetch(['not json\n']);
    await expect(collect(streamChat(messages, config, {}, undefined, garbage))).rejects.toBeInstanceOf(OllamaError);
  });
});

describe('prompt', () => {
  const events = pickTimeline([
    makeEvent('device_tracker.alex_phone', 'home', '18:00'),
    makeEvent('device_tracker.sam_phone', 'home', '18:01'),
    makeEvent('binary_sensor.back_door', 'on', '03:12:05'),
  ]);

  it('formats one plain-English line per event with the time', () => {
    expect(formatTimeline(events)).toContain('03:12 Back door opened');
  });

  it('never leaks scores or rule names to the model', () => {
    const [system, user] = buildMessages(events);
    expect(system?.role).toBe('system');
    expect(user?.content).not.toMatch(/score|unexplained|asleep|rare|routine|delta|points/i);
  });

  it('fixes the voice and the length cap', () => {
    expect(SYSTEM_PROMPT).toMatch(/British/);
    expect(SYSTEM_PROMPT).toMatch(/under 300 words/);
  });
});
