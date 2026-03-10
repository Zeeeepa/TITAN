import { Wrench } from 'lucide-react';

interface ToolCallIndicatorProps {
  tools: string[];
}

export function ToolCallIndicator({ tools }: ToolCallIndicatorProps) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {tools.map((tool) => (
        <span
          key={tool}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#6366f1]/15 text-[#818cf8] animate-pulse"
        >
          <Wrench className="w-3 h-3 animate-spin" />
          {tool}
        </span>
      ))}
    </div>
  );
}
