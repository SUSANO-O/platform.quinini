import type { FlowConnection, FlowNode } from './types';

const NODE_WIDTH = 250;
const NODE_HEADER = 70;
const NODE_OPTION_H = 32;

export function nodeHeight(node: FlowNode): number {
  if (node.type === 'start') return 120;
  if (node.type === 'end') return 130;
  const options = node.options?.length ?? 0;
  const optionsBlock = node.type === 'multiple_choice' ? Math.ceil(options / 2) * NODE_OPTION_H + 20 : 0;
  return NODE_HEADER + optionsBlock + 60;
}

export function getHandlePosition(
  node: FlowNode,
  handle: FlowConnection['fromHandle'],
): { x: number; y: number } {
  const h = nodeHeight(node);
  const cx = node.x + NODE_WIDTH / 2;

  if (handle === 'output') {
    return { x: cx, y: node.y + h - 7 };
  }

  if (handle.startsWith('option:')) {
    const idx = Number(handle.split(':')[1]);
    const row = Math.floor(idx / 2);
    const col = idx % 2;
    const tagW = NODE_WIDTH / 2 - 16;
    const tagX = node.x + 16 + col * (tagW + 8) + tagW;
    const tagY = node.y + NODE_HEADER + row * NODE_OPTION_H + 16;
    return { x: tagX, y: tagY };
  }

  return { x: cx, y: node.y + h - 7 };
}

export function getInputHandlePosition(node: FlowNode): { x: number; y: number } {
  return { x: node.x + NODE_WIDTH / 2, y: node.y + 7 };
}

export function buildConnectionPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const dy = Math.abs(to.y - from.y);
  const cp = Math.max(60, dy * 0.45);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + cp}, ${to.x} ${to.y - cp}, ${to.x} ${to.y}`;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const WORKSPACE_COLORS = [
  'bg-amber-600',
  'bg-violet-600',
  'bg-sky-600',
  'bg-rose-600',
  'bg-emerald-600',
  'bg-orange-600',
];

export function workspaceColorClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return WORKSPACE_COLORS[hash % WORKSPACE_COLORS.length];
}
