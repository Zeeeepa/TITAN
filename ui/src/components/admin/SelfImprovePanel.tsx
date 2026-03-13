import { useEffect, useState, useCallback } from 'react';
import {
  Brain,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Zap,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { getConfig, updateConfig } from '@/api/client';

interface ImprovementSession {
  id: string;
  area: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  baselineScore: number;
  bestScore: number;
  experiments: number;
  keeps: number;
  discards: number;
  crashes: number;
  applied: boolean;
}

interface SelfImproveConfig {
  enabled: boolean;
  runsPerDay: number;
  schedule: string[];
  budgetMinutes: number;
  areas: string[];
  autoApply: boolean;
  maxDailyBudgetMinutes: number;
  pauseOnWeekends: boolean;
  notifyOnSuccess: boolean;
}

interface TrainingRun {
  id: string;
  status: string;
  baseModel: string;
  method: string;
  dataPoints: number;
  finalLoss?: number;
}

const AREA_LABELS: Record<string, string> = {
  prompts: 'System Prompts',
  'tool-selection': 'Tool Selection',
  'response-quality': 'Response Quality',
  'error-recovery': 'Error Recovery',
};

const SCHEDULE_PRESETS = [
  { label: 'Once daily (2am)', value: ['0 2 * * *'] },
  { label: 'Twice daily (2am + 2pm)', value: ['0 2 * * *', '0 14 * * *'] },
  { label: 'Three times (2am + 10am + 6pm)', value: ['0 2 * * *', '0 10 * * *', '0 18 * * *'] },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-[#3b82f6]/10 text-[#3b82f6]',
    completed: 'bg-[#22c55e]/10 text-[#22c55e]',
    failed: 'bg-[#ef4444]/10 text-[#ef4444]',
    training: 'bg-[#f59e0b]/10 text-[#f59e0b]',
    deployed: 'bg-[#8b5cf6]/10 text-[#8b5cf6]',
  };
  const dotColors: Record<string, string> = {
    running: 'bg-[#3b82f6]',
    completed: 'bg-[#22c55e]',
    failed: 'bg-[#ef4444]',
    training: 'bg-[#f59e0b]',
    deployed: 'bg-[#8b5cf6]',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-[#52525b]/20 text-[#71717a]'}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColors[status] || 'bg-[#52525b]'}`} />
      {status}
    </span>
  );
}

function SelfImprovePanel() {
  const [config, setConfig] = useState<SelfImproveConfig | null>(null);
  const [history, setHistory] = useState<ImprovementSession[]>([]);
  const [trainingRuns, setTrainingRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Local settings state
  const [runsPerDay, setRunsPerDay] = useState(1);
  const [budgetMinutes, setBudgetMinutes] = useState(30);
  const [maxDailyBudget, setMaxDailyBudget] = useState(120);
  const [autoApply, setAutoApply] = useState(false);
  const [pauseOnWeekends, setPauseOnWeekends] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [schedulePreset, setSchedulePreset] = useState(0);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = await getConfig() as any;
      const si = cfg.selfImprove || {};
      setConfig(si);
      setRunsPerDay(si.runsPerDay || 1);
      setBudgetMinutes(si.budgetMinutes || 30);
      setMaxDailyBudget(si.maxDailyBudgetMinutes || 120);
      setAutoApply(si.autoApply || false);
      setPauseOnWeekends(si.pauseOnWeekends || false);
      setSelectedAreas(si.areas || ['prompts', 'tool-selection', 'response-quality', 'error-recovery']);

      // Match schedule to preset
      const schedule = si.schedule || ['0 2 * * *'];
      const presetIdx = SCHEDULE_PRESETS.findIndex(p => JSON.stringify(p.value) === JSON.stringify(schedule));
      setSchedulePreset(presetIdx >= 0 ? presetIdx : 0);

      // Fetch self-improvement history via API
      try {
        const histRes = await fetch('/api/self-improve/history');
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistory(histData.sessions || []);
        }
      } catch { /* API may not exist yet */ }

      // Fetch training runs
      try {
        const trainRes = await fetch('/api/training/runs');
        if (trainRes.ok) {
          const trainData = await trainRes.json();
          setTrainingRuns(trainData.runs || []);
        }
      } catch { /* API may not exist yet */ }

    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveSettings = async () => {
    try {
      await updateConfig({
        selfImprove: {
          runsPerDay,
          budgetMinutes,
          maxDailyBudgetMinutes: maxDailyBudget,
          autoApply,
          pauseOnWeekends,
          areas: selectedAreas,
          schedule: SCHEDULE_PRESETS[schedulePreset]?.value || ['0 2 * * *'],
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      showToast('success', 'Self-improvement settings saved');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const handleStartRun = async (area: string) => {
    setRunning(area);
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `Run a self-improvement experiment on ${area} using self_improve_start with area="${area}" and budgetMinutes=${budgetMinutes}`,
          sessionId: 'self-improve',
        }),
      });
      if (res.ok) {
        showToast('success', `Self-improvement started for ${AREA_LABELS[area] || area}`);
        setTimeout(loadData, 2000);
      } else {
        showToast('error', 'Failed to start self-improvement');
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setRunning(null);
    }
  };

  const toggleArea = (area: string) => {
    setSelectedAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
        ))}
      </div>
    );
  }

  // Compute aggregate stats
  const totalSessions = history.length;
  const avgImprovement = totalSessions > 0
    ? (history.reduce((sum, s) => sum + (s.bestScore - s.baselineScore), 0) / totalSessions).toFixed(1)
    : '0';
  const successRate = totalSessions > 0
    ? ((history.filter(s => s.bestScore > s.baselineScore).length / totalSessions) * 100).toFixed(0)
    : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8b5cf6]/10">
            <Brain className="h-4 w-4 text-[#a78bfa]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#fafafa]">Self-Improvement</h1>
            <p className="text-xs text-[#52525b]">Autonomous optimization of prompts, tool selection, and response quality</p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-lg border border-[#3f3f46] px-3 py-1.5 text-xs text-[#a1a1aa] transition-colors hover:bg-[#27272a]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
          toast.type === 'success'
            ? 'border-[#22c55e]/50 text-[#22c55e]'
            : 'border-[#ef4444]/50 text-[#ef4444]'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-4">
          <p className="text-xs text-[#52525b]">Total Sessions</p>
          <p className="text-2xl font-bold text-[#fafafa] mt-1">{totalSessions}</p>
        </div>
        <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-4">
          <p className="text-xs text-[#52525b]">Avg Improvement</p>
          <p className="text-2xl font-bold text-[#22c55e] mt-1">+{avgImprovement}</p>
        </div>
        <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-4">
          <p className="text-xs text-[#52525b]">Success Rate</p>
          <p className="text-2xl font-bold text-[#3b82f6] mt-1">{successRate}%</p>
        </div>
        <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-4">
          <p className="text-xs text-[#52525b]">Status</p>
          <p className="text-2xl font-bold text-[#fafafa] mt-1">{config?.enabled !== false ? 'Active' : 'Off'}</p>
        </div>
      </div>

      {/* Quick Actions — Run Now */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#52525b] mb-3">Run Now</p>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(AREA_LABELS).map(([id, label]) => (
            <button
              key={id}
              onClick={() => handleStartRun(id)}
              disabled={running !== null}
              className="flex items-center gap-3 rounded-xl border border-[#27272a] bg-[#18181b] p-4 text-left transition-colors hover:border-[#8b5cf6]/50 hover:bg-[#1f1f23] disabled:opacity-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8b5cf6]/10">
                {running === id ? (
                  <RefreshCw className="h-4 w-4 text-[#a78bfa] animate-spin" />
                ) : (
                  <Play className="h-4 w-4 text-[#a78bfa]" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-[#fafafa]">{label}</p>
                <p className="text-xs text-[#52525b]">{running === id ? 'Running...' : 'Start experiment'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Schedule Settings */}
      <div>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex w-full items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#52525b] mb-3"
        >
          {settingsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Settings className="h-3.5 w-3.5" />
          Schedule Settings
        </button>

        {settingsOpen && (
          <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-6 space-y-5">
            {/* Runs per day */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#71717a]">Runs per day</span>
                <span className="text-sm font-medium text-[#fafafa]">{runsPerDay}</span>
              </label>
              <input
                type="range"
                min={1}
                max={12}
                value={runsPerDay}
                onChange={(e) => setRunsPerDay(Number(e.target.value))}
                className="w-full accent-[#8b5cf6]"
              />
              <div className="flex justify-between text-[10px] text-[#52525b] mt-1">
                <span>1</span><span>6</span><span>12</span>
              </div>
            </div>

            {/* Schedule preset */}
            <div>
              <label className="mb-1 block text-xs text-[#71717a]">Schedule</label>
              <select
                value={schedulePreset}
                onChange={(e) => setSchedulePreset(Number(e.target.value))}
                className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none"
              >
                {SCHEDULE_PRESETS.map((preset, i) => (
                  <option key={i} value={i}>{preset.label}</option>
                ))}
              </select>
            </div>

            {/* Budget per run */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#71717a]">Budget per run (minutes)</span>
                <span className="text-sm font-medium text-[#fafafa]">{budgetMinutes} min</span>
              </label>
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={budgetMinutes}
                onChange={(e) => setBudgetMinutes(Number(e.target.value))}
                className="w-full accent-[#8b5cf6]"
              />
              <div className="flex justify-between text-[10px] text-[#52525b] mt-1">
                <span>5 min</span><span>60 min</span><span>120 min</span>
              </div>
            </div>

            {/* Max daily budget */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#71717a]">Max daily budget (minutes)</span>
                <span className="text-sm font-medium text-[#fafafa]">{maxDailyBudget} min</span>
              </label>
              <input
                type="range"
                min={30}
                max={480}
                step={30}
                value={maxDailyBudget}
                onChange={(e) => setMaxDailyBudget(Number(e.target.value))}
                className="w-full accent-[#8b5cf6]"
              />
            </div>

            {/* Areas toggle */}
            <div>
              <label className="mb-2 block text-xs text-[#71717a]">Improvement areas</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(AREA_LABELS).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => toggleArea(id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedAreas.includes(id)
                        ? 'bg-[#8b5cf6] text-white'
                        : 'bg-[#27272a] text-[#71717a] hover:text-[#a1a1aa]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-xs text-[#71717a]">Auto-apply improvements</span>
                <button
                  onClick={() => setAutoApply(!autoApply)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${autoApply ? 'bg-[#8b5cf6]' : 'bg-[#3f3f46]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoApply ? 'translate-x-4' : ''}`} />
                </button>
              </label>
              <label className="flex items-center justify-between">
                <span className="text-xs text-[#71717a]">Pause on weekends</span>
                <button
                  onClick={() => setPauseOnWeekends(!pauseOnWeekends)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${pauseOnWeekends ? 'bg-[#8b5cf6]' : 'bg-[#3f3f46]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${pauseOnWeekends ? 'translate-x-4' : ''}`} />
                </button>
              </label>
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveSettings}
                className="flex items-center gap-2 rounded-lg bg-[#8b5cf6] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#8b5cf6]/80"
              >
                Save Settings
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Session History */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#52525b] mb-3">Session History</p>
          <div className="rounded-xl border border-[#27272a] bg-[#18181b] overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#27272a]">
                  <th className="px-4 py-2.5 text-xs font-medium text-[#52525b]">Date</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[#52525b]">Area</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[#52525b]">Baseline</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[#52525b]">Best</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[#52525b]">+Δ</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[#52525b]">K/D/C</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[#52525b]">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().slice(0, 10).map((session) => {
                  const imp = session.bestScore - session.baselineScore;
                  return (
                    <tr key={session.id} className="border-b border-[#27272a] last:border-0">
                      <td className="px-4 py-2.5 text-xs text-[#a1a1aa]">
                        {session.startedAt.slice(0, 10)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#fafafa]">
                        {AREA_LABELS[session.area] || session.area}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#71717a]">{session.baselineScore}</td>
                      <td className="px-4 py-2.5 text-xs text-[#fafafa] font-medium">{session.bestScore}</td>
                      <td className={`px-4 py-2.5 text-xs font-medium ${imp > 0 ? 'text-[#22c55e]' : 'text-[#71717a]'}`}>
                        {imp > 0 ? '+' : ''}{imp}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#71717a]">
                        {session.keeps}/{session.discards}/{session.crashes}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={session.applied ? 'deployed' : session.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Training Runs */}
      {trainingRuns.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#52525b] mb-3">Model Training</p>
          <div className="space-y-2">
            {trainingRuns.slice().reverse().slice(0, 5).map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-xl border border-[#27272a] bg-[#18181b] px-4 py-3">
                <div className="flex items-center gap-3">
                  <Zap className="h-4 w-4 text-[#f59e0b]" />
                  <div>
                    <p className="text-sm font-medium text-[#fafafa]">{run.id}</p>
                    <p className="text-xs text-[#52525b]">{run.baseModel} • {run.dataPoints} samples • {run.method}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {run.finalLoss !== undefined && (
                    <span className="text-xs text-[#71717a]">loss: {run.finalLoss.toFixed(4)}</span>
                  )}
                  <StatusBadge status={run.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SelfImprovePanel;
