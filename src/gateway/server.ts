/**
 * TITAN — Gateway Server
 * WebSocket + HTTP server: the control plane for all channels, agents, tools, and the web UI.
 */
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../config/config.js';
import { processMessage } from '../agent/agent.js';
import { initMemory, getUsageStats } from '../memory/memory.js';
import { initBuiltinSkills, getSkills } from '../skills/registry.js';
import { getRegisteredTools } from '../agent/toolRunner.js';
import { listSessions } from '../agent/session.js';
import { healthCheckAll } from '../providers/router.js';
import { auditSecurity } from '../security/sandbox.js';
import { WebChatChannel, getOutboundQueue } from '../channels/webchat.js';
import { DiscordChannel } from '../channels/discord.js';
import { TelegramChannel } from '../channels/telegram.js';
import { SlackChannel } from '../channels/slack.js';
import { GoogleChatChannel } from '../channels/googlechat.js';
import { initAgents, routeMessage, listAgents, spawnAgent, stopAgent, getAgentCapacity } from '../agent/multiAgent.js';
import type { ChannelAdapter, InboundMessage } from '../channels/base.js';
import logger from '../utils/logger.js';
import { TITAN_VERSION, TITAN_NAME } from '../utils/constants.js';
import { getMissionControlHTML } from './dashboard.js';
import { initMcpServers } from '../mcp/registry.js';
import { initMonitors, setMonitorTriggerHandler } from '../agent/monitor.js';
import { seedBuiltinRecipes } from '../recipes/store.js';
import { parseSlashCommand, runRecipe } from '../recipes/runner.js';
import { initModelSwitchTool } from '../skills/builtin/model_switch.js';

