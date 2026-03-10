import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquarePlus, PanelLeftClose, PanelLeft, Trash2, Menu } from 'lucide-react';
import { useSSE } from '@/hooks/useSSE';
import { getSessions, getSessionMessages, deleteSession } from '@/api/client';
import type { ChatMessage, Session } from '@/api/types';
import { useConfig } from '@/hooks/useConfig';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';
import { ChatInput } from './ChatInput';

function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isStreaming, streamingContent, activeTools, send } = useSSE();
  const { voiceAvailable } = useConfig();

  // Fetch sessions on mount
  useEffect(() => {
    getSessions()
      .then((data) => {
        setSessions(data);
        if (data.length > 0) {
          const latest = data[0];
          setCurrentSessionId(latest.id);
          return getSessionMessages(latest.id);
        }
        return null;
      })
      .then((msgs) => {
        if (msgs) setMessages(msgs);
      })
      .catch(console.error);
  }, []);

  // Auto-scroll on new message or streaming content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent]);

  const loadSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setMobileSidebarOpen(false);
    try {
      const msgs = await getSessionMessages(sessionId);
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(undefined);
    setMessages([]);
    setMobileSidebarOpen(false);
  }, []);

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      try {
        await deleteSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(undefined);
          setMessages([]);
        }
      } catch (err) {
        console.error('Failed to delete session:', err);
      }
    },
    [currentSessionId],
  );

  const handleSend = useCallback(
    async (content: string) => {
      const userMessage: ChatMessage = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const assistantMessage = await send(content, currentSessionId);

      if (assistantMessage) {
        setMessages((prev) => [...prev, assistantMessage]);

        // Refresh sessions list to pick up new/updated session
        try {
          const updated = await getSessions();
          setSessions(updated);
          // If this was a new chat, set the session ID from the first session
          if (!currentSessionId && updated.length > 0) {
            setCurrentSessionId(updated[0].id);
          }
        } catch {
          // non-critical
        }
      }
    },
    [currentSessionId, send],
  );

  const handleVoiceClick = useCallback(() => {
    // Navigate to voice view or open voice modal — placeholder
    window.location.hash = '#voice';
  }, []);

  // Session sidebar content
  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#18181b] border-r border-[#3f3f46]">
      <div className="flex items-center justify-between p-3 border-b border-[#3f3f46]">
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 px-3 py-2 text-sm text-[#fafafa] bg-[#27272a] hover:bg-[#3f3f46] rounded-lg transition-colors w-full"
        >
          <MessageSquarePlus className="w-4 h-4" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => loadSession(session.id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors group flex items-center justify-between gap-2 ${
              session.id === currentSessionId
                ? 'bg-[#27272a] text-[#fafafa]'
                : 'text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa]'
            }`}
          >
            <span className="truncate flex-1">
              {session.name || session.lastMessage?.slice(0, 40) || 'Untitled'}
            </span>
            <button
              onClick={(e) => handleDeleteSession(e, session.id)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all shrink-0"
              aria-label="Delete session"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </button>
        ))}

        {sessions.length === 0 && (
          <p className="text-[#71717a] text-xs text-center mt-4 px-2">No conversations yet</p>
        )}
      </div>
    </div>
  );

  // Empty state
  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-[#6366f1]/10 flex items-center justify-center">
        <span className="text-3xl font-bold text-[#6366f1]">T</span>
      </div>
      <h2 className="text-xl font-semibold text-[#fafafa]">How can I help you today?</h2>
      <p className="text-sm text-[#71717a] max-w-md">
        Ask me anything. I can search the web, run code, use tools, and more.
      </p>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative w-72 h-full z-50">{sidebarContent}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      {sidebarOpen && (
        <div className="hidden lg:flex w-64 shrink-0">{sidebarContent}</div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#3f3f46] shrink-0">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden p-2 text-[#a1a1aa] hover:text-[#fafafa] rounded-lg hover:bg-[#27272a] transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="hidden lg:flex p-2 text-[#a1a1aa] hover:text-[#fafafa] rounded-lg hover:bg-[#27272a] transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-5 h-5" />
            ) : (
              <PanelLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 && !isStreaming ? (
            emptyState
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map((msg, i) => (
                <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
              ))}
              {isStreaming && (
                <StreamingMessage content={streamingContent} activeTools={activeTools} />
              )}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4">
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming}
            voiceAvailable={voiceAvailable}
            onVoiceClick={handleVoiceClick}
          />
        </div>
      </div>
    </div>
  );
}

export default ChatView;
