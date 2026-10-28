import { OllamaModelMissingError, OllamaUnreachableError, type OllamaConfig } from '../core/ollama';

export interface FriendlyError {
  title: string;
  detail: string;
  /** Shell commands to show in a code block. */
  commands: string[];
}

/** Turns a client error into something a person can act on. */
export function friendlyError(err: unknown, config: OllamaConfig, origin: string): FriendlyError {
  if (err instanceof OllamaUnreachableError) {
    // Localhost pages are allowed by Ollama already, so the origin lines only matter elsewhere (GitHub Pages).
    const hosted = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin);
    return {
      title: 'Ollama is not answering',
      detail:
        `Nothing replied at ${config.host}. Start Ollama${hosted ? ' and allow this page\u2019s origin' : ''}. ` +
        'Everything else on the page still works without it.',
      commands: [
        '# Start it (on Windows it usually runs from the tray already)',
        'ollama serve',
        '# If that says the port is in use, it is already running.',
        ...(hosted
          ? [
              '',
              '# Allow this page, macOS and Linux:',
              `OLLAMA_ORIGINS=${origin} ollama serve`,
              '',
              '# Allow this page, Windows PowerShell, then restart Ollama:',
              `setx OLLAMA_ORIGINS "${origin}"`,
            ]
          : []),
      ],
    };
  }
  if (err instanceof OllamaModelMissingError) {
    return {
      title: `Ollama does not have ${err.model}`,
      detail: 'Pull the model once, or change the model name in the settings below.',
      commands: [`ollama pull ${err.model}`],
    };
  }
  return {
    title: 'The story went wrong',
    detail: err instanceof Error ? err.message : 'Something unexpected happened.',
    commands: [],
  };
}
