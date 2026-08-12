'use client';

import { Sparkles } from '@/components/ui/icons';

export function AgentSkillsCount({
  skillIds,
  skillsConfig,
}: {
  skillIds?: string[];
  skillsConfig?: Array<{ id?: string; enabled?: boolean }>;
}) {
  const fromConfig =
    Array.isArray(skillsConfig) && skillsConfig.length > 0
      ? skillsConfig.filter((s) => s?.enabled !== false && String(s?.id || '').trim().length > 0).length
      : 0;
  const fromIds = (skillIds ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0).length;
  const count = fromConfig > 0 ? fromConfig : fromIds;
  if (count <= 0) return null;

  return (
    <span className="dashboard-agent-skills-count" title={`${count} skill${count !== 1 ? 's' : ''}`}>
      <Sparkles size={10} strokeWidth={2} aria-hidden />
      <span>
        Skills <span className="dashboard-agent-skills-count__n">{count}</span>
      </span>
    </span>
  );
}
