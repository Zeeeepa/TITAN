import { Search, Beaker, BookOpen, Lightbulb, Wrench, BarChart3 } from 'lucide-react';

interface QuickAction {
  icon: typeof Search;
  label: string;
  description: string;
  prompt: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Search,
    label: 'Research something',
    description: 'Get a detailed report on any topic',
    prompt: 'Use the research pipeline to investigate: ',
    color: 'text-blue-400',
  },
  {
    icon: Beaker,
    label: 'Run an experiment',
    description: 'Try different approaches, keep the best',
    prompt: 'Help me set up an experiment loop to optimize: ',
    color: 'text-green-400',
  },
  {
    icon: Lightbulb,
    label: 'Brainstorm ideas',
    description: 'Creative thinking on any topic',
    prompt: '/brainstorm ',
    color: 'text-yellow-400',
  },
  {
    icon: Wrench,
    label: 'Debug an issue',
    description: 'Track down and fix a problem',
    prompt: '/debug ',
    color: 'text-red-400',
  },
  {
    icon: BookOpen,
    label: 'Explain code',
    description: 'Understand what code does',
    prompt: '/explain ',
    color: 'text-purple-400',
  },
  {
    icon: BarChart3,
    label: 'Market analysis',
    description: 'Analyze a market or competitor',
    prompt: '/market-analysis ',
    color: 'text-cyan-400',
  },
];

interface QuickActionsProps {
  onSelectAction: (prompt: string) => void;
  visible: boolean;
}

export function QuickActions({ onSelectAction, visible }: QuickActionsProps) {
  if (!visible) return null;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3 text-center">
        What would you like to do?
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onSelectAction(action.prompt)}
            className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--accent)] transition-all text-left group"
          >
            <action.icon size={18} className={`${action.color} group-hover:scale-110 transition-transform`} />
            <div>
              <div className="text-sm font-medium text-[var(--text)]">{action.label}</div>
              <div className="text-xs text-[var(--text-muted)] leading-tight">{action.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
