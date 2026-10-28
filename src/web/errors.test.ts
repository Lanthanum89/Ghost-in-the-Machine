import { describe, expect, it } from 'vitest';
import { OllamaError, OllamaModelMissingError, OllamaUnreachableError } from '../core/ollama';
import { friendlyError } from './errors';

const config = { host: 'http://localhost:11434', model: 'llama3.1:8b' };

describe('friendlyError', () => {
  it('explains how to start Ollama and allow the origin when it is unreachable', () => {
    const e = friendlyError(new OllamaUnreachableError(config.host), config, 'https://example.github.io');
    expect(e.title).toMatch(/not answering/i);
    expect(e.detail).toContain(config.host);
    expect(e.commands).toContain('ollama serve');
    expect(e.commands.some((c) => c.includes('OLLAMA_ORIGINS=https://example.github.io'))).toBe(true);
  });

  it('tells the user which model to pull', () => {
    const e = friendlyError(new OllamaModelMissingError('tiny:1b'), config, '');
    expect(e.commands).toEqual(['ollama pull tiny:1b']);
  });

  it('passes other messages through', () => {
    expect(friendlyError(new OllamaError('boom'), config, '').detail).toBe('boom');
    expect(friendlyError('odd', config, '').detail).toMatch(/unexpected/i);
  });
});
