/**
 * TITAN — Memory / Persistence System
 * JSON-file-backed persistent memory for conversations, facts, preferences, and usage.
 * Uses no native dependencies — pure Node.js for maximum portability.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { TITAN_DB_PATH, TITAN_HOME } from '../utils/constants.js';
import { ensureDir } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import { encrypt, decrypt, type EncryptedPayload } from '../security/encryption.js';

const COMPONENT = 'Memory';

// ─── Data Store ──────────────────────────────────────────────────

interface DataStore {
  conversations: ConversationMessage[];
  memories: MemoryEntry[];
  sessions: SessionRecord[];
  usageStats: UsageRecord[];
  cronJobs: CronRecord[];
  skillsInstalled: SkillRecord[];
}

interface MemoryEntry {
  id: string;
  category: string;
  key: string;
  value: string;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionRecord {
  id: string;
  channel: string;
  user_id: string;
  agent_id: string;
  status: string;
  message_count: number;
  created_at: string;
  last_active: string;
}

interface UsageRecord {
  id: number;
  session_id: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string;
}

interface CronRecord {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_at: string;
}

interface SkillRecord {
  name: string;
  version: string;
  source: string;
  enabled: boolean;
  installed_at: string;
}

const DB_FILE = join(TITAN_HOME, 'titan-data.json');

let store: DataStore | null = null;

function getDefaultStore(): DataStore {
  return {
    conversations: [],
    memories: [],
    sessions: [],
    usageStats: [],
    cronJobs: [],
    skillsInstalled: [],
  };
}

function loadStore(): DataStore {
  if (store) return store;
  ensureDir(TITAN_HOME);
  if (existsSync(DB_FILE)) {
    try {
      const raw = readFileSync(DB_FILE, 'utf-8');
      store = JSON.parse(raw) as DataStore;
      // Ensure all fields exist
      store.conversations = store.conversations || [];
      store.memories = store.memories || [];
      store.sessions = store.sessions || [];
      store.usageStats = store.usageStats || [];
      store.cronJobs = store.cronJobs || [];
      store.skillsInstalled = store.skillsInstalled || [];
    } catch {
      logger.warn(COMPONENT, 'Could not load data store, creating fresh one');
      store = getDefaultStore();
    }
  } else {
    store = getDefaultStore();
  }
  return store;
}

function saveStore(): void {
  if (!store) return;
  ensureDir(TITAN_HOME);
  try {
    writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    logger.error(COMPONENT, `Failed to save data: ${(e as Error).message}`);
  }
}

// Auto-save periodically
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveStore, 1000);
}

/** Initialize the memory system */
export function initMemory(): void {
  loadStore();
  logger.info(COMPONENT, 'Memory system initialized');
}

/** Close / flush the memory system */
export function closeMemory(): void {
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  saveStore();
  store = null;
}

/** Get internal store (for skills like cron that need direct access) */
export function getDb(): DataStore {
  return loadStore();
}

// ─── Conversation History ────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  toolCalls?: string;
  toolCallId?: string;
  model?: string;
  tokenCount: number;
  createdAt: string;
  isEncrypted?: boolean;
}

/** Save a message to conversation history */
export function saveMessage(message: Omit<ConversationMessage, 'createdAt'>, e2eKey?: string): void {
  const s = loadStore();

  let content = message.content;
  let isEncrypted = false;

  if (e2eKey) {
    try {
      const payload = encrypt(message.content, Buffer.from(e2eKey, 'base64'));
      content = JSON.stringify(payload);
      isEncrypted = true;
    } catch (e) {
      logger.error(COMPONENT, `Failed to encrypt message for storage`);
      content = "[ENCRYPTION FAILED] " + content; // Fallback, though we should probably throw in strict environments
    }
  }

  s.conversations.push({
    ...message,
    content,
    isEncrypted,
    createdAt: new Date().toISOString(),
  });
  // Keep only last 5000 messages total to prevent unbounded growth
  if (s.conversations.length > 5000) {
    s.conversations = s.conversations.slice(-5000);
  }
  debouncedSave();
}

