'use client';

import { Sparkles } from 'lucide-react';
import { SKILL_MAP } from '@/lib/agent-skills';

export function AgentSkillsCount({ skillIds }: { skillIds?: string[] }) {
  const count = (skillIds ?? []).filter((id) => SKILL_MAP.has(id)).length;
  if (count <= 0) return null;

  return (
    <span className="dashboard-agent-skills-count" title={`${count} skill${count !== 1 ? 's' : ''}`}>
      <Sparkles size={11} strokeWidth={2} aria-hidden />
      <span>
        Skills <span className="dashboard-agent-skills-count__n">{count}</span>
      </span>
    </span>
  );
}
