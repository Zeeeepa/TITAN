import { useEffect, useMemo, useState } from 'react';
import { getSkills } from '@/api/client';
import type { SkillInfo } from '@/api/types';

function SkillsPanel() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getSkills();
        setSkills(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch skills');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category));
    return ['all', ...Array.from(cats).sort()];
  }, [skills]);

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return skills;
    return skills.filter((s) => s.category === activeCategory);
  }, [skills, activeCategory]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#ef4444]/50 bg-[#18181b] p-6 text-center text-[#ef4444]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[#fafafa]">Skills</h2>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeCategory === cat
                ? 'bg-[#6366f1] text-white'
                : 'bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Skills grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((skill) => (
          <div
            key={skill.name}
            className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium text-[#fafafa]">{skill.name}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  skill.enabled
                    ? 'bg-[#22c55e]/10 text-[#22c55e]'
                    : 'bg-[#71717a]/10 text-[#71717a]'
                }`}
              >
                {skill.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-sm text-[#a1a1aa]">{skill.description}</p>
            <p className="mt-2 text-xs capitalize text-[#71717a]">{skill.category}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-12 text-center text-[#71717a]">
            No skills in this category
          </p>
        )}
      </div>
    </div>
  );
}

export default SkillsPanel;
