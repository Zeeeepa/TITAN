/**
 * TITAN — Mission Control Dashboard
 * A premium, full-featured web GUI served from the gateway.
 * Every feature accessible: agents, chat, sessions, skills, security, plans, learning, processes, logs.
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
  --border:#2a3050;--glow:0 0 20px rgba(6,182,212,0.15);
  --radius:12px;--radius-sm:8px;
}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;height:100vh;overflow:hidden}
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* Sidebar */
.sidebar{width:240px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}
.logo-area{padding:20px;border-bottom:1px solid var(--border);text-align:center}
.logo-area h1{font-size:22px;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:2px}
.logo-area .version{font-size:11px;color:var(--text-dim);margin-top:4px;font-family:'JetBrains Mono',monospace}
.nav{flex:1;padding:12px 8px;overflow-y:auto}
.nav-section{font-size:10px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:1.5px;padding:12px 12px 6px;margin-top:8px}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--radius-sm);cursor:pointer;color:var(--text-dim);font-size:13px;font-weight:500;transition:all .15s}
.nav-item:hover{background:var(--bg3);color:var(--text)}
.nav-item.active{background:linear-gradient(135deg,rgba(6,182,212,.15),rgba(139,92,246,.1));color:var(--accent);border:1px solid rgba(6,182,212,.2)}
.nav-item .icon{font-size:16px;width:20px;text-align:center}
.sidebar-footer{padding:12px;border-top:1px solid var(--border);font-size:11px;color:var(--text-dim);text-align:center}

/* Main */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{height:56px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 24px;flex-shrink:0}
.topbar h2{font-size:16px;font-weight:600}
.topbar .status{display:flex;gap:16px;align-items:center}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--accent3);box-shadow:0 0 8px var(--accent3);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.status-label{font-size:12px;color:var(--text-dim)}

.content{flex:1;overflow-y:auto;padding:24px;display:grid;gap:20px}
.panel{display:none}
.panel.active{display:block}

/* Cards */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--glow)}
.card h3{font-size:14px;font-weight:600;margin-bottom:12px;color:var(--text-bright)}
.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}

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
.chat-container{display:flex;flex-direction:column;height:calc(100vh - 140px)}
.chat-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:75%;padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.5;animation:fadeIn .2s}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.msg.user{align-self:flex-end;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-bottom-right-radius:4px}
.msg.assistant{align-self:flex-start;background:var(--bg3);border:1px solid var(--border);border-bottom-left-radius:4px}
.chat-input-area{padding:16px;border-top:1px solid var(--border);display:flex;gap:12px}
.chat-input-area input{flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;color:var(--text);font-size:14px;outline:none;transition:border .2s}
.chat-input-area input:focus{border-color:var(--accent)}
.chat-input-area button{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:none;padding:12px 24px;border-radius:var(--radius);font-weight:600;cursor:pointer;font-size:14px;transition:transform .1s}
.chat-input-area button:hover{transform:scale(1.02)}
.chat-input-area button:active{transform:scale(0.98)}

/* Buttons */
.btn{padding:8px 16px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:12px;font-weight:500;cursor:pointer;transition:all .15s}
.btn:hover{background:var(--bg4);border-color:var(--accent)}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;color:#fff}
.btn.danger{background:rgba(239,68,68,.1);border-color:var(--error);color:var(--error)}
.btn.danger:hover{background:rgba(239,68,68,.2)}

/* Form inputs */
.form-row{display:flex;gap:12px;margin-bottom:12px;align-items:center}
.form-row label{font-size:12px;color:var(--text-dim);min-width:80px}
.form-row input,.form-row select{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);font-size:13px;flex:1;outline:none}
.form-row input:focus,.form-row select:focus{border-color:var(--accent)}

/* Log entries */
.log-entry{padding:6px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;border-radius:4px;margin-bottom:4px}
.log-entry.error{background:rgba(239,68,68,.1);color:#fca5a5}
.log-entry.warn{background:rgba(245,158,11,.1);color:#fcd34d}
.log-entry.info{background:rgba(6,182,212,.05);color:var(--text-dim)}

/* Scrollbar */
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--bg4);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--border)}

/* Progress bar */
.progress-bar{height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-top:8px}
.progress-bar .fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px;transition:width .3s}

