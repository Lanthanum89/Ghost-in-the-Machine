import type { ChatMessage } from './prompt';

/** Streaming client for Ollama's /api/chat. Local inference only; nothing here talks to a cloud service. */

export const DEFAULT_HOST = 'http://localhost:11434';
export const DEFAULT_MODEL = 'llama3.1:8b';

export interface OllamaConfig {
  host: string;
  model: string;
}

export interface GenerationOptions {
  temperature: number;
  /** Cap on generated tokens. 300 words is roughly 400 tokens. */
  num_predict: number;
  top_p: number;
}

export const DEFAULT_GENERATION: GenerationOptions = { temperature: 0.6, num_predict: 450, top_p: 0.9 };

/** Ollama could not be reached at all, usually because it is not running or blocks this origin. */
export class OllamaUnreachableError extends Error {
  constructor(public readonly host: string, cause?: unknown) {
    super(`Could not reach Ollama at ${host}`);
    this.name = 'OllamaUnreachableError';
    this.cause = cause;
  }
}

/** Ollama answered, but does not have the requested model. */
export class OllamaModelMissingError extends Error {
  constructor(public readonly model: string) {
    super(`Ollama does not have the model "${model}"`);
    this.name = 'OllamaModelMissingError';
  }
}

export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

/** Reads OLLAMA_HOST and OLLAMA_MODEL from an env-like object. Blank values fall back to defaults. */
export function resolveConfig(env: Record<string, string | undefined> = {}): OllamaConfig {
  const host = (env.OLLAMA_HOST?.trim() || DEFAULT_HOST).replace(/\/+$/, '');
  return {
    host: /^https?:\/\//.test(host) ? host : `http://${host}`,
    model: env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL,
  };
}

interface ChatChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

/** Yields story text as it arrives. Aborting the signal stops the request. */
export async function* streamChat(
  messages: ChatMessage[],
  config: OllamaConfig,
  options: Partial<GenerationOptions> = {},
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<string, void, void> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        options: { ...DEFAULT_GENERATION, ...options },
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new OllamaUnreachableError(config.host, err);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 404) throw new OllamaModelMissingError(config.model);
    throw new OllamaError(`Ollama returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  if (!response.body) throw new OllamaError('Ollama sent an empty response');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (line: string): ChatChunk | undefined => {
    if (!line.trim()) return undefined;
    try {
      return JSON.parse(line) as ChatChunk;
    } catch {
      throw new OllamaError('Ollama sent a response that could not be read');
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = done ? '' : (lines.pop() ?? '');
      if (done && lines.length === 0) break;
      for (const line of lines) {
        const chunk = parse(line);
        if (!chunk) continue;
        if (chunk.error) {
          if (/not found/i.test(chunk.error)) throw new OllamaModelMissingError(config.model);
          throw new OllamaError(chunk.error);
        }
        if (chunk.message?.content) yield chunk.message.content;
        if (chunk.done) return;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
