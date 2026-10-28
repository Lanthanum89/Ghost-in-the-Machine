import { describe, expect, it } from 'vitest';
import { OllamaError, OllamaModelMissingError, OllamaUnreachableError } from '../core/ollama';
import { friendlyError } from './errors';

const config = { host: 'http://localhost:11434', model: 'llama3.1:8b' };

describe('friendlyError', () => {
  it('explains how to start Ollama, and how to allow a hosted origin on each shell', () => {
    const e = friendlyError(new OllamaUnreachableError(config.host), config, 'https://example.github.io');
    expect(e.title).toMatch(/not answering/i);
    expect(e.detail).toContain(config.host);
    expect(e.detail).toMatch(/origin/);
    expect(e.commands).toContain('ollama serve');
    expect(e.commands).toContain('OLLAMA_ORIGINS=https://example.github.io ollama serve');
    expect(e.commands).toContain('setx OLLAMA_ORIGINS "https://example.github.io"');
  });

  it('does not mention origins when the page is served from localhost', () => {
    const e = friendlyError(new OllamaUnreachableError(config.host), config, 'http://localhost:5173');
    expect(e.detail).not.toMatch(/origin/);
    expect(e.commands.join('\n')).not.toContain('OLLAMA_ORIGINS');
    expect(e.commands).toContain('ollama serve');
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
