/**
 * TITAN — Mission Control Dashboard
 * Full-featured web GUI: auth, working chat, config editor, live data.
 */

export function getMissionControlHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TITAN Mission Control</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0e1a;--bg2:#111827;--bg3:#1a1f36;--bg4:#252b48;
  --accent:#06b6d4;--accent2:#8b5cf6;--accent3:#10b981;--accent4:#f59e0b;
  --error:#ef4444;--warn:#f59e0b;
  --text:#e2e8f0;--text-dim:#94a3b8;--text-bright:#f8fafc;
  --border:#2a3050;--glow:0 0 20px rgba(6,182,212,.15);
  --radius:12px;--radius-sm:8px;
}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;height:100vh;overflow:hidden}

/* Sidebar */
.sidebar{width:240px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}
.logo-area{padding:20px;border-bottom:1px solid var(--border);text-align:center}
.logo-area h1{font-size:22px;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:2px}
.logo-area .version{font-size:11px;color:var(--text-dim);margin-top:4px;font-family:'JetBrains Mono',monospace}
.nav{flex:1;padding:12px 8px;overflow-y:auto}
.nav-section{font-size:10px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:1.5px;padding:12px 12px 6px;margin-top:8px}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--radius-sm);cursor:pointer;color:var(--text-dim);font-size:13px;font-weight:500;transition:all .15s;user-select:none}
.nav-item:hover{background:var(--bg3);color:var(--text)}
.nav-item.active{background:linear-gradient(135deg,rgba(6,182,212,.15),rgba(139,92,246,.1));color:var(--accent);border:1px solid rgba(6,182,212,.2)}
.nav-item .icon{font-size:16px;width:20px;text-align:center}
.sidebar-footer{padding:12px;border-top:1px solid var(--border)}
.logout-btn{width:100%;padding:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:var(--radius-sm);color:#ef4444;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s}
.logout-btn:hover{background:rgba(239,68,68,.2)}

/* Main */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{height:56px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 24px;flex-shrink:0}
.topbar h2{font-size:16px;font-weight:600}
.topbar .status{display:flex;gap:16px;align-items:center}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--accent3);box-shadow:0 0 8px var(--accent3);animation:pulse 2s infinite}
.status-dot.offline{background:var(--error);box-shadow:0 0 8px var(--error);animation:none}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.status-label{font-size:12px;color:var(--text-dim)}

.content{flex:1;overflow-y:auto;padding:24px}
.panel{display:none}
.panel.active{display:block}

/* Cards */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--glow);margin-bottom:20px}
.card h3{font-size:14px;font-weight:600;margin-bottom:16px;color:var(--text-bright)}
.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}

/* Stat cards */
.stat-card{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:16px;position:relative;overflow:hidden}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:var(--radius) var(--radius) 0 0}
.stat-card.cyan::before{background:linear-gradient(90deg,var(--accent),transparent)}
.stat-card.purple::before{background:linear-gradient(90deg,var(--accent2),transparent)}
.stat-card.green::before{background:linear-gradient(90deg,var(--accent3),transparent)}
.stat-card.amber::before{background:linear-gradient(90deg,var(--accent4),transparent)}
.stat-label{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px}
.stat-value{font-size:28px;font-weight:700;margin-top:4px;font-family:'JetBrains Mono',monospace}
.stat-sub{font-size:11px;color:var(--text-dim);margin-top:4px}

/* Tables */
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;border-bottom:2px solid var(--border);color:var(--text-dim);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600}
td{padding:10px 12px;border-bottom:1px solid var(--border)}
tr:hover{background:rgba(6,182,212,.03)}

/* Badges */
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
.badge.active{background:rgba(16,185,129,.15);color:var(--accent3)}
.badge.idle{background:rgba(148,163,184,.1);color:var(--text-dim)}
.badge.error{background:rgba(239,68,68,.15);color:var(--error)}
.badge.warn{background:rgba(245,158,11,.15);color:var(--warn)}
.badge.info{background:rgba(6,182,212,.15);color:var(--accent)}

