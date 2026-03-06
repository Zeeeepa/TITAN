/**
 * TITAN — Gateway Server
 * WebSocket + HTTP server: the control plane for all channels, agents, tools, and the web UI.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import net from 'net';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes, timingSafeEqual } from 'crypto';
import { exec } from 'child_process';
import fs from 'fs';
import { loadConfig, updateConfig } from '../config/config.js';
import { loadProfile, saveProfile, type PersonalProfile } from '../memory/relationship.js';
import { processMessage } from '../agent/agent.js';
import { initMemory, getUsageStats, getHistory } from '../memory/memory.js';
import { initBuiltinSkills, getSkills } from '../skills/registry.js';
import { getRegisteredTools } from '../agent/toolRunner.js';
import { listSessions } from '../agent/session.js';
import { healthCheckAll, discoverAllModels, getModelAliases, chatStream } from '../providers/router.js';
import { auditSecurity } from '../security/sandbox.js';
import { WebChatChannel } from '../channels/webchat.js';
import { DiscordChannel } from '../channels/discord.js';
import { TelegramChannel } from '../channels/telegram.js';
import { SlackChannel } from '../channels/slack.js';
import { GoogleChatChannel } from '../channels/googlechat.js';
import { WhatsAppChannel } from '../channels/whatsapp.js';
import { MatrixChannel } from '../channels/matrix.js';
import { SignalChannel } from '../channels/signal.js';
import { MSTeamsChannel } from '../channels/msteams.js';
import { initAgents, routeMessage, listAgents, spawnAgent, stopAgent, getAgentCapacity } from '../agent/multiAgent.js';
import type { ChannelAdapter, InboundMessage } from '../channels/base.js';
import logger, { initFileLogger } from '../utils/logger.js';
import { TITAN_VERSION, TITAN_NAME, TITAN_LOGS_DIR } from '../utils/constants.js';
import { getUpdateInfo } from '../utils/updater.js';
import { getMissionControlHTML } from './dashboard.js';
import { initSlashCommands, handleSlashCommand } from './slashCommands.js';
import { initMcpServers } from '../mcp/registry.js';
import { initMonitors, setMonitorTriggerHandler } from '../agent/monitor.js';
import { seedBuiltinRecipes } from '../recipes/store.js';
import { parseSlashCommand, runRecipe } from '../recipes/runner.js';
import { initModelSwitchTool } from '../skills/builtin/model_switch.js';
import { getCostStatus } from '../agent/costOptimizer.js';
import { initLearning, getLearningStats } from '../memory/learning.js';
import { initGraph, getGraphData, getGraphStats, clearGraph } from '../memory/graph.js';
import { getLogFilePath } from '../utils/logger.js';
import { closeSession } from '../agent/session.js';
import { initCronScheduler } from '../skills/builtin/cron.js';
import { checkAndSendBriefing } from '../memory/briefing.js';
import { initPersistentWebhooks } from '../skills/builtin/webhook.js';
import { invalidateCacheForModel } from '../agent/responseCache.js';
import { initAutopilot, stopAutopilot, runAutopilotNow, getAutopilotStatus, getRunHistory } from '../agent/autopilot.js';
import { startTunnel, stopTunnel, getTunnelStatus } from '../utils/tunnel.js';
import { getConsentUrl, exchangeCode, isGoogleConnected, getGoogleEmail, disconnectGoogle } from '../auth/google.js';
import { TITAN_WORKSPACE } from '../utils/constants.js';

const COMPONENT = 'Gateway';

/** Fields that require a gateway restart to take effect */
const RESTART_REQUIRED_PATTERNS = ['channels.*', 'gateway.auth.*', 'logging.level'];

/** Module-level HTTP server reference (allows stopGateway to close it) */
let httpServer: ReturnType<typeof createServer> | null = null;

/** Interval IDs for cleanup on shutdown */
let tokenCleanupInterval: ReturnType<typeof setInterval> | null = null;
let rateLimitCleanupInterval: ReturnType<typeof setInterval> | null = null;
let activeLlmRequests = 0;
let maxConcurrentOverride: number | null = null;

export function stopGateway(): Promise<void> {
    return new Promise((resolve) => {
        // Clear intervals to release the event loop
        if (tokenCleanupInterval) { clearInterval(tokenCleanupInterval); tokenCleanupInterval = null; }
        if (rateLimitCleanupInterval) { clearInterval(rateLimitCleanupInterval); rateLimitCleanupInterval = null; }

        if (httpServer) {
            httpServer.close(() => { httpServer = null; resolve(); });
        } else {
            resolve();
        }
    });
}

/** Active session tokens (in-memory, cleared on restart) */
const authTokens = new Map<string, { createdAt: number }>();

// Clean expired tokens every 10 minutes
tokenCleanupInterval = setInterval(() => {
    const now = Date.now();
    const ttlMs = 24 * 60 * 60 * 1000;
    for (const [tok, entry] of authTokens) {
        if (now - entry.createdAt > ttlMs) authTokens.delete(tok);
    }
}, 600_000);
tokenCleanupInterval.unref();

/** Constant-time string comparison to prevent timing attacks */
function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Check if a request token is valid */
function isValidToken(token: string | undefined, config: ReturnType<typeof loadConfig>): boolean {
  const auth = config.gateway.auth;
  if (!auth || auth.mode === 'none') return true;
  if (!token) return false;
  if (auth.mode === 'token') return auth.token ? safeCompare(token, auth.token) : false;
  if (auth.mode === 'password') {
    const entry = authTokens.get(token);
    if (!entry) return false;
    const ttlMs = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - entry.createdAt > ttlMs) {
        authTokens.delete(token);
        return false;
    }
    return true;
  }
  return false;
}

