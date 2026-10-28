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
    return {
      title: 'Ollama is not answering',
      detail:
        `Nothing replied at ${config.host}. Start Ollama and, if this page is not served from localhost, ` +
        'allow this page’s origin. Everything else on the page still works without it.',
      commands: ['ollama serve', `OLLAMA_ORIGINS=${origin} ollama serve`],
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