/* Chat */
.chat-wrap{display:flex;flex-direction:column;height:calc(100vh - 140px)}
.chat-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:75%;padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.6;animation:fadeIn .2s;white-space:pre-wrap;word-break:break-word}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.msg.user{align-self:flex-end;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-bottom-right-radius:4px}
.msg.assistant{align-self:flex-start;background:var(--bg3);border:1px solid var(--border);border-bottom-left-radius:4px}
.msg .meta{font-size:11px;opacity:.6;margin-top:6px}
.chat-input-area{padding:16px;border-top:1px solid var(--border);display:flex;gap:12px;flex-shrink:0}
.chat-input-area input{flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;color:var(--text);font-size:14px;outline:none;transition:border .2s}
.chat-input-area input:focus{border-color:var(--accent)}
.chat-input-area button{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:none;padding:12px 24px;border-radius:var(--radius);font-weight:600;cursor:pointer;font-size:14px;transition:transform .1s,opacity .2s}
.chat-input-area button:hover{transform:scale(1.02)}
.chat-input-area button:disabled{opacity:.5;cursor:not-allowed;transform:none}

/* Buttons */
.btn{padding:8px 16px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:12px;font-weight:500;cursor:pointer;transition:all .15s}
.btn:hover{background:var(--bg4);border-color:var(--accent)}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;color:#fff}
.btn.primary:hover{opacity:.9;background:linear-gradient(135deg,var(--accent),var(--accent2))}
.btn.danger{background:rgba(239,68,68,.1);border-color:var(--error);color:var(--error)}
.btn.danger:hover{background:rgba(239,68,68,.2)}

/* Form inputs */
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.form-group input,.form-group select{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;color:var(--text);font-size:13px;outline:none;transition:border .2s}
.form-group input:focus,.form-group select:focus{border-color:var(--accent)}
.form-group select option{background:var(--bg3)}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.form-actions{display:flex;gap:12px;margin-top:20px}

/* Security audit items */
.audit-item{padding:10px 14px;margin-bottom:8px;border-radius:var(--radius-sm);display:flex;align-items:flex-start;gap:10px;font-size:13px}
.audit-item.error{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#fca5a5}
.audit-item.warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:#fcd34d}
.audit-item.info{background:rgba(6,182,212,.05);border:1px solid rgba(6,182,212,.15);color:var(--text-dim)}

/* Scrollbar */
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--bg4);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--border)}

/* Empty state */
.empty-state{text-align:center;padding:40px;color:var(--text-dim)}
.empty-state .icon{font-size:48px;margin-bottom:12px}
.empty-state p{font-size:14px}

/* Toast */
#toast{position:fixed;bottom:24px;right:24px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 20px;font-size:13px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none}
#toast.show{opacity:1}
#toast.success{border-color:var(--accent3);color:var(--accent3)}
#toast.error{border-color:var(--error);color:var(--error)}
</style>
</head>
<body>
<aside class="sidebar">
  <div class="logo-area">
    <h1>⚡ TITAN</h1>
    <div class="version" id="ver-label">Mission Control</div>
  </div>
  <nav class="nav">
    <div class="nav-section">Core</div>
    <div class="nav-item active" onclick="showPanel('overview',this)"><span class="icon">📊</span>Overview</div>
    <div class="nav-item" onclick="showPanel('chat',this)"><span class="icon">💬</span>WebChat</div>
    <div class="nav-item" onclick="showPanel('agents',this)"><span class="icon">🤖</span>Agents</div>
    <div class="nav-section">Config</div>
    <div class="nav-item" onclick="showPanel('config',this)"><span class="icon">⚙️</span>Settings</div>
    <div class="nav-item" onclick="showPanel('channels',this)"><span class="icon">📡</span>Channels</div>
    <div class="nav-section">Tools & Data</div>
    <div class="nav-item" onclick="showPanel('skills',this)"><span class="icon">🧩</span>Skills</div>
    <div class="nav-item" onclick="showPanel('sessions',this)"><span class="icon">🔗</span>Sessions</div>
    <div class="nav-item" onclick="showPanel('learning',this)"><span class="icon">🧠</span>Learning</div>
    <div class="nav-section">System</div>
    <div class="nav-item" onclick="showPanel('security',this)"><span class="icon">🔒</span>Security</div>
  </nav>
  <div class="sidebar-footer">
    <button class="logout-btn" onclick="logout()">🔓 Logout</button>
  </div>
