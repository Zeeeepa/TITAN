import { useEffect, useState } from 'react';
import { Save, CheckCircle, AlertCircle, Mic } from 'lucide-react';
import { getConfig, updateConfig, getVoiceHealth } from '@/api/client';
import type { VoiceConfig, VoiceHealth } from '@/api/types';

function VoiceSettingsPanel() {
  const [voice, setVoice] = useState<VoiceConfig>({
    enabled: false,
    livekitUrl: '',
    livekitApiKey: '',
    livekitApiSecret: '',
    agentUrl: '',
    ttsVoice: 'default',
    ttsEngine: 'tada',
    ttsUrl: 'http://localhost:48421',
    sttUrl: 'http://localhost:8300',
  });
  const [voices, setVoices] = useState<string[]>(['default']);
  const [health, setHealth] = useState<VoiceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [cfg, h] = await Promise.allSettled([getConfig(), getVoiceHealth()]);
        if (cfg.status === 'fulfilled' && cfg.value.voice) {
          setVoice(cfg.value.voice);
        }
        if (h.status === 'fulfilled') {
          setHealth(h.value);
        }
        // Fetch available TADA voices from the voice server
        try {
          const res = await fetch('/api/voice/voices');
          if (res.ok) {
            const data = await res.json();
            if (data.voices?.length) setVoices(data.voices);
          }
        } catch { /* voice server may be offline */ }
      } catch {
        // ignore
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig({ voice });
      showToast('success', 'Voice settings saved');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof VoiceConfig, value: string | boolean) => {
    setVoice((prev) => ({ ...prev, [field]: value }));
  };

  const healthDot = (ok: boolean) => (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Mic className="h-5 w-5 text-[#6366f1]" />
        <h2 className="text-lg font-semibold text-[#fafafa]">Voice Settings</h2>
        <span className="rounded-full bg-[#6366f1]/20 px-2 py-0.5 text-xs font-medium text-[#a78bfa]">TADA</span>
      </div>

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

      {/* Health Status */}
      {health && (
        <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-4">
          <h3 className="mb-3 text-sm font-medium text-[#a1a1aa]">Service Health</h3>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ['LiveKit', health.livekit],
                ['STT', health.stt],
                ['TTS (TADA)', health.tts],
                ['Agent', health.agent],
              ] as const
            ).map(([name, ok]) => (
              <span key={name} className="flex items-center gap-2 text-sm text-[#fafafa]">
                {healthDot(ok as boolean)}
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Enable toggle */}
      <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-6">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={voice.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="h-4 w-4 rounded border-[#3f3f46] accent-[#6366f1]"
          />
          <span className="text-sm text-[#fafafa]">Enable Voice</span>
        </label>
        <p className="mt-2 text-xs text-[#52525b]">
          Powered by Hume AI TADA — 0.09 RTF, zero hallucinations, voice cloning
        </p>
      </div>

      {/* Voice selector */}
      <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-6 space-y-4">
        <h3 className="text-sm font-medium text-[#a1a1aa]">Voice</h3>
        <div className="grid grid-cols-4 gap-2">
          {voices.map((v) => (
            <button
              key={v}
              onClick={() => update('ttsVoice', v)}
              className={`rounded-lg border px-3 py-2 text-sm transition-all capitalize ${
                voice.ttsVoice === v
                  ? 'border-[#6366f1] bg-[#6366f1]/10 text-[#fafafa]'
                  : 'border-[#3f3f46] text-[#a1a1aa] hover:border-[#52525b] hover:text-[#fafafa]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#52525b]">
          Add custom voices by placing WAV reference files in ~/.titan/voices/ (e.g., tony.wav → voice &quot;tony&quot;)
        </p>
      </div>

      {/* Connection fields */}
      <div className="space-y-4 rounded-xl border border-[#3f3f46] bg-[#18181b] p-6">
        <h3 className="text-sm font-medium text-[#a1a1aa]">Connection</h3>

        <div>
          <label className="mb-1 block text-xs text-[#71717a]">TTS URL</label>
          <input
            value={voice.ttsUrl || ''}
            onChange={(e) => update('ttsUrl', e.target.value)}
            placeholder="http://localhost:48421"
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-[#71717a]">STT URL</label>
          <input
            value={voice.sttUrl || ''}
            onChange={(e) => update('sttUrl', e.target.value)}
            placeholder="http://localhost:8300"
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-[#71717a]">LiveKit URL</label>
          <input
            value={voice.livekitUrl}
            onChange={(e) => update('livekitUrl', e.target.value)}
            placeholder="ws://localhost:7880"
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-[#71717a]">LiveKit API Key</label>
          <input
            value={voice.livekitApiKey}
            onChange={(e) => update('livekitApiKey', e.target.value)}
            placeholder="API key"
            type="password"
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-[#71717a]">LiveKit API Secret</label>
          <input
            value={voice.livekitApiSecret}
            onChange={(e) => update('livekitApiSecret', e.target.value)}
            placeholder="API secret"
            type="password"
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-[#71717a]">Agent URL</label>
          <input
            value={voice.agentUrl}
            onChange={(e) => update('agentUrl', e.target.value)}
            placeholder="http://localhost:8081"
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#6366f1]"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6366f1]/80 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Voice Settings'}
      </button>
    </div>
  );
}

export default VoiceSettingsPanel;
