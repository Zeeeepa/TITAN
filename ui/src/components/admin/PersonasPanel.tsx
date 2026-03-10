import { useEffect, useMemo, useState } from 'react';
import { getPersonas, switchPersona } from '@/api/client';
import type { PersonaMeta } from '@/api/types';

function PersonasPanel() {
  const [personas, setPersonas] = useState<PersonaMeta[]>([]);
  const [active, setActive] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [activeDivision, setActiveDivision] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPersonas();
        setPersonas(data.personas);
        setActive(data.active);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch personas');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const divisions = useMemo(() => {
    const divs = new Set(personas.map((p) => p.division));
    return ['all', ...Array.from(divs).sort()];
  }, [personas]);

  const filtered = useMemo(() => {
    if (activeDivision === 'all') return personas;
    return personas.filter((p) => p.division === activeDivision);
  }, [personas, activeDivision]);

  const handleSwitch = async (id: string) => {
    if (id === active || switching) return;
    setSwitching(id);
    try {
      const result = await switchPersona(id);
      setActive(result.active);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch persona');
    } finally {
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-[#3f3f46] bg-[#18181b]" />
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#fafafa]">Personas</h2>
        <span className="text-sm text-[#71717a]">{personas.length} available</span>
      </div>

      {/* Division tabs */}
      <div className="flex flex-wrap gap-2">
        {divisions.map((div) => (
          <button
            key={div}
            onClick={() => setActiveDivision(div)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeDivision === div
                ? 'bg-[#6366f1] text-white'
                : 'bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa]'
            }`}
          >
            {div}
          </button>
        ))}
      </div>

      {/* Personas grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((persona) => {
          const isActive = persona.id === active;
          const isSwitching = persona.id === switching;
          return (
            <button
              key={persona.id}
              onClick={() => handleSwitch(persona.id)}
              disabled={isActive || !!switching}
              className={`rounded-xl border p-4 text-left transition-all ${
                isActive
                  ? 'border-[#6366f1] bg-[#6366f1]/10 ring-1 ring-[#6366f1]/30'
                  : 'border-[#3f3f46] bg-[#18181b] hover:border-[#52525b] hover:bg-[#1f1f23]'
              } ${isSwitching ? 'opacity-60' : ''} disabled:cursor-default`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium text-[#fafafa]">{persona.name}</h3>
                {isActive && (
                  <span className="rounded-full bg-[#6366f1]/20 px-2 py-0.5 text-xs font-medium text-[#818cf8]">
                    Active
                  </span>
                )}
                {isSwitching && (
                  <span className="text-xs text-[#a1a1aa]">Switching...</span>
                )}
              </div>
              <p className="text-sm text-[#a1a1aa] line-clamp-2">{persona.description}</p>
              <p className="mt-2 text-xs capitalize text-[#71717a]">{persona.division}</p>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-12 text-center text-[#71717a]">
            No personas in this division
          </p>
        )}
      </div>
    </div>
  );
}

export default PersonasPanel;
