import { useEffect, useState } from 'react';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
import { getConfig, updateConfig, getModels, switchModel } from '@/api/client';
import type { TitanConfig, ModelInfo } from '@/api/types';

function SettingsPanel() {
  const [config, setConfig] = useState<TitanConfig | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Voice form state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [livekitUrl, setLivekitUrl] = useState('');
  const [ttsVoice, setTtsVoice] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [cfg, mdls] = await Promise.all([getConfig(), getModels()]);
        setConfig(cfg);
        setModels(mdls);
        setSelectedModel(cfg.model);
        setVoiceEnabled(cfg.voice?.enabled ?? false);
        setLivekitUrl(cfg.voice?.livekitUrl ?? '');
        setTtsVoice(cfg.voice?.ttsVoice ?? '');
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : 'Failed to load config');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSwitchModel = async () => {
    if (!selectedModel || selectedModel === config?.model) return;
    try {
      const model = models.find((m) => m.id === selectedModel);
      await switchModel(selectedModel, model?.provider);
      const cfg = await getConfig();
      setConfig(cfg);
      showToast('success', `Switched to ${selectedModel}`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to switch model');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateConfig({
        voice: {
          enabled: voiceEnabled,
          livekitUrl,
          ttsVoice,
          livekitApiKey: config?.voice?.livekitApiKey ?? '',
          livekitApiSecret: config?.voice?.livekitApiSecret ?? '',
          agentUrl: config?.voice?.agentUrl ?? '',
        },
      });
      setConfig(updated);
      showToast('success', 'Settings saved');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-[#fafafa]">Settings</h2>

      {toast && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
            toast.type === 'success'
              ? 'border-[#22c55e]/50 text-[#22c55e]'
              : 'border-[#ef4444]/50 text-[#ef4444]'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* Model Section */}
      <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-6">
        <h3 className="mb-4 text-sm font-medium text-[#a1a1aa]">Model</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[#71717a]">Current Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.name} ({m.provider}){!m.available ? ' - unavailable' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSwitchModel}
            disabled={selectedModel === config?.model}
            className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6366f1]/80 disabled:opacity-50"
          >
            Switch
          </button>
        </div>
      </div>

      {/* Provider Section */}
      <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-6">
        <h3 className="mb-4 text-sm font-medium text-[#a1a1aa]">Provider</h3>
        <p className="text-sm text-[#fafafa]">{config?.provider ?? 'Unknown'}</p>
      </div>

      {/* Voice Section */}
      <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-6">
        <h3 className="mb-4 text-sm font-medium text-[#a1a1aa]">Voice</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-[#3f3f46] accent-[#6366f1]"
            />
            <span className="text-sm text-[#fafafa]">Enable Voice</span>
          </label>

          <div>
            <label className="mb-1 block text-xs text-[#71717a]">LiveKit URL</label>
            <input
              value={livekitUrl}
              onChange={(e) => setLivekitUrl(e.target.value)}
              placeholder="wss://your-livekit-server.com"
              className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#71717a]">TTS Voice</label>
            <input
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              placeholder="e.g. alloy"
              className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6366f1]/80 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

export default SettingsPanel;
