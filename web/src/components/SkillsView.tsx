import React, { useState, useEffect } from "react";

interface Skill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  source: string;
  content?: string;
}

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    fetch(`/api/skills${q}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.skills)) setSkills(d.skills);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const open = async (id: string) => {
    const token = new URLSearchParams(window.location.search).get("token");
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    const res = await fetch(`/api/skills/${encodeURIComponent(id)}${q}`);
    if (res.ok) {
      const data = await res.json();
      setSelected(data);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted">Loading skills...</div>;

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">
      <div className="w-64 shrink-0 bg-surface border border-border rounded-lg overflow-y-auto">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text">Skills</h3>
          <p className="text-xs text-muted">BMAD crew in repo</p>
        </div>
        <div className="p-2 space-y-1">
          {skills.map(s => (
            <button
              key={s.id}
              onClick={() => open(s.id)}
              className={`w-full text-left px-3 py-2 rounded text-xs ${selected?.id === s.id ? "bg-accent text-white" : "hover:bg-card text-text"}`}
            >
              <div className="font-medium">{s.name}</div>
              <div className={`text-[10px] ${selected?.id === s.id ? "text-white/70" : "text-muted"}`}>{s.id} · {s.source}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-surface border border-border rounded-lg p-4 overflow-y-auto">
        {selected ? (
          <>
            <h3 className="text-sm font-semibold text-text">{selected.name} <span className="text-xs text-muted font-mono">({selected.id})</span></h3>
            <p className="text-xs text-muted mt-1">{selected.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selected.triggers.map(t => (
                <span key={t} className="text-[10px] bg-card border border-border px-1.5 py-0.5 rounded font-mono text-muted">{t}</span>
              ))}
            </div>
            <pre className="mt-4 text-xs text-muted whitespace-pre-wrap font-mono bg-card border border-border rounded p-3">{selected.content}</pre>
          </>
        ) : (
          <p className="text-sm text-muted">Select a skill to view</p>
        )}
      </div>
    </div>
  );
}