</aside>

<main class="main">
  <header class="topbar">
    <h2 id="panel-title">📊 Overview</h2>
    <div class="status">
      <div class="status-dot" id="ws-dot"></div>
      <span class="status-label" id="ws-label">Connecting...</span>
      <span class="status-label" id="uptime-label"></span>
    </div>
  </header>

  <div class="content">
    <!-- Overview Panel -->
    <div id="panel-overview" class="panel active">
      <div class="card-grid">
        <div class="stat-card cyan"><div class="stat-label">Active Agents</div><div class="stat-value" id="s-agents">—</div><div class="stat-sub">of 5 max</div></div>
        <div class="stat-card purple"><div class="stat-label">Sessions</div><div class="stat-value" id="s-sessions">—</div><div class="stat-sub">active</div></div>
        <div class="stat-card green"><div class="stat-label">Skills Loaded</div><div class="stat-value" id="s-skills">—</div><div class="stat-sub">built-in + custom</div></div>
        <div class="stat-card amber"><div class="stat-label">Total Requests</div><div class="stat-value" id="s-requests">—</div><div class="stat-sub">this session</div></div>
      </div>
      <div class="card">
        <h3>System Health</h3>
        <div id="health-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
          <div><span style="color:var(--text-dim);font-size:12px">Version</span><div style="font-weight:600;margin-top:4px" id="h-version">—</div></div>
          <div><span style="color:var(--text-dim);font-size:12px">Uptime</span><div style="font-weight:600;margin-top:4px" id="h-uptime">—</div></div>
          <div><span style="color:var(--text-dim);font-size:12px">Memory</span><div style="font-weight:600;margin-top:4px" id="h-memory">—</div></div>
          <div><span style="color:var(--text-dim);font-size:12px">Model</span><div style="font-weight:600;margin-top:4px;font-size:13px" id="h-model">—</div></div>
          <div><span style="color:var(--text-dim);font-size:12px">Autonomy</span><div style="font-weight:600;margin-top:4px" id="h-autonomy">—</div></div>
          <div><span style="color:var(--text-dim);font-size:12px">Tokens Used</span><div style="font-weight:600;margin-top:4px" id="h-tokens">—</div></div>
        </div>
      </div>
    </div>

    <!-- Chat Panel -->
    <div id="panel-chat" class="panel">
      <div class="card" style="height:calc(100vh - 140px);display:flex;flex-direction:column;padding:0;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
          <h3 style="margin:0">💬 WebChat — talk to TITAN directly</h3>
        </div>
        <div class="chat-messages" id="chat-messages">
          <div class="msg assistant">👋 Hello! I'm TITAN. How can I help you today?</div>
        </div>
        <div class="chat-input-area">
          <input type="text" id="chat-input" placeholder="Type a message and press Enter…" onkeydown="if(event.key==='Enter'&&!event.shiftKey)sendChat()"/>
          <button id="send-btn" onclick="sendChat()">Send ⚡</button>
        </div>
      </div>
    </div>

    <!-- Agents Panel -->
    <div id="panel-agents" class="panel">
      <div class="card">
        <h3>Spawn New Agent</h3>
        <div class="form-row">
          <div class="form-group"><label>Agent Name</label><input type="text" id="agent-name" placeholder="e.g. Code Reviewer"/></div>
          <div class="form-group"><label>Model (optional)</label><input type="text" id="agent-model" placeholder="e.g. anthropic/claude-sonnet-4-20250514"/></div>
        </div>
        <button class="btn primary" onclick="spawnAgent()">⚡ Spawn Agent</button>
      </div>
      <div class="card">
        <h3>Agent Instances <span style="color:var(--text-dim);font-weight:400" id="agent-cap"></span></h3>
        <div id="agents-list"><div class="empty-state"><div class="icon">🤖</div><p>No agents running. Spawn one above.</p></div></div>
      </div>
    </div>

    <!-- Settings Panel -->
    <div id="panel-config" class="panel">
      <div class="card">
        <h3>AI Model & Behaviour</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Active Model</label>
            <input type="text" id="cfg-model" placeholder="e.g. anthropic/claude-sonnet-4-20250514"/>
          </div>
          <div class="form-group">
            <label>Autonomy Mode</label>
            <select id="cfg-autonomy">
              <option value="supervised">🟡 Supervised (safe default)</option>
              <option value="autonomous">🟢 Autonomous (full auto)</option>
              <option value="locked">🔴 Locked (approve every action)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Sandbox Mode</label>
            <select id="cfg-sandbox">
              <option value="host">🖥️ Host (full access)</option>
              <option value="docker">🐳 Docker (isolated)</option>
              <option value="none">🚫 None (no restrictions)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Log Level</label>
            <select id="cfg-loglevel">
              <option value="info">Info (recommended)</option>
              <option value="debug">Debug (verbose)</option>
              <option value="warn">Warn (quiet)</option>
              <option value="silent">Silent</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn primary" onclick="saveConfig()">💾 Save Changes</button>
          <button class="btn" onclick="loadConfig()">↺ Reset</button>
        </div>
      </div>
      <div class="card">
        <h3>Raw Configuration (read-only)</h3>
        <pre id="cfg-raw" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-dim);white-space:pre-wrap;max-height:400px;overflow-y:auto">Loading...</pre>
      </div>
    </div>

    <!-- Channels Panel -->
    <div id="panel-channels" class="panel">
      <div class="card">
        <h3>Channel Status</h3>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">To configure channel tokens, edit <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">~/.titan/titan.json</code> or re-run <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">titan onboard</code>.</p>
        <div id="channels-list">Loading...</div>
      </div>
    </div>

    <!-- Skills Panel -->
    <div id="panel-skills" class="panel">
      <div class="card">
        <h3>Installed Skills</h3>
        <div id="skills-list">Loading...</div>
      </div>
    </div>

    <!-- Sessions Panel -->
    <div id="panel-sessions" class="panel">
      <div class="card">
        <h3>Active Sessions</h3>
        <div id="sessions-list">Loading...</div>
      </div>
    </div>

    <!-- Learning Panel -->
    <div id="panel-learning" class="panel">
      <div class="card-grid">
        <div class="stat-card cyan"><div class="stat-label">Knowledge Entries</div><div class="stat-value" id="l-entries">—</div></div>
        <div class="stat-card purple"><div class="stat-label">Tools Tracked</div><div class="stat-value" id="l-tools">—</div></div>
        <div class="stat-card green"><div class="stat-label">Error Patterns</div><div class="stat-value" id="l-errors">—</div></div>
        <div class="stat-card amber"><div class="stat-label">User Corrections</div><div class="stat-value" id="l-corrections">—</div></div>
      </div>
      <div class="card">
        <h3>About the Learning Engine</h3>
        <p style="color:var(--text-dim);font-size:13px;line-height:1.6">TITAN's continuous learning engine records every tool execution, user correction, and successful pattern. It builds a knowledge base that is injected into every system prompt — making TITAN more effective with each interaction. Knowledge is stored in <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">~/.titan/knowledge.json</code>.</p>
      </div>
    </div>

    <!-- Security Panel -->
    <div id="panel-security" class="panel">
      <div class="card">
        <h3>Security Audit</h3>
        <div id="security-audit">Loading...</div>
      </div>
    </div>
  </div>