/* Empty state */
.empty-state{text-align:center;padding:40px;color:var(--text-dim)}
.empty-state .icon{font-size:48px;margin-bottom:12px}
.empty-state p{font-size:14px}
</style>
</head>
<body>
<aside class="sidebar">
  <div class="logo-area">
    <h1>⚡ TITAN</h1>
    <div class="version" id="version">Mission Control</div>
  </div>
  <nav class="nav">
    <div class="nav-section">Core</div>
    <div class="nav-item active" onclick="showPanel('overview')"><span class="icon">📊</span>Overview</div>
    <div class="nav-item" onclick="showPanel('chat')"><span class="icon">💬</span>WebChat</div>
    <div class="nav-item" onclick="showPanel('agents')"><span class="icon">🤖</span>Agents</div>
    <div class="nav-section">Tools</div>
    <div class="nav-item" onclick="showPanel('skills')"><span class="icon">🧩</span>Skills</div>
    <div class="nav-item" onclick="showPanel('processes')"><span class="icon">⚙️</span>Processes</div>
    <div class="nav-item" onclick="showPanel('plans')"><span class="icon">📋</span>Plans</div>
    <div class="nav-section">System</div>
    <div class="nav-item" onclick="showPanel('sessions')"><span class="icon">🔗</span>Sessions</div>
    <div class="nav-item" onclick="showPanel('channels')"><span class="icon">📡</span>Channels</div>
    <div class="nav-item" onclick="showPanel('security')"><span class="icon">🔒</span>Security</div>
    <div class="nav-item" onclick="showPanel('learning')"><span class="icon">🧠</span>Learning</div>
    <div class="nav-item" onclick="showPanel('logs')"><span class="icon">📜</span>Logs</div>
  </nav>
  <div class="sidebar-footer">TITAN — Mission Control<br/>The Intelligent Task Automation Network</div>
</aside>

<main class="main">
  <header class="topbar">
    <h2 id="panel-title">📊 Overview</h2>
    <div class="status">
      <div class="status-dot"></div>
      <span class="status-label" id="uptime">Online</span>
      <span class="status-label" id="agent-count">0 agents</span>
    </div>
  </header>

  <div class="content">
    <!-- Overview Panel -->
    <div id="panel-overview" class="panel active">
      <div class="card-grid" id="stats-grid">
        <div class="stat-card cyan"><div class="stat-label">Active Agents</div><div class="stat-value" id="s-agents">0</div><div class="stat-sub">of 5 max</div></div>
        <div class="stat-card purple"><div class="stat-label">Sessions</div><div class="stat-value" id="s-sessions">0</div><div class="stat-sub">active</div></div>
        <div class="stat-card green"><div class="stat-label">Tools Available</div><div class="stat-value" id="s-tools">0</div><div class="stat-sub">17+ built-in</div></div>
        <div class="stat-card amber"><div class="stat-label">Knowledge</div><div class="stat-value" id="s-knowledge">0</div><div class="stat-sub">learned facts</div></div>
      </div>
      <div class="card" style="margin-top:20px">
        <h3>System Health</h3>
        <div id="health-info">Loading...</div>
      </div>
      <div class="card" style="margin-top:20px">
        <h3>Recent Activity</h3>
        <div id="activity-feed">Loading...</div>
      </div>
    </div>

    <!-- Chat Panel -->
    <div id="panel-chat" class="panel">
      <div class="card" style="height:calc(100vh - 140px);display:flex;flex-direction:column;padding:0">
        <div class="chat-messages" id="chat-messages">
          <div class="msg assistant">👋 Hello! I'm TITAN. How can I help you today?</div>
        </div>
        <div class="chat-input-area">
          <input type="text" id="chat-input" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendChat()"/>
          <button onclick="sendChat()">Send ⚡</button>
        </div>
      </div>
    </div>

    <!-- Agents Panel -->
    <div id="panel-agents" class="panel">
      <div class="card">
        <h3>Spawn New Agent</h3>
        <div class="form-row"><label>Name</label><input type="text" id="agent-name" placeholder="e.g. Code Reviewer"/></div>
        <div class="form-row"><label>Model</label><input type="text" id="agent-model" placeholder="e.g. anthropic/claude-sonnet-4-20250514"/></div>
        <div class="form-row"><label></label><button class="btn primary" onclick="spawnAgent()">Spawn Agent</button></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Agent Instances (max 5)</h3>
        <div id="agents-list"><div class="empty-state"><div class="icon">🤖</div><p>No agents running. Spawn one above.</p></div></div>
      </div>
    </div>

    <!-- Skills Panel -->
    <div id="panel-skills" class="panel">
      <div class="card"><h3>Installed Skills</h3><div id="skills-list">Loading...</div></div>
    </div>

    <!-- Processes Panel -->
    <div id="panel-processes" class="panel">
      <div class="card"><h3>Background Processes</h3><div id="processes-list"><div class="empty-state"><div class="icon">⚙️</div><p>No background processes.</p></div></div></div>
    </div>

    <!-- Plans Panel -->
    <div id="panel-plans" class="panel">
      <div class="card"><h3>Task Plans</h3><div id="plans-list"><div class="empty-state"><div class="icon">📋</div><p>No active plans. Create one via chat.</p></div></div></div>
    </div>

    <!-- Sessions Panel -->
    <div id="panel-sessions" class="panel">
      <div class="card"><h3>Active Sessions</h3><div id="sessions-list">Loading...</div></div>
    </div>

    <!-- Channels Panel -->
    <div id="panel-channels" class="panel">
      <div class="card"><h3>Channel Status</h3><div id="channels-list">Loading...</div></div>
    </div>

    <!-- Security Panel -->
    <div id="panel-security" class="panel">
      <div class="card"><h3>Security Audit</h3><div id="security-audit">Loading...</div></div>
    </div>

    <!-- Learning Panel -->
    <div id="panel-learning" class="panel">
      <div class="card">
        <h3>Learning Engine Status</h3>
        <div id="learning-stats">Loading...</div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Tool Success Rates</h3>
        <div id="tool-rates">Loading...</div>
      </div>
    </div>

    <!-- Logs Panel -->
    <div id="panel-logs" class="panel">
      <div class="card"><h3>System Logs</h3><div id="logs-container" style="max-height:calc(100vh - 220px);overflow-y:auto">Loading...</div></div>
    </div>
  </div>
