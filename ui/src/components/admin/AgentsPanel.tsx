import { useEffect, useState } from 'react';
import { Plus, Square } from 'lucide-react';
import { getAgents, spawnAgent, stopAgent } from '@/api/client';
import type { AgentInfo } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';

const statusDot: Record<string, string> = {
  running: 'bg-[#22c55e]',
  error: 'bg-[#ef4444]',
  stopped: 'bg-[#71717a]',
};

function AgentsPanel() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('');
  const [spawning, setSpawning] = useState(false);

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      setAgents(data.agents);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleSpawn = async () => {
    if (!newName.trim()) return;
    setSpawning(true);
    try {
      await spawnAgent(newName.trim(), newModel.trim() || undefined);
      setNewName('');
      setNewModel('');
      setShowForm(false);
      await fetchAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to spawn agent');
    } finally {
      setSpawning(false);
    }
  };

  const handleStop = async (id: string) => {
    try {
      await stopAgent(id);
      await fetchAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop agent');
    }
  };

  const columns: Column<AgentInfo>[] = [
    { key: 'name', header: 'Name' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${statusDot[row.status] ?? 'bg-[#71717a]'}`} />
          <span className="capitalize">{row.status}</span>
        </span>
      ),
    },
    { key: 'model', header: 'Model', render: (row) => <span>{row.model ?? '-'}</span> },
    { key: 'messageCount', header: 'Messages' },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => <span>{new Date(row.createdAt).toLocaleString()}</span>,
    },
    {
      key: '_actions',
      header: '',
      className: 'w-16',
      render: (row) =>
        row.status === 'running' ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStop(row.id);
            }}
            className="rounded-md p-1.5 text-[#ef4444] transition-colors hover:bg-[#27272a]"
            title="Stop agent"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : null,
    },
  ];

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#fafafa]">Agents</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-[#6366f1] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#6366f1]/80"
        >
          <Plus className="h-4 w-4" />
          Spawn Agent
        </button>
      </div>

      {showForm && (
        <div className="flex items-end gap-3 rounded-xl border border-[#3f3f46] bg-[#18181b] p-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[#a1a1aa]">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Agent name"
              className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[#a1a1aa]">Model (optional)</label>
            <input
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="e.g. gpt-4o"
              className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
            />
          </div>
          <button
            onClick={handleSpawn}
            disabled={spawning || !newName.trim()}
            className="rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#22c55e]/80 disabled:opacity-50"
          >
            {spawning ? 'Spawning...' : 'Create'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#ef4444]/50 bg-[#18181b] px-4 py-2 text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      <DataTable columns={columns} data={agents} emptyMessage="No agents running" />
    </div>
  );
}

export default AgentsPanel;
