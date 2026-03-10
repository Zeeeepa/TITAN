import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: 'up' | 'down';
  subtitle?: string;
}

export function StatCard({ title, value, icon, trend, subtitle }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-4">
      {icon && <div className="mb-2 text-[#71717a]">{icon}</div>}
      <p className="text-sm text-[#a1a1aa]">{title}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-[#fafafa]">{value}</span>
        {trend && (
          <span
            className={
              trend === 'up' ? 'text-sm text-[#22c55e]' : 'text-sm text-[#ef4444]'
            }
          >
            {trend === 'up' ? '\u2191' : '\u2193'}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-[#71717a]">{subtitle}</p>}
    </div>
  );
}