</main>

<script>
const panelTitles = {
  overview:'📊 Overview', chat:'💬 WebChat', agents:'🤖 Agents',
  skills:'🧩 Skills', processes:'⚙️ Processes', plans:'📋 Plans',
  sessions:'🔗 Sessions', channels:'📡 Channels', security:'🔒 Security',
  learning:'🧠 Learning', logs:'📜 Logs'
};

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  event.target.closest('.nav-item')?.classList.add('active');
  document.getElementById('panel-title').textContent = panelTitles[name] || name;
}

// WebSocket
let ws;
function connectWS() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'response') {
        const messages = document.getElementById('chat-messages');
        const msg = document.createElement('div');
        msg.className = 'msg assistant';
        msg.textContent = data.content;
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
      }
    } catch(err) {}
  };
  ws.onclose = () => setTimeout(connectWS, 3000);
}
connectWS();

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const messages = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'msg user';
  msg.textContent = text;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
  input.value = '';
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({type:'message',content:text,channel:'webchat',userId:'dashboard'}));
  } else {
    fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})})
      .then(r=>r.json())
      .then(data=>{const m=document.createElement('div');m.className='msg assistant';m.textContent=data.content||'No response';messages.appendChild(m);messages.scrollTop=messages.scrollHeight});
  }
}

