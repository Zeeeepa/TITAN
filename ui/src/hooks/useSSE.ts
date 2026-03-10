import { useState, useCallback, useRef } from 'react';
import { streamMessage } from '@/api/client';
import type { StreamEvent, ChatMessage } from '@/api/types';

interface UseSSEReturn {
  isStreaming: boolean;
  streamingContent: string;
  activeTools: string[];
  send: (message: string, sessionId?: string, options?: { agentId?: string }) => Promise<ChatMessage | null>;
  cancel: () => void;
}

export function useSSE(): UseSSEReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (message: string, sessionId?: string, options?: { agentId?: string }): Promise<ChatMessage | null> => {
      setIsStreaming(true);
      setStreamingContent('');
      setActiveTools([]);

      const controller = new AbortController();
      abortRef.current = controller;

      let fullContent = '';
      let resultSessionId = sessionId;
      let toolsUsed: string[] = [];
      let model = '';
      let durationMs = 0;

      try {
        await streamMessage(
          message,
          sessionId,
          (event: StreamEvent) => {
            switch (event.type) {
              case 'token':
                fullContent += event.data;
                setStreamingContent(fullContent);
                break;
              case 'tool_start':
                if (event.toolName) {
                  setActiveTools((prev) => [...prev, event.toolName!]);
                }
                break;
              case 'tool_end':
                if (event.toolName) {
                  setActiveTools((prev) => prev.filter((t) => t !== event.toolName));
                }
                break;
              case 'done':
                if (event.sessionId) resultSessionId = event.sessionId;
                if (event.toolsUsed) toolsUsed = event.toolsUsed;
                if (event.model) model = event.model;
                if (event.durationMs) durationMs = event.durationMs;
                break;
              case 'error':
                console.error('Stream error:', event.data);
                break;
            }
          },
          controller.signal,
          options,
        );
      } catch (e) {
        if ((e as Error).name === 'AbortError') return null;
        throw e;
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
        setActiveTools([]);
        abortRef.current = null;
      }

      return {
        role: 'assistant',
        content: fullContent,
        toolsUsed,
        model,
        durationMs,
        timestamp: new Date().toISOString(),
      };
    },
    [],
  );

  return { isStreaming, streamingContent, activeTools, send, cancel };
}