</main>

<div id="toast"></div>

<script>
// ── Auth ──────────────────────────────────────────────────────────
const token = localStorage.getItem('titan_token');
if (!token) { location.href = '/login'; }

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') };
}

function logout() {
  localStorage.removeItem('titan_token');
  location.href = '/login';
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  setTimeout(() => el.className = '', 2500);
}

// ── Panel navigation ──────────────────────────────────────────────
const panelTitles = {
  overview:'📊 Overview', chat:'💬 WebChat', agents:'🤖 Agents',
  config:'⚙️ Settings', channels:'📡 Channels', skills:'🧩 Skills',
  sessions:'🔗 Sessions', learning:'🧠 Learning', security:'🔒 Security'
};

function showPanel(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  if (el) el.closest('.nav-item').classList.add('active');
  document.getElementById('panel-title').textContent = panelTitles[name] || name;
}

// ── WebSocket ─────────────────────────────────────────────────────
let ws;
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host + '?token=' + encodeURIComponent(token || ''));
  ws.onopen = () => {
    document.getElementById('ws-dot').className = 'status-dot';
    document.getElementById('ws-label').textContent = '🟢 Connected';
  };
  ws.onclose = () => {
    document.getElementById('ws-dot').className = 'status-dot offline';
    document.getElementById('ws-label').textContent = '🔴 Disconnected';
    setTimeout(connectWS, 3000);
  };
  ws.onerror = () => {};
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      // Assistant response from the agent
      if (data.type === 'message' && data.direction === 'outbound') {
        appendMsg('assistant', data.content, data);
        document.getElementById('send-btn').disabled = false;
      }
      // Legacy response type
      if (data.type === 'response') {
        appendMsg('assistant', data.content, data);
        document.getElementById('send-btn').disabled = false;
      }
    } catch(err) {}
  };
}
connectWS();

