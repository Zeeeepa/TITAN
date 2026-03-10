import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ChatMessage } from '@/api/types';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%]">
          <div className="bg-[#6366f1] text-[#fafafa] px-4 py-3 rounded-2xl rounded-br-md whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>
          {message.timestamp && (
            <p className="text-[#71717a] text-[11px] mt-1 text-right">
              {formatTimestamp(message.timestamp)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-full w-full">
        <div className="bg-[#27272a] text-[#fafafa] px-4 py-3 rounded-2xl rounded-bl-md text-sm leading-relaxed prose prose-invert prose-sm max-w-none [&_pre]:bg-[#18181b] [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-[#818cf8] [&_a]:text-[#818cf8]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.content}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-[#fafafa] ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>

        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.toolsUsed.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#3f3f46] text-[#a1a1aa]"
              >
                {tool}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1">
          {message.timestamp && (
            <span className="text-[#71717a] text-[11px]">
              {formatTimestamp(message.timestamp)}
            </span>
          )}
          {message.model && (
            <span className="text-[#71717a] text-[11px]">{message.model}</span>
          )}
          {message.durationMs != null && message.durationMs > 0 && (
            <span className="text-[#71717a] text-[11px]">
              {formatDuration(message.durationMs)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
