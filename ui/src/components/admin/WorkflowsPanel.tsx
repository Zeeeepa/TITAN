import { useState, useEffect } from 'react';
import { GitBranch } from 'lucide-react';

interface Recipe {
  id: string;
  name: string;
  description?: string;
  steps?: unknown[];
}

function WorkflowsPanel() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recipes', { headers: { 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(d => setRecipes(Array.isArray(d) ? d : d.recipes || []))
      .catch(() => setRecipes([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[var(--text-muted)]">Loading workflows...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GitBranch className="w-6 h-6 text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text)]">Workflows</h1>
      </div>
      {recipes.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-8 text-center">
          <p className="text-[var(--text-muted)]">No workflows configured yet.</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Create recipes via the API or CLI.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recipes.map(r => (
            <div key={r.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
              <h3 className="font-medium text-[var(--text)]">{r.name}</h3>
              {r.description && <p className="text-sm text-[var(--text-muted)] mt-1">{r.description}</p>}
              <p className="text-xs text-[var(--text-muted)] mt-2">{r.steps?.length || 0} steps</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkflowsPanel;