/** Get conversation history for a session */
export function getHistory(sessionId: string, limit: number = 50, e2eKey?: string): ConversationMessage[] {
  const s = loadStore();
  const rawHistory = s.conversations
    .filter((m) => m.sessionId === sessionId)
    .slice(-limit);

  if (!e2eKey) {
    // If no key is provided, we just return the raw payload. 
    // If it's encrypted, it'll just show the JSON string of the EncryptedPayload.
    return rawHistory;
  }

  // Decrypt the ones that were encrypted
  return rawHistory.map(m => {
    if (m.isEncrypted) {
      try {
        const payload = JSON.parse(m.content) as EncryptedPayload;
        return {
          ...m,
          content: decrypt(payload, Buffer.from(e2eKey, 'base64'))
        };
      } catch (e) {
        logger.error(COMPONENT, `Failed to decrypt message ${m.id}`);
        return { ...m, content: "[DECRYPTION FAILED]" };
      }
    }
    return m;
  });
}

/** Clear conversation history for a session */
export function clearHistory(sessionId: string): void {
  const s = loadStore();
  s.conversations = s.conversations.filter((m) => m.sessionId !== sessionId);
  debouncedSave();
}

// ─── Persistent Memory (Facts / Preferences) ─────────────────────

/** Store a memory (key-value with category) */
export function rememberFact(category: string, key: string, value: string, metadata?: Record<string, unknown>): void {
  const s = loadStore();
  const id = `${category}:${key}`;
  const existingIdx = s.memories.findIndex((m) => m.id === id);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    s.memories[existingIdx].value = value;
    s.memories[existingIdx].metadata = metadata ? JSON.stringify(metadata) : undefined;
    s.memories[existingIdx].updatedAt = now;
  } else {
    s.memories.push({
      id,
      category,
      key,
      value,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
  debouncedSave();
}

/** Recall a specific memory */
export function recallFact(category: string, key: string): string | null {
  const s = loadStore();
  const entry = s.memories.find((m) => m.category === category && m.key === key);
  return entry?.value || null;
}

/** Search memories by category */
export function searchMemories(category?: string, query?: string): Array<{ key: string; value: string; category: string }> {
  const s = loadStore();
  let results = s.memories;

  if (category) {
    results = results.filter((m) => m.category === category);
  }
  if (query) {
    const q = query.toLowerCase();
    results = results.filter((m) =>
      m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
    );
  }

  // Sort by relevance when a query is provided
  if (query) {
    const q = query.toLowerCase();
    results.sort((a, b) => {
      const aScore = (a.key.toLowerCase().includes(q) ? 2 : 0) + (a.value.toLowerCase().includes(q) ? 1 : 0);
      const bScore = (b.key.toLowerCase().includes(q) ? 2 : 0) + (b.value.toLowerCase().includes(q) ? 1 : 0);
      return bScore - aScore;
    });
  }
  return results.slice(0, 50).map((m) => ({ key: m.key, value: m.value, category: m.category }));
}

// ─── Usage Tracking ──────────────────────────────────────────────

/** Record usage statistics */
export function recordUsage(sessionId: string, provider: string, model: string, promptTokens: number, completionTokens: number): void {
  const s = loadStore();
  s.usageStats.push({
    id: Date.now(),
    session_id: sessionId,
    provider,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    created_at: new Date().toISOString(),
  });
  // Keep only last 10000 records
  if (s.usageStats.length > 10000) {
    s.usageStats = s.usageStats.slice(-10000);
  }
  debouncedSave();
}

/** Get total usage statistics */
export function getUsageStats(): { totalTokens: number; totalRequests: number; byProvider: Record<string, number> } {
  const s = loadStore();
  let totalTokens = 0;
  const byProvider: Record<string, number> = {};

  for (const rec of s.usageStats) {
    totalTokens += rec.total_tokens;
    byProvider[rec.provider] = (byProvider[rec.provider] || 0) + rec.total_tokens;
  }

  return {
    totalTokens,
    totalRequests: s.usageStats.length,
    byProvider,
  };
}
