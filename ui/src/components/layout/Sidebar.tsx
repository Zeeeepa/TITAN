import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import {
  MessageSquare,
  Activity,
  Users,
  ScrollText,
  Settings,
  Radio,
  Wrench,
  BarChart3,
  Network,
  ChevronLeft,
  ChevronRight,
  Brain,
  Zap,
  Shield,
  GitBranch,
  Plug,
  UserCircle,
  ArrowUpCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCw,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { label: 'Chat', icon: MessageSquare, path: '/' },
  { label: 'Activity', icon: Radio, path: '/activity' },
  { label: 'Overview', icon: Activity, path: '/overview' },
  { label: 'Agents', icon: Users, path: '/agents' },
  { label: 'Sessions', icon: ScrollText, path: '/sessions' },
  { label: 'Settings', icon: Settings, path: '/settings' },
  { label: 'Integrations', icon: Plug, path: '/integrations' },
  { label: 'Channels', icon: Radio, path: '/channels' },
  { label: 'Skills', icon: Wrench, path: '/skills' },
  { label: 'Telemetry', icon: BarChart3, path: '/telemetry' },
  { label: 'Logs', icon: ScrollText, path: '/logs' },
  { label: 'Mesh', icon: Network, path: '/mesh' },
  { label: 'Learning', icon: Brain, path: '/learning' },
  { label: 'Autopilot', icon: Zap, path: '/autopilot' },
  { label: 'Security', icon: Shield, path: '/security' },
  { label: 'Workflows', icon: GitBranch, path: '/workflows' },
  { label: 'Memory', icon: Network, path: '/memory-graph' },
  { label: 'Personas', icon: UserCircle, path: '/personas' },
] as const;

interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

type UpdateStatus = 'idle' | 'updating' | 'restarting' | 'success' | 'error';

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const [versionInfo, setVersionInfo] = useState<VersionInfo>({
    current: '',
    latest: null,
    updateAvailable: false,
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateError, setUpdateError] = useState('');

  const triggerUpdate = useCallback(async () => {
    if (updateStatus === 'updating' || updateStatus === 'restarting') return;
    setUpdateStatus('updating');
    setUpdateError('');
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restart: true }),
      });
      const data = await res.json();
      if (!data.ok) {
        setUpdateStatus('error');
        setUpdateError(data.error || 'Update failed');
        return;
      }
      if (data.restarting) {
        setUpdateStatus('restarting');
        // Poll until server comes back
        const poll = setInterval(async () => {
          try {
            const h = await fetch('/api/health');
            if (h.ok) {
              clearInterval(poll);
              setUpdateStatus('success');
              setTimeout(() => window.location.reload(), 1000);
            }
          } catch { /* server still restarting */ }
        }, 2000);
        // Give up after 60s
        setTimeout(() => clearInterval(poll), 60_000);
      } else {
        setUpdateStatus('success');
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch {
      setUpdateStatus('error');
      setUpdateError('Network error');
    }
  }, [updateStatus]);

  // Get version from health endpoint and check npm for updates
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/health');
        const health = await res.json();
        const current = health.version || '';
        setVersionInfo((prev) => ({ ...prev, current }));

        // Check npm registry for latest version
        try {
          const npmRes = await fetch('https://registry.npmjs.org/titan-agent/latest');
          const pkg = await npmRes.json();
          const latest = pkg.version || null;
          if (latest && current && latest !== current) {
            setVersionInfo({ current, latest, updateAvailable: true });
          } else {
            setVersionInfo({ current, latest, updateAvailable: false });
          }
        } catch {
          // npm check is non-critical
        }
      } catch {
        // health check failed
      }
    })();
  }, []);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] border-r border-[var(--border)]">
      {/* Logo header */}
      <Link to="/" className="flex items-center gap-3 px-4 h-14 flex-shrink-0 hover:opacity-90 transition-opacity">
        <div className="relative w-9 h-9 flex-shrink-0">
          <img src="/titan-logo.png" alt="TITAN" className="w-9 h-9 rounded-lg" />
          <div className="absolute inset-0 rounded-lg ring-1 ring-white/10" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[var(--text)] font-bold text-base tracking-wider leading-tight">TITAN</span>
            <span className="text-[var(--text-muted)] text-[10px] leading-tight">Mission Control</span>
          </div>
        )}
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {navItems.map(({ label, icon: Icon, path }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              to={path}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)]'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Update banner */}
      {versionInfo.updateAvailable && !collapsed && (
        <button
          onClick={triggerUpdate}
          disabled={updateStatus === 'updating' || updateStatus === 'restarting'}
          className="mx-2 mb-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-[#6366f1]/15 to-[#818cf8]/10 border border-[#6366f1]/25 hover:from-[#6366f1]/25 hover:to-[#818cf8]/20 transition-all cursor-pointer text-left w-[calc(100%-1rem)] disabled:opacity-70 disabled:cursor-wait"
        >
          <div className="flex items-center gap-2 mb-1">
            {updateStatus === 'idle' && <ArrowUpCircle size={14} className="text-[#818cf8] flex-shrink-0" />}
            {updateStatus === 'updating' && <Loader2 size={14} className="text-[#818cf8] flex-shrink-0 animate-spin" />}
            {updateStatus === 'restarting' && <RotateCw size={14} className="text-[#818cf8] flex-shrink-0 animate-spin" />}
            {updateStatus === 'success' && <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />}
            {updateStatus === 'error' && <XCircle size={14} className="text-red-400 flex-shrink-0" />}
            <span className="text-xs font-semibold text-[#818cf8]">
              {updateStatus === 'idle' && 'Update Available'}
              {updateStatus === 'updating' && 'Updating...'}
              {updateStatus === 'restarting' && 'Restarting...'}
              {updateStatus === 'success' && 'Updated!'}
              {updateStatus === 'error' && 'Update Failed'}
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            {updateStatus === 'idle' && <>v{versionInfo.latest} is out. <span className="text-[#a5b4fc]">Click to update &amp; restart</span></>}
            {updateStatus === 'updating' && 'Installing update...'}
            {updateStatus === 'restarting' && 'Server restarting, please wait...'}
            {updateStatus === 'success' && 'Reloading...'}
            {updateStatus === 'error' && (updateError || 'Try again or update manually')}
          </p>
        </button>
      )}

      {/* Version + collapse */}
      <div className="flex-shrink-0 px-2 pb-2 pt-1 border-t border-[var(--border)]">
        {!collapsed && versionInfo.current && (
          <div className="flex items-center justify-between px-3 py-1.5 mb-1">
            <span className="text-[10px] text-[var(--text-muted)]">
              v{versionInfo.current}
            </span>
            {versionInfo.updateAvailable ? (
              <span className="text-[10px] text-[#818cf8] font-medium">New version</span>
            ) : versionInfo.latest ? (
              <span className="text-[10px] text-[var(--success)]">Up to date</span>
            ) : null}
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full py-2 rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </div>
  );
}
