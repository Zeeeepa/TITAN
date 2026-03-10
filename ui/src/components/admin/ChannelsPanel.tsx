import { useEffect, useState } from 'react';
import { getChannels } from '@/api/client';
import type { ChannelInfo } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';

const statusDot: Record<string, string> = {
  connected: 'bg-[#22c55e]',
  disconnected: 'bg-[#71717a]',
  error: 'bg-[#ef4444]',
};

function ChannelsPanel() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getChannels();
        setChannels(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch channels');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const columns: Column<ChannelInfo>[] = [
    { key: 'name', header: 'Name' },
    { key: 'type', header: 'Type' },
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
    {
      key: 'enabled',
      header: 'Enabled',
      render: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.enabled
              ? 'bg-[#22c55e]/10 text-[#22c55e]'
              : 'bg-[#71717a]/10 text-[#71717a]'
          }`}
        >
          {row.enabled ? 'Yes' : 'No'}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#ef4444]/50 bg-[#18181b] p-6 text-center text-[#ef4444]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[#fafafa]">Channels</h2>
      <DataTable columns={columns} data={channels} emptyMessage="No channels configured" />
    </div>
  );
}

export default ChannelsPanel;
