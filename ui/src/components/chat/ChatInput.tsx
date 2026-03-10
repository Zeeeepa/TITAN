import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { Send, Mic } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  voiceAvailable?: boolean;
  onVoiceClick?: () => void;
}

export function ChatInput({ onSend, disabled, voiceAvailable, onVoiceClick }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 6;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    adjustHeight();
  };

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="sticky bottom-0 bg-[#09090b] pt-2 pb-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 bg-[#18181b] border border-[#3f3f46] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#6366f1] focus-within:border-transparent transition-shadow">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Message TITAN..."
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-[#fafafa] placeholder-[#71717a] text-sm resize-none outline-none leading-6 max-h-36 scrollbar-thin"
          />

          <div className="flex items-center gap-1 shrink-0 pb-0.5">
            <button
              type="button"
              onClick={onVoiceClick}
              disabled={!voiceAvailable}
              className={`p-2 rounded-lg transition-colors ${
                voiceAvailable
                  ? 'text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a]'
                  : 'text-[#3f3f46] cursor-not-allowed'
              }`}
              aria-label="Voice input"
              title={voiceAvailable ? 'Voice chat' : 'Voice not configured'}
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="p-2 rounded-lg bg-[#6366f1] text-white hover:bg-[#818cf8] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#6366f1] transition-colors"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