async function spawnAgent() {
  const name = document.getElementById('agent-name').value.trim();
  const model = document.getElementById('agent-model').value.trim();
  if (!name) return alert('Agent name required');
  const r = await fetch('/api/agents/spawn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,model:model||undefined})});
  const data = await r.json();
  if (data.error) alert(data.error);
  else { document.getElementById('agent-name').value=''; document.getElementById('agent-model').value=''; fetchData(); }
}

async function stopAgent(id) {
  await fetch('/api/agents/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:id})});
  fetchData();
}

async function fetchData() {
  try {
    const [stats, sessions, skills, channels, security, agents] = await Promise.all([
      fetch('/api/stats').then(r=>r.json()).catch(()=>({})),
      fetch('/api/sessions').then(r=>r.json()).catch(()=>[]),
      fetch('/api/skills').then(r=>r.json()).catch(()=>[]),
      fetch('/api/channels').then(r=>r.json()).catch(()=>{}),
      fetch('/api/security').then(r=>r.json()).catch(()=>({})),
      fetch('/api/agents').then(r=>r.json()).catch(()=>({agents:[],capacity:{current:0,max:5}})),
    ]);

    // Stats
    document.getElementById('s-agents').textContent = agents.capacity?.current || 0;
    document.getElementById('s-sessions').textContent = Array.isArray(sessions) ? sessions.length : 0;
    document.getElementById('s-tools').textContent = Array.isArray(skills) ? skills.length : 0;
    document.getElementById('s-knowledge').textContent = stats.knowledge || 0;
    document.getElementById('agent-count').textContent = (agents.capacity?.current||0) + ' agents';

    // Health
    const upSec = stats.uptime || 0;
    const upStr = upSec > 3600 ? Math.floor(upSec/3600)+'h '+Math.floor((upSec%3600)/60)+'m' : Math.floor(upSec/60)+'m '+Math.floor(upSec%60)+'s';
    document.getElementById('uptime').textContent = 'Up ' + upStr;
    document.getElementById('health-info').innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px">'+
      '<div><span style="color:var(--text-dim)">Uptime</span><br><strong>'+upStr+'</strong></div>'+
      '<div><span style="color:var(--text-dim)">Memory</span><br><strong>'+(stats.memoryMB||'—')+' MB</strong></div>'+
      '<div><span style="color:var(--text-dim)">Version</span><br><strong>'+(stats.version||'—')+'</strong></div></div>';

    // Agents
    if (agents.agents && agents.agents.length > 0) {
      document.getElementById('agents-list').innerHTML =
        '<table><tr><th>Name</th><th>ID</th><th>Model</th><th>Messages</th><th>Status</th><th>Action</th></tr>' +
        agents.agents.map(a=>'<tr><td><strong>'+a.name+'</strong></td><td style="font-family:JetBrains Mono;font-size:12px;color:var(--text-dim)">'+a.id+'</td><td>'+a.model+'</td><td>'+a.messageCount+'</td><td><span class="badge '+(a.status==='running'?'active':'idle')+'">'+a.status+'</span></td><td><button class="btn danger" onclick="stopAgent(\\''+a.id+'\\')">Stop</button></td></tr>').join('')+'</table>';
    }

    // Sessions
    if (Array.isArray(sessions) && sessions.length > 0) {
      document.getElementById('sessions-list').innerHTML =
        '<table><tr><th>ID</th><th>Channel</th><th>Messages</th><th>Last Active</th></tr>' +
        sessions.map(s=>'<tr><td style="font-family:JetBrains Mono;font-size:12px">'+s.id.slice(0,8)+'</td><td>'+s.channel+'</td><td>'+(s.messageCount||0)+'</td><td>'+(s.lastActive||'—')+'</td></tr>').join('')+'</table>';
    } else {
      document.getElementById('sessions-list').innerHTML = '<div class="empty-state"><p>No active sessions</p></div>';
    }

    // Skills
    if (Array.isArray(skills) && skills.length > 0) {
      document.getElementById('skills-list').innerHTML =
        '<table><tr><th>Skill</th><th>Version</th><th>Source</th><th>Status</th></tr>' +
        skills.map(s=>'<tr><td><strong>'+s.name+'</strong></td><td>'+s.version+'</td><td><span class="badge info">'+s.source+'</span></td><td><span class="badge active">enabled</span></td></tr>').join('')+'</table>';
    }

    // Channels
    if (channels && typeof channels === 'object') {
      const entries = Object.entries(channels);
      document.getElementById('channels-list').innerHTML =
        '<table><tr><th>Channel</th><th>Status</th></tr>' +
        entries.map(([name,info])=>'<tr><td><strong>'+name+'</strong></td><td><span class="badge '+((info as any).status==='connected'?'active':'idle')+'">'+(info as any).status+'</span></td></tr>').join('')+'</table>';
    }

    // Security
    document.getElementById('security-audit').innerHTML = security ? '<pre style="font-family:JetBrains Mono;font-size:12px;color:var(--text-dim);white-space:pre-wrap">'+JSON.stringify(security,null,2)+'</pre>' : 'No audit data';

  } catch(e) { console.error('Fetch error:', e); }
}

fetchData();
setInterval(fetchData, 15000);
</script>
</body>
</html>`;
}