const COMPONENT = 'Gateway';

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

  // ── Slash command / recipe interception ──────────────────────
  const slash = parseSlashCommand(msg.content);
  if (slash) {
    const { command, args } = slash;
    const params: Record<string, string> = {};
    if (args) params['file'] = args; params['topic'] = args; params['error'] = args;
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

/** Get the web dashboard HTML */
function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TITAN — Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0e1a; --surface: #111827; --surface-2: #1e293b;
      --border: #1e3a5f; --text: #e2e8f0; --text-dim: #94a3b8;
      --accent: #06b6d4; --accent-glow: rgba(6, 182, 212, 0.15);
      --success: #22c55e; --warn: #f59e0b; --error: #ef4444;
    }
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    .dashboard { display: grid; grid-template-columns: 280px 1fr; grid-template-rows: 60px 1fr; min-height: 100vh; }
    .header { grid-column: 1 / -1; background: var(--surface); border-bottom: 1px solid var(--border);
      display: flex; align-items: center; padding: 0 24px; gap: 16px; }
    .header h1 { font-size: 20px; font-weight: 700; background: linear-gradient(135deg, #06b6d4, #3b82f6);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 2px; }
    .header .version { color: var(--text-dim); font-size: 12px; font-family: 'JetBrains Mono'; }
    .sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 20px 16px;
      display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
    .nav-item { padding: 10px 14px; border-radius: 8px; cursor: pointer; font-size: 14px;
      color: var(--text-dim); transition: all 0.2s; display: flex; align-items: center; gap: 10px; }
    .nav-item:hover, .nav-item.active { background: var(--accent-glow); color: var(--accent); }
    .nav-item .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.on { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .dot.off { background: var(--error); }
    .main { padding: 24px; overflow-y: auto; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      padding: 20px; margin-bottom: 16px; }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--accent); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat { background: var(--surface-2); border-radius: 10px; padding: 16px; text-align: center; }
    .stat .value { font-size: 28px; font-weight: 700; color: var(--accent); font-family: 'JetBrains Mono'; }
    .stat .label { font-size: 12px; color: var(--text-dim); margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .chat-container { display: flex; flex-direction: column; height: calc(100vh - 140px); }
    .chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .msg { max-width: 80%; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; word-break: break-word; }
    .msg.user { background: #1e3a5f; align-self: flex-end; border-bottom-right-radius: 4px; }
    .msg.assistant { background: var(--surface-2); align-self: flex-start; border-bottom-left-radius: 4px; border: 1px solid var(--border); }
    .msg .meta { font-size: 11px; color: var(--text-dim); margin-top: 6px; }
    .chat-input { display: flex; gap: 10px; padding: 16px; border-top: 1px solid var(--border); }
    .chat-input input { flex: 1; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--surface-2); color: var(--text); font-size: 14px; outline: none;
      font-family: 'Inter', sans-serif; transition: border-color 0.2s; }
    .chat-input input:focus { border-color: var(--accent); }
    .chat-input button { padding: 12px 24px; border-radius: 10px; border: none;
      background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; font-weight: 600;
      cursor: pointer; font-size: 14px; transition: opacity 0.2s; }
    .chat-input button:hover { opacity: 0.9; }
    .chat-input button:disabled { opacity: 0.5; cursor: not-allowed; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--text-dim); font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
    .badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge.active { background: rgba(34,197,94,0.15); color: var(--success); }
    .badge.idle { background: rgba(245,158,11,0.15); color: var(--warn); }
    .hidden { display: none; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .typing { animation: pulse 1.5s infinite; color: var(--text-dim); font-style: italic; }
  </style>
</head>
<body>
  <div class="dashboard">
    <header class="header">
      <h1>⚡ TITAN</h1>
      <span class="version">v${TITAN_VERSION}</span>
      <span style="margin-left:auto;color:var(--text-dim);font-size:13px" id="status">Connecting...</span>
    </header>
    <aside class="sidebar">
      <div class="nav-item active" onclick="showPanel('overview')">📊 Overview</div>
      <div class="nav-item" onclick="showPanel('chat')">💬 WebChat</div>
      <div class="nav-item" onclick="showPanel('agents')">🤖 Agents</div>
      <div class="nav-item" onclick="showPanel('sessions')">🔗 Sessions</div>
      <div class="nav-item" onclick="showPanel('skills')">🧩 Skills</div>
      <div class="nav-item" onclick="showPanel('channels')">📡 Channels</div>
      <div class="nav-item" onclick="showPanel('security')">🔒 Security</div>
    </aside>
    <main class="main">
      <!-- Overview Panel -->
      <div id="panel-overview">
        <div class="stats" id="stats"></div>
        <div class="card"><h2>Recent Activity</h2><div id="activity">Loading...</div></div>
      </div>
      <!-- Chat Panel -->
      <div id="panel-chat" class="hidden">
        <div class="card chat-container">
          <h2>WebChat</h2>
          <div class="chat-messages" id="chat-messages"></div>
          <div class="chat-input">
            <input type="text" id="chat-input" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendMessage()">
            <button onclick="sendMessage()" id="send-btn">Send</button>
          </div>
        </div>
      </div>
      <!-- Agents Panel -->
      <div id="panel-agents" class="hidden"><div class="card"><h2>Agent Instances (max 5)</h2><div id="agents-list">Loading...</div></div></div>
      <!-- Sessions Panel -->
      <div id="panel-sessions" class="hidden"><div class="card"><h2>Active Sessions</h2><div id="sessions-list">Loading...</div></div></div>
      <!-- Skills Panel -->
      <div id="panel-skills" class="hidden"><div class="card"><h2>Installed Skills</h2><div id="skills-list">Loading...</div></div></div>
      <!-- Channels Panel -->
      <div id="panel-channels" class="hidden"><div class="card"><h2>Channel Status</h2><div id="channels-list">Loading...</div></div></div>
      <!-- Security Panel -->
      <div id="panel-security" class="hidden"><div class="card"><h2>Security Audit</h2><div id="security-audit">Loading...</div></div></div>
    </main>
  </div>
  <script>
    const ws = new WebSocket(\`ws://\${location.hostname}:\${location.port}\`);
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');

    ws.onopen = () => { document.getElementById('status').textContent = '🟢 Connected'; fetchData(); };
    ws.onclose = () => { document.getElementById('status').textContent = '🔴 Disconnected'; };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'message') {
        appendMessage(data.direction === 'inbound' ? 'user' : 'assistant', data.content, data);
      } else if (data.type === 'typing') {
        showTyping();
      }
    };

    function showPanel(name) {
      document.querySelectorAll('[id^=panel-]').forEach(p => p.classList.add('hidden'));
      document.getElementById('panel-' + name).classList.remove('hidden');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      event.target.closest('.nav-item').classList.add('active');
    }

    function appendMessage(role, content, meta = {}) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.innerHTML = content.replace(/\\n/g, '<br>');
      if (meta.durationMs) div.innerHTML += '<div class="meta">' + meta.durationMs + 'ms</div>';
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      document.getElementById('send-btn').disabled = false;
    }

    function sendMessage() {
      const content = chatInput.value.trim();
      if (!content) return;
      appendMessage('user', content);
      ws.send(JSON.stringify({ type: 'chat', content }));
      chatInput.value = '';
      document.getElementById('send-btn').disabled = true;
    }

    async function fetchData() {
      try {
        const [stats, sessions, skills, channelStatus, security, agentsData] = await Promise.all([
          fetch('/api/stats').then(r => r.json()),
          fetch('/api/sessions').then(r => r.json()),
          fetch('/api/skills').then(r => r.json()),
          fetch('/api/channels').then(r => r.json()),
          fetch('/api/security').then(r => r.json()),
          fetch('/api/agents').then(r => r.json()),
        ]);

        document.getElementById('stats').innerHTML = [
          { value: stats.totalRequests || 0, label: 'Total Requests' },
          { value: (stats.totalTokens || 0).toLocaleString(), label: 'Tokens Used' },
          { value: sessions.length || 0, label: 'Active Sessions' },
          { value: skills.length || 0, label: 'Skills Loaded' },
        ].map(s => '<div class="stat"><div class="value">' + s.value + '</div><div class="label">' + s.label + '</div></div>').join('');

        document.getElementById('sessions-list').innerHTML = sessions.length === 0 ? '<p style="color:var(--text-dim)">No active sessions</p>' :
          '<table><tr><th>ID</th><th>Channel</th><th>User</th><th>Messages</th><th>Status</th></tr>' +
          sessions.map(s => '<tr><td style="font-family:JetBrains Mono;font-size:12px">' + s.id.slice(0,8) + '</td><td>' + s.channel + '</td><td>' + (s.user_id||s.userId||'-') + '</td><td>' + (s.message_count||s.messageCount||0) + '</td><td><span class="badge active">active</span></td></tr>').join('') + '</table>';

        document.getElementById('skills-list').innerHTML =
          '<table><tr><th>Name</th><th>Source</th><th>Version</th><th>Status</th></tr>' +
          skills.map(s => '<tr><td>' + s.name + '</td><td>' + s.source + '</td><td>' + s.version + '</td><td><span class="badge active">enabled</span></td></tr>').join('') + '</table>';

        document.getElementById('channels-list').innerHTML =
          '<table><tr><th>Channel</th><th>Status</th></tr>' +
          channelStatus.map(c => '<tr><td>' + c.name + '</td><td><span class="dot ' + (c.connected ? 'on' : 'off') + '"></span> ' + (c.connected ? 'Connected' : 'Disconnected') + '</td></tr>').join('') + '</table>';

        document.getElementById('security-audit').innerHTML =
          security.map(i => '<div style="padding:8px 12px;margin:4px 0;border-radius:6px;background:' +
            (i.level==='error'?'rgba(239,68,68,0.1)':i.level==='warn'?'rgba(245,158,11,0.1)':'rgba(6,182,212,0.1)') +
            ';color:' + (i.level==='error'?'var(--error)':i.level==='warn'?'var(--warn)':'var(--text-dim)') +
            '">' + (i.level==='error'?'🚨':i.level==='warn'?'⚠️':'ℹ️') + ' ' + i.message + '</div>').join('');

        // Agents panel
        if (agentsData && agentsData.agents) {
          document.getElementById('agents-list').innerHTML =
            '<p style="color:var(--text-dim);margin-bottom:12px">Capacity: ' + agentsData.capacity.current + '/' + agentsData.capacity.max + '</p>' +
            '<table><tr><th>Name</th><th>ID</th><th>Model</th><th>Messages</th><th>Status</th></tr>' +
            agentsData.agents.map(a => '<tr><td>' + a.name + '</td><td style="font-family:JetBrains Mono;font-size:12px">' + a.id + '</td><td>' + a.model + '</td><td>' + a.messageCount + '</td><td><span class="badge ' + (a.status==='running'?'active':'idle') + '">' + a.status + '</span></td></tr>').join('') + '</table>';
        }
      } catch (e) { console.error('Failed to fetch data:', e); }
    }
    setInterval(fetchData, 30000);
  </script>
</body>
</html>`;
}

/** Start the Gateway server */
export async function startGateway(options?: { port?: number; host?: string; verbose?: boolean }): Promise<void> {
  const config = loadConfig();
  const port = options?.port || config.gateway.port;
  const host = options?.host || config.gateway.host;

  logger.info(COMPONENT, `Starting ${TITAN_NAME} Gateway v${TITAN_VERSION}`);

  // Initialize subsystems
  initMemory();
  await initBuiltinSkills();
  initAgents();

  // Create Express app
  const app = express();
  app.use(express.json());

  // Serve dashboard
  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getMissionControlHTML());
  });

  // API routes
  app.get('/api/stats', (_req, res) => {
    const stats = getUsageStats();
    res.json(stats);
  });

  app.get('/api/sessions', (_req, res) => {
    const sessions = listSessions();
    res.json(sessions);
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
  app.post('/api/message', async (req, res) => {
    const { content, channel = 'api', userId = 'api-user' } = req.body;
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    try {
      const response = await routeMessage(content, channel, userId);
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create HTTP server
  const server = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    logger.info(COMPONENT, `WebSocket client connected (${wsClients.size} total)`);

    ws.on('message', async (rawData) => {
      try {
        const data = JSON.parse(rawData.toString());
        if (data.type === 'chat' && data.content) {
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

  // ── Phase 3: Boot MCP servers, monitors, recipes, model switch ──
  initModelSwitchTool();
  seedBuiltinRecipes();
  initMcpServers().catch((e) => logger.warn(COMPONENT, `MCP init error: ${e.message}`));

  // Wire monitor triggers to agent
  setMonitorTriggerHandler(async (monitor, event) => {
    const prompt = `[AUTO-TRIGGER: ${monitor.name}] ${event.detail}\n\nYour task: ${monitor.prompt}`;
    const response = await processMessage(prompt, 'monitor', 'system');
    broadcast({ type: 'monitor_trigger', monitor: monitor.name, response: response.content, event });
    logger.info(COMPONENT, `Monitor "${monitor.name}" responded: ${response.content.slice(0, 100)}`);
  });
  initMonitors();

  // Start server
  server.listen(port, host, () => {
    logger.info(COMPONENT, `Gateway listening on http://${host}:${port}`);
    logger.info(COMPONENT, `Dashboard: http://${host}:${port}`);
    logger.info(COMPONENT, `WebSocket: ws://${host}:${port}`);
    logger.info(COMPONENT, `API: http://${host}:${port}/api/health`);
    logger.info(COMPONENT, `\nChannels: ${Array.from(channels.values()).map((c) => `${c.displayName} (${c.getStatus().connected ? '✅' : '❌'})`).join(', ')}`);
    logger.info(COMPONENT, `Skills: ${getSkills().length} loaded`);
    logger.info(COMPONENT, `Tools: ${getRegisteredTools().length} registered`);
  });
}