// ── Chat ──────────────────────────────────────────────────────────
function appendMsg(role, content, meta) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = content;
  if (meta && meta.durationMs) {
    const m = document.createElement('div');
    m.className = 'meta';
    m.textContent = (meta.model || '') + ' · ' + meta.durationMs + 'ms' + (meta.tokenUsage ? ' · ' + (meta.tokenUsage.total || 0) + ' tokens' : '');
    div.appendChild(m);
  }
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  appendMsg('user', text, null);
  input.value = '';
  document.getElementById('send-btn').disabled = true;

  // Add a typing indicator
  const typing = document.createElement('div');
  typing.className = 'msg assistant';
  typing.id = 'typing-indicator';
  typing.textContent = '⏳ Thinking…';
  typing.style.opacity = '.6';
  document.getElementById('chat-messages').appendChild(typing);
  document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;

  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({type:'chat', content:text, userId:'dashboard'}));
    // Fallback: if no WS response within 60s re-enable button
    setTimeout(() => {
      const t = document.getElementById('typing-indicator');
      if (t) t.remove();
      document.getElementById('send-btn').disabled = false;
    }, 60000);
  } else {
    // HTTP fallback
    fetch('/api/message', {method:'POST', headers:authHeaders(), body:JSON.stringify({content:text})})
      .then(r => r.json())
      .then(data => {
        const t = document.getElementById('typing-indicator');
        if (t) t.remove();
        appendMsg('assistant', data.content || '(no response)', data);
        document.getElementById('send-btn').disabled = false;
      })
      .catch(() => {
        const t = document.getElementById('typing-indicator');
        if (t) t.remove();
        document.getElementById('send-btn').disabled = false;
      });
  }
}

// Remove typing indicator when response arrives (monkey-patch ws.onmessage)
const _origOnMessage = ws ? null : null;
function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}
// Patch into WS handler
const origOnMsg = ws.onmessage;
ws.onmessage = (e) => {
  removeTyping();
  if (origOnMsg) origOnMsg.call(ws, e);
};

// ── Agents ────────────────────────────────────────────────────────
async function spawnAgent() {
  const name = document.getElementById('agent-name').value.trim();
  const model = document.getElementById('agent-model').value.trim();
  if (!name) { toast('Agent name is required', 'error'); return; }
  const r = await fetch('/api/agents/spawn', {method:'POST', headers:authHeaders(), body:JSON.stringify({name, model:model||undefined})});
  const data = await r.json();
  if (data.error) { toast(data.error, 'error'); }
  else { document.getElementById('agent-name').value=''; document.getElementById('agent-model').value=''; toast('Agent spawned: ' + name); fetchData(); }
}

async function stopAgent(id) {
  await fetch('/api/agents/stop', {method:'POST', headers:authHeaders(), body:JSON.stringify({agentId:id})});
  toast('Agent stopped');
  fetchData();
}

