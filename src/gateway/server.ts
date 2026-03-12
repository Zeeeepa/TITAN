/**
 * TITAN — Gateway Server
 * WebSocket + HTTP server: the control plane for all channels, agents, tools, and the web UI.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import net from 'net';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir, hostname as osHostname, cpus, loadavg } from 'os';
import { randomBytes, timingSafeEqual } from 'crypto';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import { loadConfig, updateConfig } from '../config/config.js';
import { loadProfile, saveProfile, type PersonalProfile } from '../memory/relationship.js';
import { processMessage } from '../agent/agent.js';
import { initMemory, getUsageStats, getHistory, getDb } from '../memory/memory.js';
import { initBuiltinSkills, getSkills, toggleSkill, getSkillTools } from '../skills/registry.js';
import { listPersonas, getPersona, invalidatePersonaCache } from '../personas/manager.js';
import { searchSkills as marketplaceSearch, installSkill, uninstallSkill, listSkills as listMarketplaceSkills, listInstalled as listInstalledMarketplace } from '../skills/marketplace.js';
import { getRegisteredTools } from '../agent/toolRunner.js';
import { listSessions } from '../agent/session.js';
import { healthCheckAll, discoverAllModels, getModelAliases, chatStream, getFallbackState } from '../providers/router.js';
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
import { IRCChannel } from '../channels/irc.js';
import { MattermostChannel } from '../channels/mattermost.js';
import { LarkChannel } from '../channels/lark.js';
import { EmailInboundChannel } from '../channels/email_inbound.js';
import { LineChannel } from '../channels/line.js';
import { ZulipChannel } from '../channels/zulip.js';
import { initAgents, routeMessage, listAgents, spawnAgent, stopAgent, getAgentCapacity, getAgent } from '../agent/multiAgent.js';
import type { ChannelAdapter, InboundMessage } from '../channels/base.js';
import logger, { initFileLogger } from '../utils/logger.js';
import { TITAN_VERSION, TITAN_NAME, TITAN_LOGS_DIR } from '../utils/constants.js';
import { getUpdateInfo } from '../utils/updater.js';
import { getMissionControlHTML } from './dashboard.js';
import { serializePrometheus, getMetricsSummary, titanRequestsTotal, titanRequestDuration, titanErrorsTotal, titanActiveSessions, titanToolCallsTotal, titanTokensTotal, titanModelRequestsTotal } from './metrics.js';
import { initSlashCommands, handleSlashCommand } from './slashCommands.js';
import { initMcpServers } from '../mcp/registry.js';
import { mountMcpHttpEndpoints, getMcpServerStatus } from '../mcp/server.js';
import { initMonitors, setMonitorTriggerHandler } from '../agent/monitor.js';
import { seedBuiltinRecipes, listRecipes, getRecipe, saveRecipe, deleteRecipe, getBuiltinRecipes, importRecipeYaml } from '../recipes/store.js';
import { parseSlashCommand, runRecipe } from '../recipes/runner.js';
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
import { listGoals, createGoal, getGoal, deleteGoal, completeSubtask, addSubtask } from '../agent/goals.js';
import { startTunnel, stopTunnel, getTunnelStatus } from '../utils/tunnel.js';
import { getConsentUrl, exchangeCode, isGoogleConnected, getGoogleEmail, disconnectGoogle } from '../auth/google.js';
import { createTeam, getTeam, listTeams, deleteTeam, updateTeam, addMember, removeMember, updateMemberRole, createInvite, acceptInvite, getEffectivePermissions, setRolePermissions, getTeamStats, isToolAllowed, getUserRole } from '../security/teams.js';
import { TITAN_WORKSPACE } from '../utils/constants.js';
const COMPONENT = 'Gateway';

/** Get normalized CPU load (0.0–1.0) using 1-minute load average */
function getCpuLoad(): number {
    const avg = loadavg()[0]; // 1-minute load average
    const cores = cpus().length || 1;
    return Math.min(1, avg / cores);
}

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
  // No token configured = auth not set up yet, allow access
  if (auth.mode === 'token') return auth.token ? safeCompare(token, auth.token) : true;
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
      try {
        client.send(json);
      } catch (err) {
        logger.warn(COMPONENT, `Broadcast send failed: ${(err as Error).message}`);
      }
    }
  }
}

