import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, type OllamaConfig } from '../core/ollama';
import type { ChatMessage } from '../core/prompt';

export interface StoryState {
  status: 'idle' | 'streaming' | 'done' | 'error';
  text: string;
  error: unknown;
}

const IDLE: StoryState = { status: 'idle', text: '', error: null };

export function useStory() {
  const [state, setState] = useState<StoryState>(IDLE);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => controller.current?.abort(), []);
  useEffect(() => stop, [stop]);

  const start = useCallback(async (messages: ChatMessage[], config: OllamaConfig) => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setState({ status: 'streaming', text: '', error: null });
    try {
      for await (const token of streamChat(messages, config, {}, mine.signal)) {
        setState((s) => ({ ...s, text: s.text + token }));
      }
      setState((s) => ({ ...s, status: 'done' }));
    } catch (error) {
      if (mine.signal.aborted) {
        // Stopped by the user, or replaced by a newer run that owns the state now.
        if (controller.current === mine) setState((s) => ({ ...s, status: s.text ? 'done' : 'idle' }));
        return;
      }
      setState((s) => ({ ...s, status: 'error', error }));
    }
  }, []);

  return { ...state, start, stop };
}