// ── Config ────────────────────────────────────────────────────────
async function loadConfig() {
  const r = await fetch('/api/config', {headers:authHeaders()});
  const cfg = await r.json();
  document.getElementById('cfg-model').value = cfg.agent?.model || '';
  document.getElementById('cfg-autonomy').value = cfg.autonomy?.mode || 'supervised';
  document.getElementById('cfg-sandbox').value = cfg.security?.sandboxMode || 'host';
  document.getElementById('cfg-loglevel').value = cfg.logging?.level || 'info';
  document.getElementById('cfg-raw').textContent = JSON.stringify(cfg, null, 2);
}

async function saveConfig() {
  const body = {
    model: document.getElementById('cfg-model').value.trim(),
    autonomyMode: document.getElementById('cfg-autonomy').value,
    sandboxMode: document.getElementById('cfg-sandbox').value,
    logLevel: document.getElementById('cfg-loglevel').value,
  };
  const r = await fetch('/api/config', {method:'POST', headers:authHeaders(), body:JSON.stringify(body)});
  const data = await r.json();
  if (data.ok) { toast('Settings saved — restart gateway to apply model change'); loadConfig(); fetchData(); }
  else toast(data.error || 'Save failed', 'error');
}

// ── Data fetching ─────────────────────────────────────────────────
async function fetchData() {
  try {
    const [stats, sessions, skills, channelStatus, security, agents, learning] = await Promise.all([
      fetch('/api/stats', {headers:authHeaders()}).then(r=>r.json()).catch(()=>({})),
      fetch('/api/sessions', {headers:authHeaders()}).then(r=>r.json()).catch(()=>[]),
      fetch('/api/skills', {headers:authHeaders()}).then(r=>r.json()).catch(()=>[]),
      fetch('/api/channels', {headers:authHeaders()}).then(r=>r.json()).catch(()=>[]),
      fetch('/api/security', {headers:authHeaders()}).then(r=>r.json()).catch(()=>[]),
      fetch('/api/agents', {headers:authHeaders()}).then(r=>r.json()).catch(()=>({agents:[],capacity:{current:0,max:5}})),
      fetch('/api/learning', {headers:authHeaders()}).then(r=>r.json()).catch(()=>({})),
    ]);

    // Overview stats
    document.getElementById('s-agents').textContent = agents.capacity?.current ?? '—';
    document.getElementById('s-sessions').textContent = Array.isArray(sessions) ? sessions.length : '—';
    document.getElementById('s-skills').textContent = Array.isArray(skills) ? skills.length : '—';
    document.getElementById('s-requests').textContent = stats.totalRequests ?? '—';
    document.getElementById('agent-cap').textContent = '(' + (agents.capacity?.current||0) + '/' + (agents.capacity?.max||5) + ')';

    // Health
    document.getElementById('h-version').textContent = stats.version || '—';
    const up = stats.uptime || 0;
    const upStr = up > 3600 ? Math.floor(up/3600)+'h '+Math.floor((up%3600)/60)+'m' : Math.floor(up/60)+'m '+Math.floor(up%60)+'s';
    document.getElementById('h-uptime').textContent = upStr;
    document.getElementById('uptime-label').textContent = 'Up ' + upStr;
    document.getElementById('h-memory').textContent = (stats.memoryMB || '—') + ' MB';
    document.getElementById('h-tokens').textContent = (stats.totalTokens || 0).toLocaleString();
    document.getElementById('ver-label').textContent = stats.version ? 'v' + stats.version : 'Mission Control';

    // Agents
    if (agents.agents && agents.agents.length > 0) {
      document.getElementById('agents-list').innerHTML =
        '<table><tr><th>Name</th><th>ID</th><th>Model</th><th>Messages</th><th>Status</th><th>Action</th></tr>' +
        agents.agents.map(a=>'<tr><td><strong>'+a.name+'</strong></td><td style="font-family:JetBrains Mono;font-size:12px;color:var(--text-dim)">'+a.id.slice(0,8)+'</td><td style="font-size:12px">'+a.model+'</td><td>'+a.messageCount+'</td><td><span class="badge '+(a.status==='running'?'active':'idle')+'">'+a.status+'</span></td><td><button class="btn danger" onclick="stopAgent(\\''+a.id+'\\')">Stop</button></td></tr>').join('')+'</table>';
    }

    // Config overview health row
    if (agents.agents) {
      try {
        const cfgR = await fetch('/api/config', {headers:authHeaders()});
        const cfg = await cfgR.json();
        document.getElementById('h-model').textContent = cfg.agent?.model || '—';
        const aMode = cfg.autonomy?.mode || '—';
        document.getElementById('h-autonomy').textContent = aMode === 'supervised' ? '🟡 ' + aMode : aMode === 'autonomous' ? '🟢 ' + aMode : '🔴 ' + aMode;
      } catch(e) {}
    }

    // Sessions
    if (Array.isArray(sessions) && sessions.length > 0) {
      document.getElementById('sessions-list').innerHTML =
        '<table><tr><th>ID</th><th>Channel</th><th>User</th><th>Messages</th><th>Last Active</th></tr>' +
        sessions.map(s=>'<tr><td style="font-family:JetBrains Mono;font-size:12px;color:var(--text-dim)">'+s.id.slice(0,8)+'</td><td>'+s.channel+'</td><td>'+(s.userId||s.user_id||'—')+'</td><td>'+(s.messageCount||s.message_count||0)+'</td><td style="font-size:12px;color:var(--text-dim)">'+(s.lastActive||'—')+'</td></tr>').join('')+'</table>';
    } else {
      document.getElementById('sessions-list').innerHTML = '<div class="empty-state"><div class="icon">🔗</div><p>No active sessions yet. Start a conversation in WebChat.</p></div>';
    }

    // Skills
    if (Array.isArray(skills) && skills.length > 0) {
      document.getElementById('skills-list').innerHTML =
        '<table><tr><th>Skill</th><th>Version</th><th>Source</th><th>Status</th></tr>' +
        skills.map(s=>'<tr><td><strong>'+s.name+'</strong></td><td style="font-family:JetBrains Mono;font-size:12px">'+s.version+'</td><td><span class="badge info">'+s.source+'</span></td><td><span class="badge '+(s.enabled?'active':'idle')+'">'+(s.enabled?'enabled':'disabled')+'</span></td></tr>').join('')+'</table>';
    }

    // Channels — API returns array [{name, connected}]
    if (Array.isArray(channelStatus) && channelStatus.length > 0) {
      document.getElementById('channels-list').innerHTML =
        '<table><tr><th>Channel</th><th>Status</th></tr>' +
        channelStatus.map(c=>'<tr><td><strong>'+c.name+'</strong></td><td><span class="badge '+(c.connected?'active':'idle')+'">'+(c.connected?'✅ Connected':'⚫ Disconnected')+'</span></td></tr>').join('')+'</table>';
    } else {
      document.getElementById('channels-list').innerHTML = '<div class="empty-state"><p>No channel data available.</p></div>';
    }

    // Security audit — array of {level, message}
    if (Array.isArray(security) && security.length > 0) {
      document.getElementById('security-audit').innerHTML =
        security.map(i=>'<div class="audit-item '+i.level+'">'+(i.level==='error'?'🚨':i.level==='warn'?'⚠️':'ℹ️')+' <span>'+i.message+'</span></div>').join('');
    } else {
      document.getElementById('security-audit').innerHTML = '<div class="audit-item info">ℹ️ <span>No security issues found.</span></div>';
    }

    // Learning
    if (learning && typeof learning === 'object') {
      document.getElementById('l-entries').textContent = learning.knowledgeEntries ?? '—';
      document.getElementById('l-tools').textContent = learning.toolsTracked ?? '—';
      document.getElementById('l-errors').textContent = learning.errorPatterns ?? '—';
      document.getElementById('l-corrections').textContent = learning.corrections ?? '—';
    }

  } catch(e) { console.error('Fetch error:', e); }
}

// ── Init ──────────────────────────────────────────────────────────
fetchData();
loadConfig();
setInterval(fetchData, 15000);
</script>
</body>
</html>`;
}