/** Safely send a response through a channel adapter */
async function safeSend(channelName: string, msg: { channel: string; userId: string; groupId?: string; content: string; replyTo?: string }): Promise<void> {
  const channel = channels.get(channelName);
  if (!channel) return;
  try {
    await channel.send(msg);
  } catch (err) {
    logger.warn(COMPONENT, `Channel send failed (${channelName}): ${(err as Error).message}`);
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
    await safeSend(msg.channel, { channel: msg.channel, userId: msg.userId, groupId: msg.groupId, content: slashResult.response, replyTo: msg.id });
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
      await safeSend(msg.channel, { channel: msg.channel, userId: msg.userId, groupId: msg.groupId, content: fullResponse, replyTo: msg.id });
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
    await safeSend(msg.channel, {
      channel: msg.channel,
      userId: msg.userId,
      groupId: msg.groupId,
      content: response.content,
      replyTo: msg.id,
    });

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

  // Initialize vector search (Tier 2 memory — non-blocking)
  import('../memory/vectors.js').then(({ initVectors }) => {
    initVectors().then(ok => {
      if (ok) logger.info(COMPONENT, 'Vector search (Tier 2 memory) initialized');
    }).catch(() => {});
  }).catch(() => {});

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

  // Security headers + CSP
  app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' ws: wss: https: http:",
          "media-src 'self' blob: mediastream:",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
      ].join('; '));
      res.removeHeader('X-Powered-By');
      next();
  });

  // CORS — allow localhost, Tailscale, Cloudflare tunnels, and LAN origins
  const gatewayPort = config.gateway.port || 48420;
  const localhostOrigins = new Set([
      `http://127.0.0.1:${gatewayPort}`,
      `http://localhost:${gatewayPort}`,
      `https://127.0.0.1:${gatewayPort}`,
      `https://localhost:${gatewayPort}`,
  ]);
  const dynamicOriginPatterns = [
      /^https?:\/\/[a-z0-9-]+\.ts\.net(:\d+)?$/,          // Tailscale (*.ts.net)
      /^https?:\/\/[a-z0-9-]+\.trycloudflare\.com(:\d+)?$/, // Cloudflare tunnel
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,     // LAN 192.168.x.x
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,  // LAN 10.x.x.x
      /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/, // LAN 172.16-31.x.x
  ];
  function isAllowedOrigin(origin: string): boolean {
      if (localhostOrigins.has(origin)) return true;
      return dynamicOriginPatterns.some(re => re.test(origin));
  }
  app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && isAllowedOrigin(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
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
    // Token mode with no token configured = auth not set up, allow access
    if (auth.mode === 'token' && !auth.token) { next(); return; }
    // Skip /api/login itself
    if (req.path === '/login') { next(); return; }
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string);
    if (isValidToken(token, cfg)) { next(); return; }
    res.status(401).json({ error: 'Unauthorized' });
  });

  // ── Serve React SPA (Mission Control v2) ──────────────────
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const uiDistPath = join(__dirname, '../../ui/dist');
  const uiIndexPath = join(uiDistPath, 'index.html');
  const hasReactUI = fs.existsSync(uiIndexPath);
  if (hasReactUI) {
    app.use(express.static(uiDistPath, { index: false }));
  }

  // Legacy dashboard (kept during migration, also fallback if React UI not built)
  app.get('/legacy', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getMissionControlHTML());
  });

  // Root route: React SPA or legacy dashboard
  app.get('/', (_req, res) => {
    if (hasReactUI) {
      res.sendFile(uiIndexPath);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.send(getMissionControlHTML());
    }
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

  app.get('/api/sessions/:id/messages', (req, res) => {
    const sessionId = req.params.id;
    try {
      const history = getHistory(sessionId);
      // history may be an array of messages or an object with a messages field
      const messages = Array.isArray(history) ? history : (history as any).messages || [];
      res.json(messages);
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

  app.delete('/api/sessions/:id', (req, res) => {
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

  app.post('/api/skills/:name/toggle', (req, res) => {
    try {
      const { name } = req.params;
      const enabled = toggleSkill(name);
      const tools = getSkillTools(name);
      res.json({ ok: true, skill: name, enabled, tools });
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  // ─── Marketplace API ──────────────────────────────────────────
  app.get('/api/marketplace', async (_req, res) => {
    try {
      const skills = await listMarketplaceSkills();
      const installed = listInstalledMarketplace();
      res.json({ skills: skills.map(s => ({ ...s, installed: installed.includes(s.file.replace('.js', '')) })), installed });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get('/api/marketplace/search', async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const results = await marketplaceSearch(q, 50);
      const installed = listInstalledMarketplace();
      res.json({ ...results, skills: results.skills.map(s => ({ ...s, installed: installed.includes(s.file.replace('.js', '')) })) });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post('/api/marketplace/install', async (req, res): Promise<void> => {
    try {
      const { skill } = req.body as { skill: string };
      if (!skill) { res.status(400).json({ error: 'Missing "skill" field' }); return; }
      const result = await installSkill(skill);
      res.json(result);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post('/api/marketplace/uninstall', (req, res): void => {
    try {
      const { skill } = req.body as { skill: string };
      if (!skill) { res.status(400).json({ error: 'Missing "skill" field' }); return; }
      const result = uninstallSkill(skill);
      res.json(result);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ── Personas ──────────────────────────────────────────────────
  app.get('/api/personas', (_req, res) => {
    try {
      const cfg = loadConfig();
      res.json({ personas: listPersonas(), active: cfg.agent.persona || 'default' });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post('/api/persona/switch', (req, res): void => {
    try {
      const { persona } = req.body as { persona: string };
      if (!persona || typeof persona !== 'string') { res.status(400).json({ error: 'Missing persona ID' }); return; }
      if (persona !== 'default' && !getPersona(persona)) { res.status(404).json({ error: `Persona "${persona}" not found` }); return; }
      const cfg = loadConfig();
      updateConfig({ agent: { ...cfg.agent, persona } });
      invalidatePersonaCache();
      res.json({ ok: true, active: persona });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
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
    const cfg = loadConfig();
    res.json({ status: 'ok', version: TITAN_VERSION, uptime: process.uptime(), onboarded: cfg.onboarded });
  });

  // ── Onboarding API ──────────────────────────────────────────
  app.get('/api/onboarding/status', (_req, res) => {
    const cfg = loadConfig();
    res.json({ onboarded: cfg.onboarded, version: TITAN_VERSION });
  });

  app.post('/api/onboarding/complete', (req, res) => {
    try {
      const { provider, apiKey, model, agentName, personality } = req.body;

      // Build config updates
      const updates: Record<string, unknown> = { onboarded: true };

      // Set provider API key
      if (provider && apiKey) {
        const providerKey = provider.toLowerCase();
        const cfg = loadConfig();
        const providers = { ...cfg.providers } as Record<string, Record<string, unknown>>;
        if (!providers[providerKey]) providers[providerKey] = {};
        providers[providerKey].apiKey = apiKey;
        updates.providers = providers;
      }

      // Set model
      if (model) {
        updates.agent = { model };
      }

      // Set agent name / personality via soul
      if (agentName || personality) {
        const soulParts: string[] = [];
        if (agentName) soulParts.push(`Your name is ${agentName}.`);
        if (personality) soulParts.push(personality);
        updates.soul = soulParts.join(' ');
      }

      updateConfig(updates);
      broadcast({ type: 'config_updated' });
      res.json({ ok: true, message: 'Onboarding complete! Welcome to TITAN.' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Prometheus metrics endpoint
  app.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(serializePrometheus());
  });

  // JSON metrics summary for dashboard
  app.get('/api/metrics/summary', (_req, res) => {
    res.json(getMetricsSummary());
  });

  // MCP server status
  app.get('/api/mcp/server', (_req, res) => {
    res.json(getMcpServerStatus());
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
  // Supports SSE streaming when Accept: text/event-stream header is present
  app.post('/api/message', rateLimit(60000, 30), async (req, res) => {
    const { content, channel = 'api', userId = 'api-user', agentId } = req.body;
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const startTime = process.hrtime.bigint();
    const wantsSSE = req.headers.accept === 'text/event-stream';

    // Check slash commands first (same as handleInboundMessage)
    try {
      const slashResult = await handleSlashCommand(content, channel, userId);
      if (slashResult) {
        titanRequestsTotal.increment({ channel, status: 'ok' });
        const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
        titanRequestDuration.observe(durationSec, { channel });
        if (wantsSSE) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders();
          res.write(`event: done\ndata: ${JSON.stringify({ content: slashResult.response, sessionId: null, durationMs: 0 })}\n\n`);
          res.end();
        } else {
          res.json({ content: slashResult.response, sessionId: null, toolsUsed: [], model: 'system' });
        }
        return;
      }
    } catch { /* fall through to routeMessage */ }

    // Concurrent LLM request limit (auto-tuned to 2 on CPU-only systems)
    const maxConcurrent = maxConcurrentOverride ?? (loadConfig().security.maxConcurrentTasks || 5);
    if (activeLlmRequests >= maxConcurrent) {
      titanRequestsTotal.increment({ channel, status: 'busy' });
      titanErrorsTotal.increment({ type: 'busy' });
      if (wantsSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.flushHeaders();
        res.write(`event: done\ndata: ${JSON.stringify({ error: 'Server busy' })}\n\n`);
        res.end();
      } else {
        res.status(503).json({ error: 'Server busy — too many concurrent requests. Try again shortly.' });
      }
      return;
    }
    activeLlmRequests++;
    titanActiveSessions.inc();
    try {
      if (wantsSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const response = await routeMessage(content, channel, userId, {
          onToken: (token) => {
            res.write(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`);
          },
          onToolCall: (name, args) => {
            res.write(`event: tool_call\ndata: ${JSON.stringify({ name, args })}\n\n`);
          },
        }, agentId);
        titanRequestsTotal.increment({ channel, status: 'ok' });
        if (response.toolsUsed) {
          for (const tool of response.toolsUsed) titanToolCallsTotal.increment({ tool });
        }
        if (response.tokenUsage) {
          if (response.tokenUsage.prompt) titanTokensTotal.increment({ type: 'prompt' }, response.tokenUsage.prompt);
          if (response.tokenUsage.completion) titanTokensTotal.increment({ type: 'completion' }, response.tokenUsage.completion);
        }
        if (response.model) titanModelRequestsTotal.increment({ model: response.model, provider: 'default' });
        res.write(`event: done\ndata: ${JSON.stringify({ content: response.content, sessionId: response.sessionId, durationMs: response.durationMs, model: response.model, toolsUsed: response.toolsUsed })}\n\n`);
        res.end();
      } else {
        const response = await routeMessage(content, channel, userId, undefined, agentId);
        titanRequestsTotal.increment({ channel, status: 'ok' });
        if (response.toolsUsed) {
          for (const tool of response.toolsUsed) titanToolCallsTotal.increment({ tool });
        }
        if (response.tokenUsage) {
          if (response.tokenUsage.prompt) titanTokensTotal.increment({ type: 'prompt' }, response.tokenUsage.prompt);
          if (response.tokenUsage.completion) titanTokensTotal.increment({ type: 'completion' }, response.tokenUsage.completion);
        }
        if (response.model) titanModelRequestsTotal.increment({ model: response.model, provider: 'default' });
        res.json(response);
      }
    } catch (error) {
      titanRequestsTotal.increment({ channel, status: 'error' });
      titanErrorsTotal.increment({ type: 'request' });
      if (wantsSSE) {
        res.write(`event: done\ndata: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: (error as Error).message });
      }
    } finally {
      activeLlmRequests--;
      titanActiveSessions.dec();
      const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
      titanRequestDuration.observe(durationSec, { channel });
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
    const isLocalDev = fs.existsSync(join(process.cwd(), '.git'));
    const restart = req.body?.restart === true;

    let command = 'npm update -g titan-agent';
    if (isLocalDev) {
      command = 'git pull && npm run build';
    }

    logger.info(COMPONENT, `Triggering update: ${command} (restart=${restart})`);

    exec(command, { timeout: 120_000 }, (error, stdout, _stderr) => {
      if (error) {
        logger.error(COMPONENT, `Update failed: ${error.message}`);
        if (!res.headersSent) res.json({ ok: false, error: error.message });
        return;
      }

      logger.info(COMPONENT, `Update completed successfully.\\n${stdout}`);
      if (!res.headersSent) {
        res.json({ ok: true, message: 'Update completed', restarting: restart, output: stdout.slice(-500) });
      }

      if (restart) {
        logger.info(COMPONENT, 'Scheduling restart in 2 seconds...');
        const cwd = process.cwd();
        const scriptPath = '/tmp/titan-restart.sh';
        fs.writeFileSync(scriptPath, [
          '#!/bin/bash',
          'sleep 2',
          `cd "${cwd}"`,
          'nohup node dist/cli/index.js gateway >> /tmp/titan-gateway.log 2>&1 &',
        ].join('\n'), { mode: 0o755 });

        spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref();

        setTimeout(() => {
          logger.info(COMPONENT, 'Exiting for restart...');
          process.exit(0);
        }, 1000);
      }
    });
  });

  // Config endpoints
  app.get('/api/config', (_req, res) => {
    const cfg = loadConfig();
    // Return config with sensitive fields masked
    res.json({
      model: cfg.agent.model,
      provider: cfg.agent.provider || 'openai',
      voice: {
        enabled: Boolean(cfg.voice?.enabled),
        livekitUrl: cfg.voice?.livekitUrl || '',
        agentUrl: cfg.voice?.agentUrl || '',
      },
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
        groq: { configured: Boolean(cfg.providers.groq?.apiKey) },
        mistral: { configured: Boolean(cfg.providers.mistral?.apiKey) },
        openrouter: { configured: Boolean(cfg.providers.openrouter?.apiKey) },
        fireworks: { configured: Boolean(cfg.providers.fireworks?.apiKey) },
        xai: { configured: Boolean(cfg.providers.xai?.apiKey) },
        together: { configured: Boolean(cfg.providers.together?.apiKey) },
        deepseek: { configured: Boolean(cfg.providers.deepseek?.apiKey) },
        perplexity: { configured: Boolean(cfg.providers.perplexity?.apiKey) },
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
      if (body.groqKey !== undefined) { cfg.providers.groq.apiKey = body.groqKey as string; changedFields.push('providers.groq.apiKey'); }
      if (body.mistralKey !== undefined) { cfg.providers.mistral.apiKey = body.mistralKey as string; changedFields.push('providers.mistral.apiKey'); }
      if (body.openrouterKey !== undefined) { cfg.providers.openrouter.apiKey = body.openrouterKey as string; changedFields.push('providers.openrouter.apiKey'); }
      if (body.fireworksKey !== undefined) { cfg.providers.fireworks.apiKey = body.fireworksKey as string; changedFields.push('providers.fireworks.apiKey'); }
      if (body.xaiKey !== undefined) { cfg.providers.xai.apiKey = body.xaiKey as string; changedFields.push('providers.xai.apiKey'); }
      if (body.togetherKey !== undefined) { cfg.providers.together.apiKey = body.togetherKey as string; changedFields.push('providers.together.apiKey'); }
      if (body.deepseekKey !== undefined) { cfg.providers.deepseek.apiKey = body.deepseekKey as string; changedFields.push('providers.deepseek.apiKey'); }
      if (body.perplexityKey !== undefined) { cfg.providers.perplexity.apiKey = body.perplexityKey as string; changedFields.push('providers.perplexity.apiKey'); }
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
          'googleKey', 'ollamaUrl', 'groqKey', 'mistralKey', 'openrouterKey', 'fireworksKey', 'xaiKey',
          'togetherKey', 'deepseekKey', 'perplexityKey', 'maxTokens', 'temperature', 'systemPrompt',
          'shieldEnabled', 'shieldMode', 'deniedTools', 'networkAllowlist', 'gatewayPort', 'gatewayAuthMode',
          'gatewayPassword', 'gatewayToken', 'channels', 'googleOAuthClientId', 'googleOAuthClientSecret'];
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

  app.get('/api/fallback-state', (_req, res) => {
    const state = getFallbackState();
    res.json(state || { active: null });
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
    const { getActiveRemoteTaskCount } = await import('../mesh/transport.js');
    const { discoverAllModels: discoverModels } = await import('../providers/router.js');
    const models = await discoverModels();
    const { listAgents: meshListAgents } = await import('../agent/multiAgent.js');
    const cpuLoad = getCpuLoad();
    const activeTasks = getActiveRemoteTaskCount();
    // Load score: 0.0 (idle) to 1.0 (maxed). Blend CPU + task saturation.
    const taskLoad = activeTasks / Math.max(cfg.mesh.maxRemoteTasks, 1);
    const load = Math.min(1, cpuLoad * 0.4 + taskLoad * 0.6);
    res.json({
      titan: true,
      nodeId: getOrCreateNodeId(),
      version: TITAN_VERSION,
      models: models.map(m => m.id),
      agentCount: meshListAgents().length,
      load: Math.round(load * 100) / 100,
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

  app.get('/api/mesh/pending', async (_req, res) => {
    const cfg = loadConfig();
    if (!cfg.mesh.enabled) { res.json({ pending: [], enabled: false }); return; }
    const { getPendingPeers } = await import('../mesh/discovery.js');
    res.json({ pending: getPendingPeers(), enabled: true });
  });

  app.post('/api/mesh/approve/:nodeId', async (req, res) => {
    const cfg = loadConfig();
    if (!cfg.mesh.enabled) { res.status(400).json({ error: 'Mesh not enabled' }); return; }
    const { approvePeer } = await import('../mesh/discovery.js');
    const peer = approvePeer(req.params.nodeId);
    if (peer) {
      broadcast({ type: 'mesh_peer_approved', peer });
      res.json({ approved: true, peer });
    } else {
      res.status(404).json({ error: 'Peer not found in pending list or at max capacity' });
    }
  });

  app.post('/api/mesh/reject/:nodeId', async (req, res) => {
    const cfg = loadConfig();
    if (!cfg.mesh.enabled) { res.status(400).json({ error: 'Mesh not enabled' }); return; }
    const { rejectPeer } = await import('../mesh/discovery.js');
    const rejected = rejectPeer(req.params.nodeId);
    res.json({ rejected });
  });

  app.post('/api/mesh/revoke/:nodeId', async (req, res) => {
    const cfg = loadConfig();
    if (!cfg.mesh.enabled) { res.status(400).json({ error: 'Mesh not enabled' }); return; }
    const { revokePeer } = await import('../mesh/discovery.js');
    const revoked = revokePeer(req.params.nodeId);
    if (revoked) {
      broadcast({ type: 'mesh_peer_revoked', nodeId: req.params.nodeId });
    }
    res.json({ revoked });
  });

  // ── Teams RBAC API ─────────────────────────────────────────────

  app.get('/api/teams', (_req, res) => {
    res.json({ teams: listTeams().map(t => ({ id: t.id, name: t.name, description: t.description, memberCount: t.members.filter(m => m.status === 'active').length, createdAt: t.createdAt })) });
  });

  app.post('/api/teams', (req, res) => {
    try {
      const { name, description, ownerId = 'api-user' } = req.body;
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const team = createTeam(name, ownerId, description);
      res.status(201).json({ team: { id: team.id, name: team.name } });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  app.get('/api/teams/:teamId', (req, res) => {
    const team = getTeam(req.params.teamId);
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }
    res.json({ team, stats: getTeamStats(req.params.teamId) });
  });

  app.patch('/api/teams/:teamId', (req, res) => {
    try {
      const { name, description, actorId = 'api-user' } = req.body;
      const team = updateTeam(req.params.teamId, actorId, { name, description });
      res.json({ team: { id: team.id, name: team.name, description: team.description } });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  app.delete('/api/teams/:teamId', (req, res) => {
    try {
      const actorId = (req.query.actorId as string) || 'api-user';
      const deleted = deleteTeam(req.params.teamId, actorId);
      res.json({ deleted });
    } catch (e) { res.status(403).json({ error: (e as Error).message }); }
  });

  app.get('/api/teams/:teamId/members', (req, res) => {
    const team = getTeam(req.params.teamId);
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }
    res.json({ members: team.members });
  });

  app.post('/api/teams/:teamId/members', (req, res) => {
    try {
      const { userId, role = 'operator', displayName, actorId = 'api-user' } = req.body;
      if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }
      const member = addMember(req.params.teamId, actorId, userId, role, displayName);
      res.status(201).json({ member });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  app.delete('/api/teams/:teamId/members/:userId', (req, res) => {
    try {
      const actorId = (req.query.actorId as string) || 'api-user';
      const removed = removeMember(req.params.teamId, actorId, req.params.userId);
      res.json({ removed });
    } catch (e) { res.status(403).json({ error: (e as Error).message }); }
  });

  app.patch('/api/teams/:teamId/members/:userId/role', (req, res) => {
    try {
      const { role, actorId = 'api-user' } = req.body;
      if (!role) { res.status(400).json({ error: 'role is required' }); return; }
      const member = updateMemberRole(req.params.teamId, actorId, req.params.userId, role);
      res.json({ member });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  app.post('/api/teams/:teamId/invites', (req, res) => {
    try {
      const { role = 'operator', expiresInHours = 48, actorId = 'api-user' } = req.body;
      const code = createInvite(req.params.teamId, actorId, role, expiresInHours);
      res.status(201).json({ code, expiresInHours });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  app.post('/api/teams/join', (req, res) => {
    try {
      const { code, userId, displayName } = req.body;
      if (!code || !userId) { res.status(400).json({ error: 'code and userId are required' }); return; }
      const result = acceptInvite(code, userId, displayName);
      res.json({ teamId: result.team.id, teamName: result.team.name, role: result.member.role });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  app.get('/api/teams/:teamId/permissions/:userId', (req, res) => {
    const perms = getEffectivePermissions(req.params.teamId, req.params.userId);
    const role = getUserRole(req.params.teamId, req.params.userId);
    res.json({ role, permissions: perms });
  });

  app.put('/api/teams/:teamId/roles/:role/permissions', (req, res) => {
    try {
      const { actorId = 'api-user', ...perms } = req.body;
      setRolePermissions(req.params.teamId, actorId, req.params.role as 'admin' | 'operator' | 'viewer', perms);
      res.json({ updated: true });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  app.get('/api/teams/:teamId/tools/:toolName/check/:userId', (req, res) => {
    const allowed = isToolAllowed(req.params.teamId, req.params.userId, req.params.toolName);
    res.json({ allowed, tool: req.params.toolName, userId: req.params.userId });
  });

  // ── Recipes / Workflow API ──────────────────────────────────────

  app.get('/api/recipes', (_req, res) => {
    res.json({ recipes: listRecipes() });
  });

  app.get('/api/recipes/:id', (req, res) => {
    const recipe = getRecipe(req.params.id);
    if (!recipe) { res.status(404).json({ error: 'Recipe not found' }); return; }
    res.json({ recipe });
  });

  app.post('/api/recipes', (req, res) => {
    const recipe = req.body;
    if (!recipe.id || !recipe.name || !recipe.steps) {
      res.status(400).json({ error: 'id, name, and steps are required' }); return;
    }
    if (!recipe.createdAt) recipe.createdAt = new Date().toISOString();
    saveRecipe(recipe);
    res.status(201).json({ recipe });
  });

  app.put('/api/recipes/:id', (req, res) => {
    const existing = getRecipe(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Recipe not found' }); return; }
    const updated = { ...existing, ...req.body, id: req.params.id };
    saveRecipe(updated);
    res.json({ recipe: updated });
  });

  app.delete('/api/recipes/:id', (req, res) => {
    if (!getRecipe(req.params.id)) { res.status(404).json({ error: 'Recipe not found' }); return; }
    deleteRecipe(req.params.id);
    res.json({ deleted: true });
  });

  app.get('/api/recipes/builtin/templates', (_req, res) => {
    res.json({ templates: getBuiltinRecipes() });
  });

  app.post('/api/recipes/import', express.text({ type: 'text/*' }), (req, res) => {
    try {
      const recipe = importRecipeYaml(req.body);
      saveRecipe(recipe);
      res.status(201).json({ recipe });
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });

  // ── Plugins API ────────────────────────────────────────────────
  app.get('/api/plugins', async (_req, res) => {
    const { getPlugins } = await import('../plugins/registry.js');
    const plugins = getPlugins().map((p: { name: string; version: string }) => ({
      name: p.name,
      version: p.version,
    }));
    res.json({ plugins });
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

  app.post('/api/autopilot/toggle', (req, res) => {
    try {
      const cfg = loadConfig();
      const enable = typeof req.body.enabled === 'boolean' ? req.body.enabled : !cfg.autopilot.enabled;
      cfg.autopilot.enabled = enable;
      if (enable) {
        initAutopilot(cfg);
      } else {
        stopAutopilot();
      }
      res.json({ enabled: enable });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── Goals API ─────────────────────────────────────────────

  app.get('/api/goals', (_req, res) => {
    res.json({ goals: listGoals() });
  });

  app.post('/api/goals', (req, res) => {
    const { title, description, subtasks, priority, tags } = req.body;
    if (!title) { res.status(400).json({ error: 'title is required' }); return; }
    const goal = createGoal({
      title,
      description: description || '',
      subtasks: subtasks || [],
      priority,
      tags,
    });
    res.status(201).json({ goal });
  });

  app.get('/api/goals/:id', (req, res) => {
    const goal = getGoal(req.params.id);
    if (!goal) { res.status(404).json({ error: 'Goal not found' }); return; }
    res.json({ goal });
  });

  app.delete('/api/goals/:id', (req, res) => {
    const deleted = deleteGoal(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'Goal not found' }); return; }
    res.json({ deleted: true });
  });

  app.post('/api/goals/:id/subtasks', (req, res) => {
    const { title, description } = req.body;
    if (!title) { res.status(400).json({ error: 'title is required' }); return; }
    const subtask = addSubtask(req.params.id, title, description || '');
    if (!subtask) { res.status(404).json({ error: 'Goal not found' }); return; }
    res.status(201).json({ subtask });
  });

  app.post('/api/goals/:id/subtasks/:sid/complete', (req, res) => {
    const ok = completeSubtask(req.params.id, req.params.sid, req.body.result || 'Completed via UI');
    if (!ok) { res.status(404).json({ error: 'Goal or subtask not found' }); return; }
    res.json({ completed: true });
  });

  // ── Cron API ──────────────────────────────────────────────

  app.get('/api/cron', (_req, res) => {
    const store = getDb();
    res.json({ jobs: store.cronJobs });
  });

  app.post('/api/cron', (req, res) => {
    const { name, schedule, command } = req.body;
    if (!name || !schedule || !command) {
      res.status(400).json({ error: 'name, schedule, and command are required' }); return;
    }
    const store = getDb();
    const id = crypto.randomUUID();
    store.cronJobs.push({ id, name, schedule, command, enabled: true, created_at: new Date().toISOString() });
    res.status(201).json({ job: { id, name, schedule, command, enabled: true } });
  });

  app.post('/api/cron/:id/toggle', (req, res) => {
    const store = getDb();
    const job = store.cronJobs.find(j => j.id === req.params.id);
    if (!job) { res.status(404).json({ error: 'Cron job not found' }); return; }
    job.enabled = typeof req.body.enabled === 'boolean' ? req.body.enabled : !job.enabled;
    res.json({ job });
  });

  app.delete('/api/cron/:id', (req, res) => {
    const store = getDb();
    const idx = store.cronJobs.findIndex(j => j.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'Cron job not found' }); return; }
    store.cronJobs.splice(idx, 1);
    res.json({ deleted: true });
  });

  // ── Recipe Run API ────────────────────────────────────────

  app.post('/api/recipes/:id/run', async (req, res) => {
    const recipe = getRecipe(req.params.id);
    if (!recipe) { res.status(404).json({ error: 'Recipe not found' }); return; }
    try {
      const params = req.body.params || {};
      const steps: Array<{ stepIndex: number; prompt: string }> = [];
      for await (const step of runRecipe(req.params.id, params)) {
        steps.push({ stepIndex: step.stepIndex, prompt: step.prompt });
      }
      res.json({ recipe: recipe.name, stepsExecuted: steps.length, steps });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── Voice ──────────────────────────────────────────────────
  app.get('/api/voice/status', async (_req, res) => {
    const cfg = loadConfig();
    const voice = cfg.voice;
    if (!voice.enabled) {
      res.json({ available: false, reason: 'Voice not enabled in config' });
      return;
    }
    try {
      // Ping LiveKit server health endpoint
      const livekitHttp = voice.livekitUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const resp = await fetch(livekitHttp, { signal: AbortSignal.timeout(3000) });
      res.json({
        available: resp.ok,
        livekitUrl: voice.livekitUrl,
        ttsVoice: voice.ttsVoice,
      });
    } catch {
      res.json({ available: false, livekitUrl: voice.livekitUrl, reason: 'LiveKit server unreachable' });
    }
  });

  app.get('/api/voice/config', (_req, res) => {
    const cfg = loadConfig();
    res.json(cfg.voice);
  });

  // LiveKit token generation (ported from titan-voice-ui)
  app.post('/api/livekit/token', async (req, res) => {
    const cfg = loadConfig();
    if (!cfg.voice?.enabled) {
      res.status(404).json({ error: 'Voice not enabled' });
      return;
    }
    try {
      const lkModule = 'livekit-server-sdk';
      const livekitSdk: any = await import(lkModule).catch(() => null);
      if (!livekitSdk?.AccessToken) {
        res.status(500).json({ error: 'livekit-server-sdk not installed. Run: npm install livekit-server-sdk' });
        return;
      }
      const { AccessToken } = livekitSdk;
      const participantIdentity = `voice_user_${Math.floor(Math.random() * 10_000)}`;
      const roomName = `voice_room_${Math.floor(Math.random() * 10_000)}`;
      const at = new AccessToken(cfg.voice.livekitApiKey, cfg.voice.livekitApiSecret, {
        identity: participantIdentity,
        name: 'user',
        ttl: '15m',
      });
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
      });
      // Use the browser's request hostname so LiveKit URL works over Tailscale / remote
      let serverUrl = cfg.voice.livekitUrl;
      try {
        const reqHost = req.hostname || req.headers.host?.split(':')[0];
        if (reqHost) {
          const parsed = new URL(serverUrl);
          parsed.hostname = reqHost;
          serverUrl = parsed.toString().replace(/\/$/, '');
        }
      } catch { /* keep original */ }
      res.json({
        serverUrl,
        roomName,
        participantName: 'user',
        participantToken: await at.toJwt(),
      });
    } catch (err) {
      logger.error(COMPONENT, `LiveKit token error: ${(err as Error).message}`);
      res.status(500).json({ error: 'Failed to generate LiveKit token. Is livekit-server-sdk installed?' });
    }
  });

  // Voice health check (checks all voice services)
  app.get('/api/voice/health', async (_req, res) => {
    const cfg = loadConfig();
    if (!cfg.voice?.enabled) {
      res.json({ livekit: false, whisper: false, kokoro: false, agent: false, overall: false });
      return;
    }
    const results = { livekit: false, whisper: false, kokoro: false, agent: false, overall: false };
    const sttUrl = cfg.voice.sttUrl || 'http://localhost:8300';
    const ttsUrl = cfg.voice.ttsUrl || 'http://localhost:8880';
    const checks = [
      { key: 'livekit' as const, url: cfg.voice.livekitUrl.replace('ws://', 'http://').replace('wss://', 'https://') },
      { key: 'agent' as const, url: cfg.voice.agentUrl },
      { key: 'whisper' as const, url: `${sttUrl}/health` },
      { key: 'kokoro' as const, url: `${ttsUrl}/v1/audio/voices` },
    ];
    await Promise.allSettled(checks.map(async ({ key, url }) => {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
        results[key] = resp.ok || resp.status < 500;
      } catch { results[key] = false; }
    }));
    results.overall = results.livekit && results.whisper && results.kokoro;
    res.json(results);
  });

  // Voice preview — synthesize a short sample and return audio
  app.post('/api/voice/preview', async (req, res) => {
    const cfg = loadConfig();
    const voiceId = req.body?.voice || cfg.voice?.ttsVoice || 'af_heart';
    const text = req.body?.text || 'Hey! I\'m TITAN, your AI assistant.';
    const kokoroUrl = 'http://localhost:8880/v1/audio/speech';

    try {
      const ttsRes = await fetch(kokoroUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer not-needed' },
        body: JSON.stringify({ model: 'kokoro', voice: voiceId, input: text, response_format: 'mp3' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!ttsRes.ok) {
        res.status(502).json({ error: 'TTS service unavailable' });
        return;
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      const buffer = Buffer.from(await ttsRes.arrayBuffer());
      res.send(buffer);
    } catch {
      res.status(502).json({ error: 'TTS service unavailable' });
    }
  });

  // Voice available voices
  app.get('/api/voice/voices', async (_req, res) => {
    try {
      const kokoroRes = await fetch('http://localhost:8880/v1/audio/voices', { signal: AbortSignal.timeout(3000) });
      if (!kokoroRes.ok) { res.json({ voices: [] }); return; }
      const data = await kokoroRes.json() as { voices?: string[] };
      res.json(data);
    } catch {
      res.json({ voices: [] });
    }
  });

  // ── Tunnel ─────────────────────────────────────────────────
  app.get('/api/tunnel/status', (_req, res) => {
    res.json(getTunnelStatus());
  });

  // ── Google OAuth Endpoints ───────────────────────────────
  function getGoogleRedirectUri(): string {
    const cfg = loadConfig();
    const publicUrl = (cfg.gateway as Record<string, unknown>).publicUrl as string | undefined;
    return publicUrl
      ? `${publicUrl}/api/auth/google/callback`
      : `http://127.0.0.1:${port}/api/auth/google/callback`;
  }

  app.get('/api/auth/google/status', (_req, res) => {
    res.json({ connected: isGoogleConnected(), email: getGoogleEmail() });
  });

  app.get('/api/auth/google/start', (req, res) => {
    try {
      const url = getConsentUrl(getGoogleRedirectUri());
      res.redirect(url);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) { res.status(400).send('Missing authorization code'); return; }
    try {
      await exchangeCode(code, getGoogleRedirectUri());
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

      const { content, aboutMe, personality } = req.body as {
        content?: string;
        aboutMe?: string;
        personality?: string;
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
        '/api/mesh/peers':         { get:  { summary: 'List connected mesh peers',              tags: ['Mesh'] } },
        '/api/mesh/models':        { get:  { summary: 'List mesh models',                       tags: ['Mesh'] } },
        '/api/mesh/pending':       { get:  { summary: 'List peers awaiting approval',           tags: ['Mesh'] } },
        '/api/mesh/approve/:nodeId': { post: { summary: 'Approve a discovered peer',            tags: ['Mesh'] } },
        '/api/mesh/reject/:nodeId': { post: { summary: 'Reject a pending peer',                 tags: ['Mesh'] } },
        '/api/mesh/revoke/:nodeId': { post: { summary: 'Disconnect and revoke a peer',          tags: ['Mesh'] } },
        '/api/teams':              { get:  { summary: 'List all teams',                          tags: ['Teams'] },
                                     post: { summary: 'Create a new team',                        tags: ['Teams'] } },
        '/api/teams/{teamId}':     { get:  { summary: 'Get team details',                        tags: ['Teams'] },
                                     patch: { summary: 'Update team settings',                    tags: ['Teams'] },
                                     delete: { summary: 'Delete a team',                          tags: ['Teams'] } },
        '/api/teams/{teamId}/members':  { get:  { summary: 'List team members',                   tags: ['Teams'] },
                                          post: { summary: 'Add a team member',                    tags: ['Teams'] } },
        '/api/teams/{teamId}/members/{userId}': { delete: { summary: 'Remove a team member',      tags: ['Teams'] } },
        '/api/teams/{teamId}/members/{userId}/role': { patch: { summary: 'Update member role',    tags: ['Teams'] } },
        '/api/teams/{teamId}/invites':  { post: { summary: 'Create invite code',                  tags: ['Teams'] } },
        '/api/teams/join':         { post: { summary: 'Join team via invite code',                tags: ['Teams'] } },
        '/api/teams/{teamId}/permissions/{userId}': { get: { summary: 'Get user permissions',     tags: ['Teams'] } },
        '/api/teams/{teamId}/roles/{role}/permissions': { put: { summary: 'Set role permissions', tags: ['Teams'] } },
        '/api/logs':               { get:  { summary: 'Read log file',                          tags: ['Logs'], parameters: [{ name: 'lines', in: 'query', schema: { type: 'integer' } }] } },
        '/api/voice/status':       { get:  { summary: 'Voice server status and availability',    tags: ['Voice'] } },
        '/api/voice/config':       { get:  { summary: 'Voice configuration',                    tags: ['Voice'] } },
        '/api/tunnel/status':      { get:  { summary: 'Cloudflare tunnel status',               tags: ['Tunnel'] } },
        '/api/autopilot/status':   { get:  { summary: 'Autopilot status',                      tags: ['Autopilot'] } },
        '/api/autopilot/history':  { get:  { summary: 'Autopilot run history',                 tags: ['Autopilot'] } },
        '/api/autopilot/run':      { post: { summary: 'Trigger autopilot run',                 tags: ['Autopilot'] } },
        '/metrics':                { get:  { summary: 'Prometheus metrics endpoint',            tags: ['Telemetry'] } },
        '/api/metrics/summary':    { get:  { summary: 'Metrics summary (JSON)',                 tags: ['Telemetry'] } },
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
        { method: 'GET',  path: '/api/mesh/peers',       desc: 'List connected peers' },
        { method: 'GET',  path: '/api/mesh/models',      desc: 'List mesh models' },
        { method: 'GET',  path: '/api/mesh/pending',     desc: 'List peers awaiting approval' },
        { method: 'POST', path: '/api/mesh/approve/:id', desc: 'Approve a discovered peer' },
        { method: 'POST', path: '/api/mesh/reject/:id',  desc: 'Reject a pending peer' },
        { method: 'POST', path: '/api/mesh/revoke/:id',  desc: 'Disconnect & revoke a peer' },
      ]},
      { cat: 'Teams',    routes: [
        { method: 'GET',  path: '/api/teams',                    desc: 'List all teams' },
        { method: 'POST', path: '/api/teams',                    desc: 'Create a new team' },
        { method: 'GET',  path: '/api/teams/:id',                desc: 'Get team details' },
        { method: 'PATCH',path: '/api/teams/:id',                desc: 'Update team settings' },
        { method: 'DELETE',path: '/api/teams/:id',               desc: 'Delete a team' },
        { method: 'GET',  path: '/api/teams/:id/members',        desc: 'List team members' },
        { method: 'POST', path: '/api/teams/:id/members',        desc: 'Add a member' },
        { method: 'DELETE',path: '/api/teams/:id/members/:uid',  desc: 'Remove a member' },
        { method: 'PATCH',path: '/api/teams/:id/members/:uid/role', desc: 'Change member role' },
        { method: 'POST', path: '/api/teams/:id/invites',        desc: 'Create invite code' },
        { method: 'POST', path: '/api/teams/join',               desc: 'Join via invite code' },
        { method: 'GET',  path: '/api/teams/:id/permissions/:uid', desc: 'Get user permissions' },
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
      { cat: 'Telemetry', routes: [
        { method: 'GET',  path: '/metrics',              desc: 'Prometheus text exposition format' },
        { method: 'GET',  path: '/api/metrics/summary',  desc: 'Metrics summary (JSON)' },
      ]},
      { cat: 'Voice',    routes: [
        { method: 'GET',  path: '/api/voice/status',     desc: 'Voice server status and availability' },
        { method: 'GET',  path: '/api/voice/config',     desc: 'Voice configuration' },
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

  // ── SPA fallback (must be after all API routes) ──────────
  if (hasReactUI) {
    app.get('*', (req, res, next) => {
      // Don't intercept API, WebSocket, metrics, or legacy routes
      if (req.path.startsWith('/api/') || req.path === '/ws' || req.path === '/metrics' || req.path === '/legacy' || req.path === '/login') {
        return next();
      }
      res.sendFile(uiIndexPath);
    });
  }

  // Create HTTP server
  httpServer = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', async (ws, req) => {
   try {
    const cfg = loadConfig();
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // ── Mesh peer WebSocket connections ──────────────
    if (url.searchParams.get('mesh') === 'true' && cfg.mesh.enabled && cfg.mesh.secret) {
      const peerNodeId = url.searchParams.get('nodeId') || '';
      const authToken = url.searchParams.get('auth') || '';
      const { verifyMeshAuth, handleMeshWebSocket } = await import('../mesh/transport.js');
      const { getOrCreateNodeId } = await import('../mesh/identity.js');

      if (!verifyMeshAuth(authToken, peerNodeId, cfg.mesh.secret)) {
        logger.warn(COMPONENT, `Mesh auth rejected: nodeId=${peerNodeId}, ip=${req.socket.remoteAddress}`);
        ws.close(1008, 'Mesh auth failed');
        return;
      }

      const { getActiveRemoteTaskCount } = await import('../mesh/transport.js');

      handleMeshWebSocket(ws, peerNodeId, getOrCreateNodeId(), async (msg, reply) => {
        // Enforce allowRemoteModels
        const meshCfg = loadConfig().mesh;
        if (!meshCfg.allowRemoteModels) {
          reply({ error: 'Remote model access is disabled on this node' });
          return;
        }
        // Enforce maxRemoteTasks
        if (getActiveRemoteTaskCount() >= meshCfg.maxRemoteTasks) {
          reply({ error: 'Node at capacity — max remote tasks reached' });
          return;
        }
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

    ws.on('message', async (rawData, isBinary) => {
      try {
        // Ignore binary frames (legacy voice pipeline removed — use LiveKit WebRTC)
        if (isBinary) return;

        let data;
        try {
          data = JSON.parse(rawData.toString());
        } catch (parseErr) {
          logger.warn(COMPONENT, `Invalid WebSocket JSON: ${(parseErr as Error).message}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
          }
          return;
        }

        // Accept both 'chat' and 'message' types for compatibility
        if ((data.type === 'chat' || data.type === 'message') && data.content) {
          // Stream-enabled chat: send tokens as they arrive, then final message
          if (data.stream !== false && webChatChannel) {
            const chatUserId = data.userId || 'webchat-user';
            // Broadcast inbound message to all clients (for multi-tab visibility)
            broadcast({
              type: 'message', direction: 'inbound', channel: 'webchat',
              userId: chatUserId, content: data.content,
              timestamp: new Date().toISOString(),
            });

            try {
              const response = await routeMessage(data.content, 'webchat', chatUserId, {
                onToken: (token) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'token', data: token }));
                  }
                },
                onToolCall: (name, args) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'tool_call', name, args }));
                  }
                },
              });
              // Send done event to the originating client
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'done', content: response.content, model: response.model, durationMs: response.durationMs, tokenUsage: response.tokenUsage }));
              }
              // Broadcast final message to all other clients (non-streaming)
              for (const client of wsClients) {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'message', direction: 'outbound', channel: 'webchat',
                    userId: chatUserId, content: response.content,
                    model: response.model, durationMs: response.durationMs,
                    timestamp: new Date().toISOString(),
                  }));
                }
              }
            } catch (err) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'done', content: `Error: ${(err as Error).message}` }));
              }
            }
          } else if (webChatChannel) {
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
   } catch (err) {
      logger.error(COMPONENT, `WebSocket connection handler error: ${(err as Error).message}`);
      try { ws.close(1011, 'Internal error'); } catch { /* connection already closed */ }
   }
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
    ['irc', new IRCChannel()],
    ['mattermost', new MattermostChannel()],
    ['lark', new LarkChannel()],
    ['email_inbound', new EmailInboundChannel()],
    ['line', new LineChannel()],
    ['zulip', new ZulipChannel()],
  ];

  for (const [name, adapter] of channelAdapters) {
    adapter.on('message', handleInboundMessage);
    try {
      await adapter.connect();
      channels.set(name, adapter);
    } catch (error) {
      logger.debug(COMPONENT, `Channel ${name} not available: ${(error as Error).message}`);
    }
  }

  // ── Phase 3: Boot MCP servers, monitors, recipes, model switch, slash commands ──
  initSlashCommands();
  seedBuiltinRecipes();
  initMcpServers().catch((e) => logger.warn(COMPONENT, `MCP init error: ${e.message}`));
  mountMcpHttpEndpoints(app);

  // ── Persistent webhooks — reload saved webhooks ─────────────
  initPersistentWebhooks().catch((e) => logger.warn(COMPONENT, `Webhook init: ${(e as Error).message}`));

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
  if (config.mesh.enabled && !config.mesh.secret) {
    logger.warn(COMPONENT, 'Mesh is enabled but no secret is set. Run `titan mesh --init` to generate one. Mesh disabled.');
  }
  if (config.mesh.enabled && config.mesh.secret) {
    const { getOrCreateNodeId } = await import('../mesh/identity.js');
    const { startDiscovery, setOnPeerDiscovered, setConnectApprovedPeer, setMaxPeers } = await import('../mesh/discovery.js');
    const { connectToPeer, startHeartbeat } = await import('../mesh/transport.js');
    const nodeId = getOrCreateNodeId();

    // Set max peers limit
    setMaxPeers(config.mesh.maxPeers);

    // Notify dashboard when new peers are discovered
    setOnPeerDiscovered((peer) => {
      broadcast({
        type: 'mesh_peer_discovered',
        peer: {
          nodeId: peer.nodeId,
          hostname: peer.hostname,
          address: peer.address,
          port: peer.port,
          version: peer.version,
          models: peer.models,
          discoveredVia: peer.discoveredVia,
        },
      });
      logger.info(COMPONENT, `New TITAN node discovered: ${peer.hostname} (${peer.address}:${peer.port}) — approve via dashboard or CLI`);
    });

    // Wire up WebSocket connections for approved peers
    setConnectApprovedPeer((peer) => {
      if (config.mesh.secret) {
        connectToPeer(peer.address, peer.port, nodeId, config.mesh.secret)
          .then((ok) => {
            if (ok) {
              broadcast({ type: 'mesh_peer_connected', peer });
              logger.info(COMPONENT, `Connected to approved peer: ${peer.hostname}`);
            }
          })
          .catch(() => logger.debug(COMPONENT, `Approved peer unreachable: ${peer.hostname}`));
      }
    });

    await startDiscovery(nodeId, port, {
      mdns: config.mesh.mdns,
      tailscale: config.mesh.tailscale,
      autoApprove: config.mesh.autoApprove,
      peerStaleTimeoutMs: config.mesh.peerStaleTimeoutMs,
    });

    // Auto-bind to 0.0.0.0 when mesh is enabled (so peers can reach us)
    if (host === '127.0.0.1') {
      host = '0.0.0.0';
      logger.info(COMPONENT, 'Mesh enabled — binding to 0.0.0.0 (was 127.0.0.1) so peers can connect');
    }

    // Connect to static peers
    if (config.mesh.staticPeers.length > 0) {
      for (const addr of config.mesh.staticPeers) {
        const parts = addr.split(':');
        const peerHost = parts[0];
        const peerPort = parseInt(parts[1] || '48420', 10);
        if (!peerHost || isNaN(peerPort)) {
          logger.warn(COMPONENT, `Invalid static peer address: "${addr}" — expected host:port (e.g. 192.168.1.100:48420)`);
          continue;
        }
        connectToPeer(peerHost, peerPort, nodeId, config.mesh.secret)
          .catch(() => logger.debug(COMPONENT, `Static peer unreachable: ${addr}`));
      }
    }

    // Start heartbeat with dynamic model discovery
    startHeartbeat(nodeId, async () => {
      const { getActiveRemoteTaskCount: getTaskCount } = await import('../mesh/transport.js');
      const models = await discoverAllModels();
      const cpu = getCpuLoad();
      const taskLoad = getTaskCount() / Math.max(config.mesh.maxRemoteTasks, 1);
      const load = Math.min(1, cpu * 0.4 + taskLoad * 0.6);
      return {
        hostname: osHostname(),
        version: TITAN_VERSION,
        models: models.map(m => m.id),
        load: Math.round(load * 100) / 100,
      };
    }, config.mesh.heartbeatIntervalMs || 60_000);

    const mode = config.mesh.autoApprove ? 'auto-approve' : 'approval-required';
    logger.info(COMPONENT, `Mesh active — Node: ${nodeId.slice(0, 8)}... | mDNS: ${config.mesh.mdns} | Tailscale: ${config.mesh.tailscale} | Max peers: ${config.mesh.maxPeers} | Mode: ${mode}`);
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
