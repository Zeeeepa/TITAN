import type {
  SendMessageResponse,
  Session,
  TitanConfig,
  HealthStatus,
  VoiceHealth,
  SystemStats,
  AgentInfo,
  SkillInfo,
  ToolInfo,
  ChannelInfo,
  MeshPeer,
  LiveKitTokenResponse,
  LogEntry,
  ModelInfo,
  ChatMessage,
  StreamEvent,
} from './types';

const BASE = '';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('titan-token');
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// ---- Chat ----

export async function sendMessage(
  message: string,
  sessionId?: string,
  model?: string,
): Promise<SendMessageResponse> {
  return request('/api/message', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId, model }),
  });
}

export function streamMessage(
  message: string,
  sessionId?: string,
  onEvent?: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(`${BASE}/api/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...authHeaders(),
      },
      body: JSON.stringify({ message, sessionId }),
      signal,
    })
      .then((res) => {
        if (!res.ok) {
          reject(new Error(`${res.status}: ${res.statusText}`));
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          reject(new Error('No response body'));
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';

        function read(): void {
          reader!.read().then(({ done, value }) => {
            if (done) {
              resolve();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  resolve();
                  return;
                }
                try {
                  const event = JSON.parse(data) as StreamEvent;
                  onEvent?.(event);
                } catch {
                  // non-JSON SSE data, treat as token
                  onEvent?.({ type: 'token', data });
                }
              }
            }
            read();
          }).catch(reject);
        }
        read();
      })
      .catch(reject);
  });
}

// ---- Sessions ----

export async function getSessions(): Promise<Session[]> {
  return request('/api/sessions');
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return request(`/api/sessions/${sessionId}/messages`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}

// ---- Config ----

export async function getConfig(): Promise<TitanConfig> {
  return request('/api/config');
}

export async function updateConfig(config: Partial<TitanConfig>): Promise<TitanConfig> {
  return request('/api/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

// ---- Health ----

export async function getHealth(): Promise<HealthStatus> {
  return request('/api/health');
}

export async function getVoiceHealth(): Promise<VoiceHealth> {
  return request('/api/voice/health');
}

// ---- Stats ----

export async function getStats(): Promise<SystemStats> {
  return request('/api/stats');
}

// ---- Agents ----

export async function getAgents(): Promise<AgentInfo[]> {
  return request('/api/agents');
}

export async function spawnAgent(name: string, model?: string): Promise<AgentInfo> {
  return request('/api/agents/spawn', {
    method: 'POST',
    body: JSON.stringify({ name, model }),
  });
}

export async function stopAgent(id: string): Promise<void> {
  await request(`/api/agents/stop`, {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

// ---- Skills ----

export async function getSkills(): Promise<SkillInfo[]> {
  return request('/api/skills');
}

// ---- Tools ----

export async function getTools(): Promise<ToolInfo[]> {
  return request('/api/tools');
}

// ---- Channels ----

export async function getChannels(): Promise<ChannelInfo[]> {
  return request('/api/channels');
}

// ---- Mesh ----

export async function getMeshPeers(): Promise<MeshPeer[]> {
  return request('/api/mesh/peers');
}

export async function getPendingPeers(): Promise<MeshPeer[]> {
  return request('/api/mesh/pending');
}

export async function approvePeer(id: string): Promise<void> {
  await request(`/api/mesh/approve/${id}`, { method: 'POST' });
}

export async function rejectPeer(id: string): Promise<void> {
  await request(`/api/mesh/reject/${id}`, { method: 'POST' });
}

export async function revokePeer(id: string): Promise<void> {
  await request(`/api/mesh/revoke/${id}`, { method: 'POST' });
}

// ---- Voice ----

export async function getLiveKitToken(): Promise<LiveKitTokenResponse> {
  return request('/api/livekit/token', { method: 'POST' });
}

export async function getVoiceStatus(): Promise<{ status: string }> {
  return request('/api/voice/status');
}

// ---- Logs ----

export async function getLogs(level?: string, limit?: number): Promise<LogEntry[]> {
  const params = new URLSearchParams();
  if (level) params.set('level', level);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request(`/api/logs${qs ? `?${qs}` : ''}`);
}

// ---- Models ----

export async function getModels(): Promise<ModelInfo[]> {
  const raw = await request<Record<string, string[]>>('/api/models');
  // API returns { provider: ["provider/model", ...] } — flatten to ModelInfo[]
  const models: ModelInfo[] = [];
  for (const [provider, ids] of Object.entries(raw)) {
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      const name = id.includes('/') ? id.split('/').slice(1).join('/') : id;
      models.push({ id, name, provider, available: true });
    }
  }
  return models;
}

export async function switchModel(modelId: string, provider?: string): Promise<void> {
  await request('/api/model/switch', {
    method: 'POST',
    body: JSON.stringify({ model: modelId, provider }),
  });
}

// ---- Metrics ----

export async function getMetricsSummary(): Promise<Record<string, unknown>> {
  return request('/api/metrics/summary');
}

// ---- Auth ----

export async function login(password: string): Promise<{ token: string }> {
  return request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}
