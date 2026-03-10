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
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { label: 'Chat', icon: MessageSquare, path: '/' },
  { label: 'Overview', icon: Activity, path: '/overview' },
  { label: 'Agents', icon: Users, path: '/agents' },
  { label: 'Sessions', icon: ScrollText, path: '/sessions' },
  { label: 'Settings', icon: Settings, path: '/settings' },
  { label: 'Channels', icon: Radio, path: '/channels' },
  { label: 'Skills', icon: Wrench, path: '/skills' },
  { label: 'Telemetry', icon: BarChart3, path: '/telemetry' },
  { label: 'Logs', icon: ScrollText, path: '/logs' },
  { label: 'Mesh', icon: Network, path: '/mesh' },
] as const;

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] border-r border-[var(--border)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0">
        <img src="/titan-logo.png" alt="TITAN" className="w-10 h-10 flex-shrink-0" />
        {!collapsed && (
          <span className="text-[var(--text)] font-bold text-lg tracking-wide">TITAN</span>
        )}
      </div>

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

      {/* Collapse toggle */}
      <div className="flex-shrink-0 p-2 border-t border-[var(--border)]">
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
