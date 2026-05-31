'use client';

import type { ReactNode } from 'react';

export type AgentDetailTabId =
  | 'general'
  | 'rules'
  | 'faqs'
  | 'tools'
  | 'rag'
  | 'subagents'
  | 'scheduled-tasks';

export type AgentDetailTab = {
  id: AgentDetailTabId;
  label: string;
  icon: ReactNode;
  count?: number;
};

export function AgentDetailTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: AgentDetailTab[];
  active: AgentDetailTabId;
  onChange: (id: AgentDetailTabId) => void;
}) {
  const R = 'var(--primary)';

  if (tabs.length <= 1) return null;

  return (
    <div className="mb-6 -mx-1">
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 px-1 scrollbar-thin"
        style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
        role="tablist"
        aria-label="Secciones del agente"
      >
        {tabs.map(({ id, label, icon, count }) => {
          const selected = active === id;
          const titleHint =
            id === 'rag' ? 'Almacenamiento (RAG)'
              : id === 'scheduled-tasks' ? 'Tareas programadas'
                : undefined;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={titleHint}
              onClick={() => onChange(id)}
              className="inline-flex items-center gap-1.5 shrink-0 py-2 px-3.5 rounded-xl border cursor-pointer text-xs transition-all"
              style={{
                fontWeight: selected ? 700 : 500,
                borderColor: selected ? `${R}44` : 'var(--border)',
                background: selected ? 'var(--background)' : 'var(--card)',
                color: selected ? R : 'var(--muted-foreground)',
                boxShadow: selected ? `0 1px 0 ${R}22` : 'none',
              }}
            >
              <span style={{ display: 'flex', opacity: selected ? 1 : 0.75 }}>{icon}</span>
              <span className="whitespace-nowrap">{label}</span>
              {typeof count === 'number' && count > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: selected ? `${R}18` : 'var(--muted)',
                    color: selected ? R : 'var(--muted-foreground)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
