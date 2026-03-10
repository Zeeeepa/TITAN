import { useState, useEffect } from 'react';
import { Brain, RefreshCw } from 'lucide-react';

function LearningPanel() {
  const [data, setData] = useState<{ memories: number; teaches: number; profile: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Learning data from /api/learning or /api/stats
    fetch('/api/stats', { headers: { 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(d => setData({ memories: d.memories || 0, teaches: d.teaches || 0, profile: d.userProfile || {} }))
      .catch(() => setData({ memories: 0, teaches: 0, profile: {} }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[var(--text-muted)]">Loading learning data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="w-6 h-6 text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text)]">Learning &amp; Memory</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-sm text-[var(--text-muted)]">Memories Stored</p>
          <p className="text-2xl font-bold text-[var(--text)]">{data?.memories ?? 0}</p>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-sm text-[var(--text-muted)]">Teaching Interactions</p>
          <p className="text-2xl font-bold text-[var(--text)]">{data?.teaches ?? 0}</p>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-sm text-[var(--text-muted)]">User Profile Fields</p>
          <p className="text-2xl font-bold text-[var(--text)]">{Object.keys(data?.profile || {}).length}</p>
        </div>
      </div>
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">User Profile</h2>
        <pre className="text-xs text-[var(--text-muted)] overflow-auto">{JSON.stringify(data?.profile, null, 2)}</pre>
      </div>
    </div>
  );
}

export default LearningPanel;
