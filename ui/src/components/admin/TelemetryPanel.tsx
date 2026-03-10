import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { getMetricsSummary } from '@/api/client';
import { StatCard } from '@/components/shared/StatCard';

function TelemetryPanel() {
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    try {
      const data = await getMetricsSummary();
      setMetrics(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#ef4444]/50 bg-[#18181b] p-6 text-center text-[#ef4444]">
        {error}
      </div>
    );
  }

  if (!metrics) return null;

  // Render metrics as StatCards from the summary object
  const entries = Object.entries(metrics).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-[#fafafa]">Telemetry</h2>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-12 text-center text-[#71717a]">
          No metrics available
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {entries.map(([key, value]) => (
            <StatCard
              key={key}
              title={key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()}
              value={typeof value === 'number' ? value.toLocaleString() : String(value)}
              icon={<BarChart3 className="h-5 w-5" />}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TelemetryPanel;