/** Login page HTML */
function getLoginHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TITAN — Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@keyframes gradientBg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes shake{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-4px)}20%,40%,60%,80%{transform:translateX(4px)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;background:linear-gradient(135deg,#0a0e1a 0%,#0f172a 25%,#1a1040 50%,#0f172a 75%,#0a0e1a 100%);background-size:400% 400%;animation:gradientBg 15s ease infinite;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:rgba(17,24,39,0.85);backdrop-filter:blur(20px);border:1px solid rgba(42,48,80,0.6);border-radius:16px;padding:40px;width:380px;box-shadow:0 0 40px rgba(6,182,212,.1),0 0 80px rgba(139,92,246,.05);animation:fadeIn .6s ease-out}
.box.shake{animation:shake .5s ease}
h1{font-size:28px;font-weight:700;background:linear-gradient(90deg,#06b6d4,#8b5cf6,#06b6d4);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 3s linear infinite;text-align:center;letter-spacing:3px;margin-bottom:4px}
.sub{text-align:center;color:#94a3b8;font-size:13px;margin-bottom:32px}
label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px}
input{width:100%;background:rgba(26,31,54,0.8);border:1px solid #2a3050;border-radius:10px;padding:12px 16px;color:#e2e8f0;font-size:15px;outline:none;transition:border .2s,box-shadow .2s}
input:focus{border-color:#06b6d4;box-shadow:0 0 12px rgba(6,182,212,.2)}
button{width:100%;margin-top:20px;background:linear-gradient(135deg,#06b6d4,#8b5cf6);border:none;border-radius:10px;padding:14px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .1s}
button:hover{opacity:.9;transform:translateY(-1px)}
button:active{transform:translateY(0)}
.error{color:#ef4444;font-size:13px;margin-top:12px;text-align:center;display:none}
</style>
</head>
<body>
<div class="box">
  <h1>⚡ TITAN</h1>
  <div class="sub">Mission Control</div>
  <label>Password</label>
  <input type="password" id="pw" placeholder="Enter gateway password" onkeydown="if(event.key==='Enter')login()"/>
  <button onclick="login()">Unlock</button>
  <div class="error" id="err">Incorrect password. Try again.</div>
</div>
<script>
async function login() {
  const pw = document.getElementById('pw').value;
  const res = await fetch('/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
  if (res.ok) {
    const {token} = await res.json();
    localStorage.setItem('titan_token', token);
    location.href = '/';
  } else {
    document.getElementById('err').style.display = 'block';
    document.getElementById('pw').value = '';
    document.getElementById('pw').focus();
    const box = document.querySelector('.box');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }
}
document.getElementById('pw').focus();
</script>
</body>
</html>`;
}

/** All active channel adapters */
const channels: Map<string, ChannelAdapter> = new Map();

/** All connected WebSocket clients */
const wsClients: Set<WebSocket> = new Set();

/** The WebChat channel instance */
let webChatChannel: WebChatChannel | null = null;

/** Broadcast a message to all WebSocket clients */
function broadcast(data: Record<string, unknown>): void {
  const json = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

/** Handle an inbound message from any channel */
async function handleInboundMessage(msg: InboundMessage): Promise<void> {
  logger.info(COMPONENT, `[${msg.channel}] ${msg.userName || msg.userId}: ${msg.content.slice(0, 100)}`);

  // Broadcast to WebSocket clients for UI
  broadcast({
    type: 'message',
    direction: 'inbound',
    channel: msg.channel,
    userId: msg.userId,
    userName: msg.userName,
    content: msg.content,
    timestamp: msg.timestamp.toISOString(),
  });

  // ── Native slash commands (highest priority) ──────────────────
  const slashResult = await handleSlashCommand(msg.content, msg.channel, msg.userId);
  if (slashResult) {
    const channel = channels.get(msg.channel);
    if (channel) await channel.send({ channel: msg.channel, userId: msg.userId, groupId: msg.groupId, content: slashResult.response, replyTo: msg.id });
    broadcast({ type: 'message', direction: 'outbound', channel: msg.channel, userId: msg.userId, content: slashResult.response, timestamp: new Date().toISOString() });
    return;
  }

  // ── Recipe slash commands (second priority) ──────────────────
  const slash = parseSlashCommand(msg.content);
  if (slash) {
    const { command, args } = slash;
    const params: Record<string, string> = {};
    if (args) { params['file'] = args; params['topic'] = args; params['error'] = args; }
    try {
      let fullResponse = '';
      for await (const step of runRecipe(command, params)) {
        const r = await processMessage(step.prompt, msg.channel, msg.userId);
        fullResponse += (fullResponse ? '\n\n' : '') + r.content;
      }
      const channel = channels.get(msg.channel);
      if (channel) await channel.send({ channel: msg.channel, userId: msg.userId, groupId: msg.groupId, content: fullResponse, replyTo: msg.id });
      broadcast({ type: 'message', direction: 'outbound', channel: msg.channel, userId: msg.userId, content: fullResponse, timestamp: new Date().toISOString() });
      return;
    } catch {
      // Recipe not found — fall through to normal processing
    }
  }

  try {
    // Route through multi-agent system
    const response = await routeMessage(msg.content, msg.channel, msg.userId);

    // Send response back to the channel
    const channel = channels.get(msg.channel);
    if (channel) {
      await channel.send({
        channel: msg.channel,
        userId: msg.userId,
        groupId: msg.groupId,
        content: response.content,
        replyTo: msg.id,
      });
    }

    // Broadcast response to UI
    broadcast({
      type: 'message',
      direction: 'outbound',
      channel: msg.channel,
      userId: msg.userId,
      content: response.content,
      toolsUsed: response.toolsUsed,
      tokenUsage: response.tokenUsage,
      durationMs: response.durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(COMPONENT, `Error processing message: ${(error as Error).message}`);
    broadcast({ type: 'error', message: (error as Error).message });
  }
}

/** Start the Gateway server */
export async function startGateway(options?: { port?: number; host?: string; verbose?: boolean }): Promise<void> {
  const config = loadConfig();
  initFileLogger(TITAN_LOGS_DIR);
  const port = options?.port || config.gateway.port;
  let host = options?.host || config.gateway.host;

  logger.info(COMPONENT, `Starting ${TITAN_NAME} Gateway v${TITAN_VERSION}`);

  // ── Port pre-check: fail fast before loading subsystems ────
  const portAvailable = await new Promise<boolean>((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => { tester.close(); resolve(true); });
    tester.listen(port, host);
  });
  if (!portAvailable) {
    logger.error(COMPONENT, `Port ${port} is already in use. Is TITAN already running?`);
    logger.info(COMPONENT, `Try: titan gateway --port ${port + 1}`);
    process.exit(1);
  }

  // ── GPU detection: adjust stall timeout for CPU-only inference ──
  const { detectGpu } = await import('../utils/hardware.js');
  if (!detectGpu()) {
    const { setStallThreshold } = await import('../agent/stallDetector.js');
    setStallThreshold(120_000);
    logger.info(COMPONENT, 'No GPU detected — stall timeout increased to 120s for CPU inference');
    maxConcurrentOverride = 2;
    logger.info(COMPONENT, 'CPU-only mode: maxConcurrentTasks auto-tuned to 2');
  }

  // Initialize subsystems
  initMemory();
  initLearning();
  initGraph();
  await initBuiltinSkills();
  initAgents();

  // ── Rate limiter (inline, no deps) ─────────────────────────
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

  function rateLimit(windowMs: number, maxRequests: number) {
      return (req: Request, res: Response, next: NextFunction) => {
          const key = req.ip || req.socket?.remoteAddress || 'unknown';
          const now = Date.now();
          const entry = rateLimitStore.get(key);
          if (!entry || now > entry.resetAt) {
              rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
              next();
          } else if (entry.count < maxRequests) {
              entry.count++;
              next();
          } else {
              res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
              res.status(429).json({ error: 'Too many requests' });
          }
      };
  }

  // Clean rate limit store every 60 seconds
  rateLimitCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of rateLimitStore) {
          if (now > entry.resetAt) rateLimitStore.delete(key);
      }
  }, 60_000);

  // Create Express app
  const app = express();
  app.use(express.json());

  // Security headers
  app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.removeHeader('X-Powered-By');
      next();
  });

  // CORS — allowlist only localhost origins
  const gatewayPort = config.gateway.port || 48420;
  const allowedOrigins = new Set([
      `http://127.0.0.1:${gatewayPort}`,
      `http://localhost:${gatewayPort}`,
      `https://127.0.0.1:${gatewayPort}`,
      `https://localhost:${gatewayPort}`,
  ]);
  app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.has(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
      next();
  });

  // ── Login routes (no auth required) ──────────────────────────
  app.get('/login', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getLoginHTML());
  });

  app.post('/api/login', rateLimit(60000, 5), (req, res) => {
    const cfg = loadConfig();
    const auth = cfg.gateway.auth;
    if (!auth || auth.mode === 'none') {
      res.json({ token: 'noauth' });
      return;
    }
    const { password } = req.body as { password?: string };
    let valid = false;
    if (auth.mode === 'password' && auth.password && password && safeCompare(password, auth.password)) valid = true;
    if (auth.mode === 'token' && auth.token && password && safeCompare(password, auth.token)) valid = true;
    if (!valid) { res.status(401).json({ error: 'Invalid password' }); return; }
    const token = randomBytes(32).toString('hex');
    authTokens.set(token, { createdAt: Date.now() });
    res.json({ token });
  });

  // ── Auth middleware (API routes only) ────────────────────────
  // HTML pages (/ and /login) are always served — the JS handles
  // the redirect to /login if localStorage has no token.
  // Only /api/* routes require a valid token.
  app.use('/api', (req, res, next) => {
    const cfg = loadConfig();
    const auth = cfg.gateway.auth;
    if (!auth || auth.mode === 'none') { next(); return; }
    // Skip /api/login itself
    if (req.path === '/login') { next(); return; }
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string);
    if (isValidToken(token, cfg)) { next(); return; }
    res.status(401).json({ error: 'Unauthorized' });
  });

  // Serve dashboard
  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getMissionControlHTML());
  });

  // API routes
  app.get('/api/stats', (_req, res) => {
    const usage = getUsageStats();
    res.json({
      ...usage,
      version: TITAN_VERSION,
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  app.get('/api/sessions', (_req, res) => {
    const sessions = listSessions();
    res.json(sessions);
  });

  app.get('/api/sessions/:id', (req, res) => {
    const sessionId = req.params.id;
    try {
      // getHistory looks up messages for a given session ID
      const history = getHistory(sessionId);
      res.json(history);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post('/api/sessions/:id/close', (req, res) => {
    try {
      closeSession(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get('/api/skills', (_req, res) => {
    const skills = getSkills();
    res.json(skills);
  });

  app.get('/api/tools', (_req, res) => {
    const tools = getRegisteredTools().map((t) => ({
      name: t.name,
      description: t.description,
    }));
    res.json(tools);
  });

  app.get('/api/channels', (_req, res) => {
    const statuses = Array.from(channels.values()).map((ch) => ch.getStatus());
    res.json(statuses);
  });

  app.get('/api/security', (_req, res) => {
    const audit = auditSecurity();
    res.json(audit);
  });

  app.get('/api/providers', async (_req, res) => {
    const health = await healthCheckAll();
    res.json(health);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: TITAN_VERSION, uptime: process.uptime() });
  });

  // Multi-agent endpoints
  app.get('/api/agents', (_req, res) => {
    res.json({ agents: listAgents(), capacity: getAgentCapacity() });
  });

  app.post('/api/agents/spawn', (req, res) => {
    const { name, model, systemPrompt } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const result = spawnAgent({ name, model, systemPrompt });
    res.json(result);
  });

  app.post('/api/agents/stop', (req, res) => {
    const { agentId } = req.body;
    if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
    const result = stopAgent(agentId);
    res.json(result);
  });

  // Agent message endpoint (uses multi-agent routing)
  app.post('/api/message', rateLimit(60000, 30), async (req, res) => {
    const { content, channel = 'api', userId = 'api-user' } = req.body;
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    // Check slash commands first (same as handleInboundMessage)
    try {
      const slashResult = await handleSlashCommand(content, channel, userId);
      if (slashResult) {
        res.json({ content: slashResult.response, sessionId: null, toolsUsed: [], model: 'system' });
        return;
      }
    } catch { /* fall through to routeMessage */ }

    // Concurrent LLM request limit (auto-tuned to 2 on CPU-only systems)
    const maxConcurrent = maxConcurrentOverride ?? (loadConfig().security.maxConcurrentTasks || 5);
    if (activeLlmRequests >= maxConcurrent) {
      res.status(503).json({ error: 'Server busy — too many concurrent requests. Try again shortly.' });
      return;
    }
    activeLlmRequests++;
    try {
      const response = await routeMessage(content, channel, userId);
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    } finally {
      activeLlmRequests--;
    }
  });

  // SSE streaming endpoint — real token-by-token delivery
  app.post('/api/chat/stream', rateLimit(60000, 30), async (req, res) => {
    const { content, model } = req.body;
    if (!content) { res.status(400).json({ error: 'content is required' }); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const config = loadConfig();
      const modelId = model || config.agent.model || 'anthropic/claude-sonnet-4-20250514';
      const systemMessages = [{ role: 'system' as const, content: `You are TITAN, an intelligent assistant.` }];
      const userMessages = [{ role: 'user' as const, content }];

      for await (const chunk of chatStream({ model: modelId, messages: [...systemMessages, ...userMessages], maxTokens: config.agent.maxTokens, temperature: config.agent.temperature })) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: (error as Error).message })}\n\n`);
    }
    res.end();
  });

  // Cost optimizer endpoint for Mission Control
  app.get('/api/costs', (_req, res) => {
    res.json(getCostStatus());
  });

  // Update System endpoints
  app.get('/api/update', async (_req, res) => {
    const info = await getUpdateInfo();
    res.json(info);
  });

  app.post('/api/update', (req, res) => {
    // Check if we are in a git repository locally
    const isLocalDev = fs.existsSync(join(process.cwd(), '.git'));

    let command = 'npm update -g titan-agent';
    if (isLocalDev) {
      command = 'git pull && npm run build';
    }

    logger.info(COMPONENT, `Triggering update: ${command}`);

    exec(command, (error, stdout, _stderr) => {
      if (error) {
        logger.error(COMPONENT, `Update failed: ${error.message}`);
      } else {
        logger.info(COMPONENT, `Update completed successfully.\\n${stdout}`);
      }
    });

    res.json({ ok: true, message: 'Update triggered in background' });
  });

  // Config endpoints
  app.get('/api/config', (_req, res) => {
    const cfg = loadConfig();
    // Return config with sensitive fields masked
    res.json({
      agent: cfg.agent,
      autonomy: cfg.autonomy,
      security: {
        sandboxMode: cfg.security.sandboxMode,
        shield: cfg.security.shield,
        deniedTools: cfg.security.deniedTools || [],
        networkAllowlist: cfg.security.networkAllowlist || [],
      },
      gateway: {
        port: cfg.gateway.port,
        host: cfg.gateway.host,
        auth: { mode: cfg.gateway.auth.mode },
      },
      logging: cfg.logging,
      providers: {
        anthropic: { configured: Boolean(cfg.providers.anthropic?.apiKey) },
        openai: { configured: Boolean(cfg.providers.openai?.apiKey) },
        google: { configured: Boolean(cfg.providers.google?.apiKey) },
        ollama: { baseUrl: cfg.providers.ollama?.baseUrl || 'http://localhost:11434' },
      },
      oauth: {
        google: {
          clientIdSet: Boolean(cfg.oauth?.google?.clientId),
          clientSecretSet: Boolean(cfg.oauth?.google?.clientSecret),
        },
      },
      channels: Object.fromEntries(
        Object.entries(cfg.channels).map(([k, v]) => {
          const ch = v as { enabled?: boolean; token?: string; dmPolicy?: string };
          return [k, { enabled: Boolean(ch.enabled), dmPolicy: ch.dmPolicy || 'pairing' }];
        })
      ),
    });
  });

  app.post('/api/config', (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const cfg = loadConfig();

      // Track which config fields are being changed for restart detection
      const changedFields: string[] = [];

      if (body.model) { cfg.agent.model = body.model as string; changedFields.push('agent.model'); }
      if (body.autonomyMode) { cfg.autonomy.mode = body.autonomyMode as 'supervised' | 'autonomous' | 'locked'; changedFields.push('autonomy.mode'); }
      if (body.sandboxMode) { cfg.security.sandboxMode = body.sandboxMode as 'host' | 'docker' | 'none'; changedFields.push('security.sandboxMode'); }
      if (body.logLevel) { cfg.logging.level = body.logLevel as 'info' | 'debug' | 'warn' | 'silent'; changedFields.push('logging.level'); }
      // Provider API keys
      if (body.anthropicKey !== undefined) { cfg.providers.anthropic.apiKey = body.anthropicKey as string; changedFields.push('providers.anthropic.apiKey'); }
      if (body.openaiKey !== undefined) { cfg.providers.openai.apiKey = body.openaiKey as string; changedFields.push('providers.openai.apiKey'); }
      if (body.googleKey !== undefined) { cfg.providers.google.apiKey = body.googleKey as string; changedFields.push('providers.google.apiKey'); }
      if (body.ollamaUrl !== undefined) { cfg.providers.ollama.baseUrl = body.ollamaUrl as string; changedFields.push('providers.ollama.baseUrl'); }
      // Google OAuth
      if (body.googleOAuthClientId !== undefined) {
        if (!cfg.oauth) (cfg as Record<string, unknown>).oauth = { google: {} };
        cfg.oauth.google.clientId = body.googleOAuthClientId as string;
        changedFields.push('oauth.google.clientId');
      }
      if (body.googleOAuthClientSecret !== undefined) {
        if (!cfg.oauth) (cfg as Record<string, unknown>).oauth = { google: {} };
        cfg.oauth.google.clientSecret = body.googleOAuthClientSecret as string;
        changedFields.push('oauth.google.clientSecret');
      }
      // Agent settings
      if (body.maxTokens !== undefined) { cfg.agent.maxTokens = Number(body.maxTokens); changedFields.push('agent.maxTokens'); }
      if (body.temperature !== undefined) { cfg.agent.temperature = Number(body.temperature); changedFields.push('agent.temperature'); }
      if (body.systemPrompt !== undefined) { cfg.agent.systemPrompt = body.systemPrompt as string; changedFields.push('agent.systemPrompt'); }
      // Security shield
      if (body.shieldEnabled !== undefined) { cfg.security.shield.enabled = Boolean(body.shieldEnabled); changedFields.push('security.shield.enabled'); }
      if (body.shieldMode !== undefined) { cfg.security.shield.mode = body.shieldMode as 'strict' | 'standard'; changedFields.push('security.shield.mode'); }
      if (body.deniedTools !== undefined) { cfg.security.deniedTools = body.deniedTools as string[]; changedFields.push('security.deniedTools'); }
      if (body.networkAllowlist !== undefined) { cfg.security.networkAllowlist = body.networkAllowlist as string[]; changedFields.push('security.networkAllowlist'); }
      // Gateway
      if (body.gatewayPort !== undefined) { cfg.gateway.port = Number(body.gatewayPort); changedFields.push('gateway.port'); }
      if (body.gatewayAuthMode !== undefined) { cfg.gateway.auth.mode = body.gatewayAuthMode as 'none' | 'token' | 'password'; changedFields.push('gateway.auth.mode'); }
      if (body.gatewayPassword !== undefined) { cfg.gateway.auth.password = body.gatewayPassword as string; changedFields.push('gateway.auth.password'); }
      if (body.gatewayToken !== undefined) { cfg.gateway.auth.token = body.gatewayToken as string; changedFields.push('gateway.auth.token'); }
      // Channels
      if (body.channels !== undefined && typeof body.channels === 'object') {
        for (const [ch, val] of Object.entries(body.channels as Record<string, unknown>)) {
          if (cfg.channels[ch as keyof typeof cfg.channels]) {
            Object.assign(cfg.channels[ch as keyof typeof cfg.channels], val);
            changedFields.push(`channels.${ch}`);
          }
        }
      }
      if (changedFields.length === 0) {
        const validFields = ['model', 'autonomyMode', 'sandboxMode', 'logLevel', 'anthropicKey', 'openaiKey',
          'googleKey', 'ollamaUrl', 'maxTokens', 'temperature', 'systemPrompt', 'shieldEnabled',
          'shieldMode', 'deniedTools', 'networkAllowlist', 'gatewayPort', 'gatewayAuthMode',
          'gatewayPassword', 'gatewayToken', 'channels'];
        res.status(400).json({ error: 'No recognized fields in request body', validFields });
        return;
      }
      updateConfig(cfg);

      // Determine which changed fields require a restart
      const restartFields = changedFields.filter(field =>
        RESTART_REQUIRED_PATTERNS.some(pattern => {
          if (pattern.endsWith('.*')) {
            return field.startsWith(pattern.slice(0, -1));
          }
          return field === pattern;
        })
      );

      res.json({ ok: true, restartRequired: restartFields.length > 0, restartFields });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Models endpoint — lists all providers + live Ollama models
  // Model discovery + management endpoints
  app.get('/api/models', async (_req, res) => {
    const cfg = loadConfig();
    const models = await discoverAllModels();
    // Group by provider
    const grouped: Record<string, string[]> = {};
    for (const m of models) {
      if (!grouped[m.provider]) grouped[m.provider] = [];
      grouped[m.provider].push(m.id);
    }
    res.json({
      ...grouped,
      current: cfg.agent.model,
      aliases: getModelAliases(),
    });
  });

  app.get('/api/models/discover', async (_req, res) => {
    const models = await discoverAllModels(true);
    const cfg = loadConfig();
    res.json({
      models,
      current: cfg.agent.model,
      aliases: getModelAliases(),
    });
  });

  app.post('/api/model/switch', (req, res) => {
    try {
      const { model } = req.body as { model?: string };
      if (!model) { res.status(400).json({ error: 'model is required' }); return; }
      const cfg = loadConfig();
      // Resolve aliases
      const aliases = cfg.agent.modelAliases || {};
      const resolved = aliases[model] || model;
      updateConfig({ agent: { ...cfg.agent, model: resolved } });
      // Invalidate cached responses for the old model so stale results aren't served
      invalidateCacheForModel(cfg.agent.model);
      logger.info(COMPONENT, `Model switched to: ${resolved}${resolved !== model ? ` (alias: ${model})` : ''}`);
      res.json({ success: true, model: resolved, alias: resolved !== model ? model : undefined });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Profile endpoints
  app.get('/api/profile', (_req, res) => {
    const profile = loadProfile();
    res.json({
      name: profile.name || '',
      technicalLevel: profile.technicalLevel || 'unknown',
      projectCount: profile.projects.length,
      goalCount: profile.goals.length,
    });
  });

  app.post('/api/profile', (req, res) => {
    try {
      const { name, technicalLevel } = req.body as { name?: string; technicalLevel?: string };
      const profile = loadProfile();
      if (name !== undefined) profile.name = name;
      if (technicalLevel !== undefined) profile.technicalLevel = technicalLevel as PersonalProfile['technicalLevel'];
      saveProfile(profile);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Learning stats endpoint
  app.get('/api/learning', (_req, res) => {
    res.json(getLearningStats());
  });

  // Live log tail endpoint
  app.get('/api/logs', (req, res) => {
    try {
      const logPath = getLogFilePath();
      if (!logPath || !fs.existsSync(logPath)) {
        res.json({ lines: [] });
        return;
      }
      const lineCount = req.query.lines ? parseInt(req.query.lines as string, 10) : 200;
      // Read only the last portion of the file
      const stats = fs.statSync(logPath);
      const readSize = Math.min(stats.size, 100000); // Read last 100KB max
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, Math.max(0, stats.size - readSize));
      fs.closeSync(fd);
      const content = buf.toString('utf-8');
      const all = content.split('\n').filter(Boolean);
      // If we started mid-line, drop the first partial line
      const lines = stats.size > readSize ? all.slice(1) : all;
      const tail = lines.slice(-Math.max(1, lineCount));
      res.json({ lines: tail });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── Mesh Networking Endpoints ─────────────────────────────────
  app.get('/api/mesh/hello', async (_req, res) => {
    const cfg = loadConfig();
    if (!cfg.mesh.enabled) { res.json({ titan: false, enabled: false }); return; }
    const { getOrCreateNodeId } = await import('../mesh/identity.js');
    const { discoverAllModels: discoverModels } = await import('../providers/router.js');
    const models = await discoverModels();
    const { listAgents: meshListAgents } = await import('../agent/multiAgent.js');
    res.json({
      titan: true,
      nodeId: getOrCreateNodeId(),
      version: TITAN_VERSION,
      models: models.map(m => m.id),
      agentCount: meshListAgents().length,
      load: 0,
    });
  });

  app.get('/api/mesh/peers', async (_req, res) => {
    const cfg = loadConfig();
    if (!cfg.mesh.enabled) { res.json({ peers: [], enabled: false }); return; }
    const { getPeers } = await import('../mesh/discovery.js');
    res.json({ peers: getPeers(), enabled: true });
  });

  app.get('/api/mesh/models', async (_req, res) => {
    const cfg = loadConfig();
    if (!cfg.mesh.enabled) { res.json({ models: [] }); return; }
    const { getMeshModels } = await import('../mesh/registry.js');
    res.json({ models: getMeshModels() });
  });

  // Native Memory Graph endpoint (replaces Neo4j/Graphiti)
  app.get('/api/graphiti', (_req, res) => {
    try {
      const { nodes, edges } = getGraphData();
      const { episodeCount } = getGraphStats();
      res.json({
        graphReady: true,
        episodeCount,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes,
        edges,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Clear memory graph
  app.delete('/api/graphiti', (_req, res) => {
    try {
      clearGraph();
      logger.info(COMPONENT, 'Memory graph cleared via API');
      res.json({ success: true, message: 'Graph cleared' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Full data reset (graph + knowledge + titan-data)
  app.delete('/api/data', (_req, res) => {
    try {
      const titanHome = join(homedir(), '.titan');
      const files = ['graph.json', 'knowledge.json', 'titan-data.json'];
      const deleted: string[] = [];
      for (const f of files) {
        const p = join(titanHome, f);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          deleted.push(f);
        }
      }
      clearGraph();
      logger.info(COMPONENT, `Full data reset via API: deleted ${deleted.join(', ') || 'none'}`);
      res.json({ success: true, message: `Deleted: ${deleted.join(', ') || 'none'}. Restart recommended.` });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── Autopilot ───────────────────────────────────────────────
  app.get('/api/autopilot/status', (_req, res) => {
    res.json(getAutopilotStatus());
  });

  app.get('/api/autopilot/history', (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 30;
    res.json(getRunHistory(limit));
  });

  app.post('/api/autopilot/run', async (_req, res) => {
    try {
      const result = await runAutopilotNow();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── Tunnel ─────────────────────────────────────────────────
  app.get('/api/tunnel/status', (_req, res) => {
    res.json(getTunnelStatus());
  });

  // ── Google OAuth Endpoints ───────────────────────────────
  app.get('/api/auth/google/status', (_req, res) => {
    res.json({ connected: isGoogleConnected(), email: getGoogleEmail() });
  });

  app.get('/api/auth/google/start', (req, res) => {
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || `127.0.0.1:${port}`;
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
      const url = getConsentUrl(redirectUri);
      res.redirect(url);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) { res.status(400).send('Missing authorization code'); return; }
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || `127.0.0.1:${port}`;
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
      await exchangeCode(code, redirectUri);
      // Redirect back to dashboard
      res.redirect('/?google_connected=1');
    } catch (err) {
      res.status(500).send(`OAuth failed: ${(err as Error).message}`);
    }
  });

  app.post('/api/auth/google/disconnect', (_req, res) => {
    disconnectGoogle();
    res.json({ ok: true });
  });

  // ── SOUL.md Endpoints ───────────────────────────────────
  app.get('/api/soul', (_req, res) => {
    try {
      const cfg = loadConfig();
      const soulPath = join(cfg.agent.workspace || TITAN_WORKSPACE, 'SOUL.md');
      if (fs.existsSync(soulPath)) {
        res.json({ content: fs.readFileSync(soulPath, 'utf-8') });
      } else {
        res.json({ content: '' });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post('/api/soul', (req, res) => {
    try {
      const cfg = loadConfig();
      const workspace = cfg.agent.workspace || TITAN_WORKSPACE;
      const soulPath = join(workspace, 'SOUL.md');

      // Ensure workspace directory exists
      if (!fs.existsSync(workspace)) fs.mkdirSync(workspace, { recursive: true });

      const { content, aboutMe, personality, userName } = req.body as {
        content?: string;
        aboutMe?: string;
        personality?: string;
        userName?: string;
      };

      if (content !== undefined) {
        // Raw content save (from Settings editor)
        fs.writeFileSync(soulPath, content, 'utf-8');
      } else if (aboutMe || personality) {
        // Generate from onboarding template
        const soulContent = [
          '# SOUL.md - Who You Are',
          '',
          '## About Your Human',
          aboutMe || '(Not yet described)',
          '',
          '## Your Personality',
          personality || '(Not yet defined)',
          '',
          '## Core Principles',
          '- Be genuinely helpful, not performatively helpful',
          '- Have opinions and preferences',
          '- Be resourceful before asking',
          '- Earn trust through competence',
          '',
          '## Boundaries',
          '- Private things stay private',
          '- Ask before acting externally',
          '- Never send half-baked replies to messaging surfaces',
          '',
          `_This file evolves as you learn. Update it when you discover new preferences._`,
        ].join('\n');
        fs.writeFileSync(soulPath, soulContent, 'utf-8');
      } else {
        res.status(400).json({ error: 'Provide either "content" or "aboutMe"/"personality"' });
        return;
      }

      logger.info(COMPONENT, 'SOUL.md updated via API');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── API Documentation ────────────────────────────────────
  app.get('/api/docs', (_req, res) => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'TITAN Gateway API',
        version: TITAN_VERSION,
        description: 'REST API for the TITAN autonomous AI agent framework.',
      },
      paths: {
        '/login':                  { get:  { summary: 'Login page',                             tags: ['Auth'] } },
        '/api/login':              { post: { summary: 'Authenticate with password',             tags: ['Auth'],     requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { password: { type: 'string' } } } } } } } },
        '/':                       { get:  { summary: 'Dashboard UI',                           tags: ['System'] } },
        '/api/stats':              { get:  { summary: 'System stats (version, uptime, memory)', tags: ['System'] } },
        '/api/health':             { get:  { summary: 'Provider health check',                  tags: ['System'] } },
        '/api/update':             { get:  { summary: 'Check for updates',                      tags: ['System'] },
                                     post: { summary: 'Trigger update',                         tags: ['System'] } },
        '/api/costs':              { get:  { summary: 'Cost optimizer status',                  tags: ['System'] } },
        '/api/sessions':           { get:  { summary: 'List active sessions',                   tags: ['Sessions'] } },
        '/api/sessions/{id}':      { get:  { summary: 'Get session history by ID',              tags: ['Sessions'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] } },
        '/api/sessions/{id}/close':{ post: { summary: 'Close/drop a session',                   tags: ['Sessions'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] } },
        '/api/agents':             { get:  { summary: 'List agents and capacity',               tags: ['Agents'] } },
        '/api/agents/spawn':       { post: { summary: 'Spawn new agent',                        tags: ['Agents'],   requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, model: { type: 'string' } } } } } } } },
        '/api/agents/stop':        { post: { summary: 'Stop an agent',                          tags: ['Agents'],   requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } } } },
        '/api/skills':             { get:  { summary: 'List loaded skills',                     tags: ['Skills'] } },
        '/api/tools':              { get:  { summary: 'List registered tools',                  tags: ['Skills'] } },
        '/api/channels':           { get:  { summary: 'List channel statuses',                  tags: ['Channels'] } },
        '/api/message':            { post: { summary: 'Send a message',                         tags: ['Channels'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { content: { type: 'string' }, channel: { type: 'string' }, userId: { type: 'string' } } } } } } } },
        '/api/chat/stream':        { post: { summary: 'Stream chat via SSE',                    tags: ['Channels'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, model: { type: 'string' } } } } } } } },
        '/api/config':             { get:  { summary: 'Get current config',                     tags: ['Config'] },
                                     post: { summary: 'Update config',                          tags: ['Config'] } },
        '/api/security':           { get:  { summary: 'Security audit results',                 tags: ['Config'] } },
        '/api/providers':          { get:  { summary: 'List configured providers',              tags: ['Config'] } },
        '/api/models':             { get:  { summary: 'List available models',                  tags: ['Models'] } },
        '/api/models/discover':    { get:  { summary: 'Discover models from all providers',     tags: ['Models'] } },
        '/api/model/switch':       { post: { summary: 'Switch active model',                    tags: ['Models'],   requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { model: { type: 'string' } } } } } } } },
        '/api/profile':            { get:  { summary: 'Get personal profile',                   tags: ['Memory'] },
                                     post: { summary: 'Update personal profile',                tags: ['Memory'] } },
        '/api/learning':           { get:  { summary: 'Learning engine stats',                  tags: ['Memory'] } },
        '/api/graphiti':           { get:  { summary: 'Memory graph data',                      tags: ['Memory'] },
                                     delete: { summary: 'Clear memory graph',                     tags: ['Memory'] } },
        '/api/data':               { delete: { summary: 'Full data reset (graph+knowledge+memory)', tags: ['Memory'] } },
        '/api/mesh/hello':         { get:  { summary: 'Mesh hello/handshake',                   tags: ['Mesh'] } },
        '/api/mesh/peers':         { get:  { summary: 'List mesh peers',                        tags: ['Mesh'] } },
        '/api/mesh/models':        { get:  { summary: 'List mesh models',                       tags: ['Mesh'] } },
        '/api/logs':               { get:  { summary: 'Read log file',                          tags: ['Logs'], parameters: [{ name: 'lines', in: 'query', schema: { type: 'integer' } }] } },
        '/api/tunnel/status':      { get:  { summary: 'Cloudflare tunnel status',               tags: ['Tunnel'] } },
        '/api/autopilot/status':   { get:  { summary: 'Autopilot status',                      tags: ['Autopilot'] } },
        '/api/autopilot/history':  { get:  { summary: 'Autopilot run history',                 tags: ['Autopilot'] } },
        '/api/autopilot/run':      { post: { summary: 'Trigger autopilot run',                 tags: ['Autopilot'] } },
        '/api/docs':               { get:  { summary: 'OpenAPI spec (JSON)',                    tags: ['Docs'] } },
        '/docs':                   { get:  { summary: 'API documentation page',                 tags: ['Docs'] } },
      },
    };
    res.json(spec);
  });

  app.get('/docs', (_req, res) => {
    const endpoints = [
      { cat: 'Auth',     routes: [
        { method: 'GET',  path: '/login',               desc: 'Login page' },
        { method: 'POST', path: '/api/login',            desc: 'Authenticate (body: {password})' },
      ]},
      { cat: 'System',   routes: [
        { method: 'GET',  path: '/',                     desc: 'Dashboard UI' },
        { method: 'GET',  path: '/api/stats',            desc: 'System stats (version, uptime, memory, tokens, requests)' },
        { method: 'GET',  path: '/api/health',           desc: 'Provider health check' },
        { method: 'GET',  path: '/api/costs',            desc: 'Cost optimizer status' },
        { method: 'GET',  path: '/api/update',           desc: 'Check for updates' },
        { method: 'POST', path: '/api/update',           desc: 'Trigger update' },
      ]},
      { cat: 'Sessions', routes: [
        { method: 'GET',  path: '/api/sessions',         desc: 'List active sessions' },
        { method: 'GET',  path: '/api/sessions/:id',     desc: 'Get session history by ID' },
        { method: 'POST', path: '/api/sessions/:id/close', desc: 'Close/drop a session' },
      ]},
      { cat: 'Agents',   routes: [
        { method: 'GET',  path: '/api/agents',           desc: 'List agents + capacity' },
        { method: 'POST', path: '/api/agents/spawn',     desc: 'Spawn new agent (body: {name, model?})' },
        { method: 'POST', path: '/api/agents/stop',      desc: 'Stop agent (body: {id})' },
      ]},
      { cat: 'Skills',   routes: [
        { method: 'GET',  path: '/api/skills',           desc: 'List loaded skills' },
        { method: 'GET',  path: '/api/tools',            desc: 'List registered tools' },
      ]},
      { cat: 'Channels', routes: [
        { method: 'GET',  path: '/api/channels',         desc: 'List channel statuses' },
        { method: 'POST', path: '/api/message',          desc: 'Send message (body: {content, channel?, userId?})' },
        { method: 'POST', path: '/api/chat/stream',      desc: 'Stream chat (SSE, body: {message, model?})' },
      ]},
      { cat: 'Config',   routes: [
        { method: 'GET',  path: '/api/config',           desc: 'Get config' },
        { method: 'POST', path: '/api/config',           desc: 'Update config' },
        { method: 'GET',  path: '/api/security',         desc: 'Security audit results' },
        { method: 'GET',  path: '/api/providers',        desc: 'List configured providers' },
      ]},
      { cat: 'Models',   routes: [
        { method: 'GET',  path: '/api/models',           desc: 'List available models' },
        { method: 'GET',  path: '/api/models/discover',  desc: 'Discover models from all providers' },
        { method: 'POST', path: '/api/model/switch',     desc: 'Switch model (body: {model})' },
      ]},
      { cat: 'Mesh',     routes: [
        { method: 'GET',  path: '/api/mesh/hello',       desc: 'Mesh hello/handshake' },
        { method: 'GET',  path: '/api/mesh/peers',       desc: 'List mesh peers' },
        { method: 'GET',  path: '/api/mesh/models',      desc: 'List mesh models' },
      ]},
      { cat: 'Memory',   routes: [
        { method: 'GET',  path: '/api/profile',          desc: 'Get personal profile' },
        { method: 'POST', path: '/api/profile',          desc: 'Update profile' },
        { method: 'GET',  path: '/api/learning',         desc: 'Learning engine stats' },
        { method: 'GET',    path: '/api/graphiti',         desc: 'Memory graph data' },
        { method: 'DELETE', path: '/api/graphiti',         desc: 'Clear memory graph' },
        { method: 'DELETE', path: '/api/data',             desc: 'Full data reset' },
      ]},
      { cat: 'Autopilot', routes: [
        { method: 'GET',  path: '/api/autopilot/status', desc: 'Autopilot status' },
        { method: 'GET',  path: '/api/autopilot/history', desc: 'Autopilot run history' },
        { method: 'POST', path: '/api/autopilot/run',    desc: 'Trigger autopilot run' },
      ]},
      { cat: 'Tunnel',   routes: [
        { method: 'GET',  path: '/api/tunnel/status',    desc: 'Cloudflare tunnel status' },
      ]},
      { cat: 'Logs',     routes: [
        { method: 'GET',  path: '/api/logs',             desc: 'Read log file (query: lines)' },
      ]},
      { cat: 'Docs',     routes: [
        { method: 'GET',  path: '/api/docs',             desc: 'OpenAPI spec (JSON)' },
        { method: 'GET',  path: '/docs',                 desc: 'API documentation page (this page)' },
      ]},
    ];

    let rows = '';
    for (const group of endpoints) {
      rows += `<tr class="cat-row"><td colspan="3">${group.cat}</td></tr>\n`;
      for (const r of group.routes) {
        const badge = r.method === 'GET'
          ? '<span class="badge get">GET</span>'
          : '<span class="badge post">POST</span>';
        rows += `<tr><td>${badge}</td><td class="path">${r.path}</td><td>${r.desc}</td></tr>\n`;
      }
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TITAN API Docs</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;background:#0a0e1a;color:#e2e8f0;padding:40px 20px;line-height:1.6}
.wrap{max-width:900px;margin:0 auto}
h1{font-size:28px;font-weight:700;color:#06b6d4;margin-bottom:4px;letter-spacing:2px}
.sub{color:#94a3b8;font-size:14px;margin-bottom:32px}
.sub a{color:#06b6d4;text-decoration:none}
.sub a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse}
tr{border-bottom:1px solid rgba(42,48,80,0.4)}
tr:hover:not(.cat-row){background:rgba(6,182,212,0.04)}
td{padding:10px 12px;font-size:14px;vertical-align:middle}
.cat-row td{font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#06b6d4;padding-top:28px;padding-bottom:8px;border-bottom:1px solid rgba(6,182,212,0.15)}
.badge{display:inline-block;padding:2px 10px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:0.5px;min-width:52px;text-align:center}
.badge.get{background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3)}
.badge.post{background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3)}
.path{font-family:'Fira Code','SF Mono',monospace;color:#e2e8f0;font-size:13px}
.footer{margin-top:40px;text-align:center;color:#475569;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
  <h1>TITAN API</h1>
  <div class="sub">v${TITAN_VERSION} &mdash; <a href="/api/docs">OpenAPI JSON</a></div>
  <table>${rows}</table>
  <div class="footer">All /api/* routes require authentication (Bearer token) unless noted.</div>
</div>
</body>
</html>`);
  });

  // Create HTTP server
  httpServer = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', async (ws, req) => {
    const cfg = loadConfig();
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // ── Mesh peer WebSocket connections ──────────────
    if (url.searchParams.get('mesh') === 'true' && cfg.mesh.enabled && cfg.mesh.secret) {
      const peerNodeId = url.searchParams.get('nodeId') || '';
      const authToken = url.searchParams.get('auth') || '';
      const { verifyMeshAuth, handleMeshWebSocket } = await import('../mesh/transport.js');
      const { getOrCreateNodeId } = await import('../mesh/identity.js');

      if (!verifyMeshAuth(authToken, peerNodeId, cfg.mesh.secret)) {
        ws.close(1008, 'Mesh auth failed');
        return;
      }

      handleMeshWebSocket(ws, peerNodeId, getOrCreateNodeId(), async (msg, reply) => {
        // Handle incoming task requests from mesh peers
        try {
          const result = await processMessage(msg.payload.message as string, 'mesh', msg.fromNodeId, {
            model: msg.payload.model as string,
          });
          reply({ ...result });
        } catch (err) {
          reply({ error: (err as Error).message });
        }
      });
      return; // Don't add to wsClients — mesh peers use separate handling
    }

    // ── Regular dashboard WebSocket connections ──────
    const auth = cfg.gateway.auth;
    if (auth && auth.mode !== 'none') {
      const token = url.searchParams.get('token') || '';
      if (!isValidToken(token, cfg)) {
        ws.close(1008, 'Unauthorized');
        return;
      }
    }

    wsClients.add(ws);
    logger.info(COMPONENT, `WebSocket client connected (${wsClients.size} total)`);

    ws.on('message', async (rawData) => {
      try {
        const data = JSON.parse(rawData.toString());
        // Accept both 'chat' and 'message' types for compatibility
        if ((data.type === 'chat' || data.type === 'message') && data.content) {
          // Process through WebChat channel
          if (webChatChannel) {
            webChatChannel.handleWebSocketMessage(data.userId || 'webchat-user', data.content);
          }
        }
      } catch (error) {
        logger.error(COMPONENT, `WebSocket error: ${(error as Error).message}`);
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
      logger.debug(COMPONENT, `WebSocket client disconnected (${wsClients.size} total)`);
    });
  });

  // Initialize channels
  webChatChannel = new WebChatChannel();
  channels.set('webchat', webChatChannel);
  await webChatChannel.connect();
  webChatChannel.on('message', handleInboundMessage);

  // Initialize optional channels
  const channelAdapters: Array<[string, ChannelAdapter]> = [
    ['discord', new DiscordChannel()],
    ['telegram', new TelegramChannel()],
    ['slack', new SlackChannel()],
    ['googlechat', new GoogleChatChannel()],
    ['whatsapp', new WhatsAppChannel()],
    ['matrix', new MatrixChannel()],
    ['signal', new SignalChannel()],
    ['msteams', new MSTeamsChannel()],
  ];

  for (const [name, adapter] of channelAdapters) {
    channels.set(name, adapter);
    adapter.on('message', handleInboundMessage);
    try {
      await adapter.connect();
    } catch (error) {
      logger.debug(COMPONENT, `Channel ${name} not available: ${(error as Error).message}`);
    }
  }

  // ── Phase 3: Boot MCP servers, monitors, recipes, model switch, slash commands ──
  initSlashCommands();
  initModelSwitchTool();
  seedBuiltinRecipes();
  initMcpServers().catch((e) => logger.warn(COMPONENT, `MCP init error: ${e.message}`));

  // ── Persistent webhooks — reload saved webhooks ─────────────
  initPersistentWebhooks();

  // ── Cron scheduler — re-activate all persisted jobs ──────────
  initCronScheduler();

  // ── Autopilot — scheduled autonomous agent runs ─────────────
  initAutopilot(config);

  // ── Morning Briefing — send once per day in 6am–12pm window ──
  checkAndSendBriefing(async (msg) => {
    broadcast({
      type: 'message',
      direction: 'outbound',
      channel: 'system',
      userId: 'titan',
      content: msg,
      timestamp: new Date().toISOString(),
    });
  }).catch((e: Error) => logger.warn(COMPONENT, `Briefing error: ${e.message}`));

  // Wire monitor triggers to agent
  setMonitorTriggerHandler(async (monitor, event) => {
    const prompt = `[AUTO-TRIGGER: ${monitor.name}] ${event.detail}\n\nYour task: ${monitor.prompt}`;
    const response = await processMessage(prompt, 'monitor', 'system');
    broadcast({ type: 'monitor_trigger', monitor: monitor.name, response: response.content, event });
    logger.info(COMPONENT, `Monitor "${monitor.name}" responded: ${response.content.slice(0, 100)}`);
  });
  initMonitors();

  // ── Mesh Networking ───────────────────────────────────────────
  if (config.mesh.enabled && config.mesh.secret) {
    const { getOrCreateNodeId } = await import('../mesh/identity.js');
    const { startDiscovery } = await import('../mesh/discovery.js');
    const nodeId = getOrCreateNodeId();
    await startDiscovery(nodeId, port, { mdns: config.mesh.mdns, tailscale: config.mesh.tailscale });

    // Auto-bind to 0.0.0.0 when mesh is enabled (so peers can reach us)
    if (host === '127.0.0.1') {
      host = '0.0.0.0';
      logger.info(COMPONENT, 'Mesh enabled — binding to 0.0.0.0 (was 127.0.0.1) so peers can connect');
    }

    // Connect to static peers
    if (config.mesh.staticPeers.length > 0) {
      const { connectToPeer } = await import('../mesh/transport.js');
      for (const addr of config.mesh.staticPeers) {
        const [peerHost, peerPort] = addr.split(':');
        connectToPeer(peerHost, parseInt(peerPort || '48420', 10), nodeId, config.mesh.secret)
          .catch(() => logger.debug(COMPONENT, `Static peer unreachable: ${addr}`));
      }
    }

    logger.info(COMPONENT, `Mesh active — Node: ${nodeId.slice(0, 8)}... | mDNS: ${config.mesh.mdns} | Tailscale: ${config.mesh.tailscale}`);
  }

  // Start server
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(COMPONENT, `Port ${port} is already in use. Mission Control is likely already running in the background.`);
      logger.info(COMPONENT, `You can access it at http://${host}:${port}`);
      process.exit(1);
    } else {
      logger.error(COMPONENT, `Server error: ${err.message}`);
    }
  });

  // ── Graceful Shutdown ───────────────────────────────────────────
  const gracefulShutdown = async (signal: string) => {
    logger.info(COMPONENT, `Received ${signal} — shutting down gracefully...`);
    stopAutopilot();
    stopTunnel();
    await stopGateway();
    logger.info(COMPONENT, 'Gateway stopped. Goodbye.');
    process.exit(0);
  };
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  httpServer.listen(port, host, () => {
    logger.info(COMPONENT, `Gateway listening on http://${host}:${port}`);
    logger.info(COMPONENT, `Dashboard: http://${host}:${port}`);
    logger.info(COMPONENT, `WebSocket: ws://${host}:${port}`);
    logger.info(COMPONENT, `API: http://${host}:${port}/api/health`);
    logger.info(COMPONENT, `\nChannels: ${Array.from(channels.values()).map((c) => `${c.displayName} (${c.getStatus().connected ? '✅' : '❌'})`).join(', ')}`);
    logger.info(COMPONENT, `Skills: ${getSkills().length} loaded`);
    logger.info(COMPONENT, `Tools: ${getRegisteredTools().length} registered`);

    // Start Cloudflare Tunnel if enabled
    if (config.tunnel?.enabled) {
      startTunnel(port, config.tunnel).catch((e) => {
        logger.error(COMPONENT, `Tunnel start failed: ${(e as Error).message}`);
      });
    }
  });
}
