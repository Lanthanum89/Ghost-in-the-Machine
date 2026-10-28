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
  /** Clears the story and cancels anything in flight, for when the source of the story changes. */
  const reset = useCallback(() => {
    const running = controller.current;
    controller.current = null;
    running?.abort();
    setState(IDLE);
  }, []);
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

  /** Plays a saved story with the same streaming feel as a live one. With `instant`, shows it whole. */
  const play = useCallback((text: string, instant: boolean) => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    if (instant) {
      setState({ status: 'done', text, error: null });
      return;
    }
    setState({ status: 'streaming', text: '', error: null });
    const words = text.split(/(?<= )/);
    let next = 0;
    const timer = setInterval(() => {
      const word = words[next++];
      if (word !== undefined) setState((s) => ({ ...s, text: s.text + word }));
      if (next >= words.length) {
        clearInterval(timer);
        setState((s) => ({ ...s, status: 'done' }));
      }
    }, 42);
    mine.signal.addEventListener('abort', () => {
      clearInterval(timer);
      if (controller.current === mine) setState((s) => ({ ...s, status: s.text ? 'done' : 'idle' }));
    });
  }, []);

  return { ...state, start, play, stop, reset };
}
