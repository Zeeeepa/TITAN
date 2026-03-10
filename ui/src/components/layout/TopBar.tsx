import { Link } from 'react-router';
import { Settings } from 'lucide-react';
import { useConfig } from '@/hooks/useConfig';

interface TopBarProps {
  children?: React.ReactNode;
}

export function TopBar({ children }: TopBarProps) {
  const { config, loading } = useConfig();

  const isHealthy = Boolean(config);

  return (
    <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] flex-shrink-0">
      <div className="flex items-center gap-3">
        {children}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isHealthy ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
            }`}
          />
          {loading ? (
            <span className="text-sm text-[var(--text-muted)]">Connecting...</span>
          ) : config ? (
            (() => {
              const model = config.model || config.agent?.model || '';
              // Extract provider from model string (e.g. "ollama/qwen3.5:35b" → "ollama")
              const displayProvider = model.includes('/') ? model.split('/')[0] : (config.provider || config.agent?.provider || 'auto');
              return (
                <span className="text-sm text-[var(--text-secondary)]">
                  {model || 'Unknown model'}{' '}
                  <span className="text-[var(--text-muted)]">via {displayProvider}</span>
                </span>
              );
            })()
          ) : (
            <span className="text-sm text-[var(--error)]">Disconnected</span>
          )}
        </div>
      </div>

      <Link
        to="/settings"
        className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <Settings size={18} />
      </Link>
    </div>
  );
}
