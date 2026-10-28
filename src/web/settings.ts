import { resolveConfig, type OllamaConfig } from '../core/ollama';

const KEY = 'ghost-in-the-house.settings';

/** Build-time defaults from OLLAMA_HOST and OLLAMA_MODEL. */
export function defaultConfig(): OllamaConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  return resolveConfig({ OLLAMA_HOST: env.OLLAMA_HOST, OLLAMA_MODEL: env.OLLAMA_MODEL });
}

/** Saved overrides win over build-time defaults. Storage can be blocked, so every access is guarded. */
export function loadConfig(): OllamaConfig {
  const base = defaultConfig();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<OllamaConfig>;
    return resolveConfig({ OLLAMA_HOST: saved.host ?? base.host, OLLAMA_MODEL: saved.model ?? base.model });
  } catch {
    return base;
  }
}

export function saveConfig(config: OllamaConfig | null): void {
  try {
    if (config) localStorage.setItem(KEY, JSON.stringify(config));
    else localStorage.removeItem(KEY);
  } catch {
    /* Private mode or blocked storage: the settings simply last for this visit. */
  }
}
