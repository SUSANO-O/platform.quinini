import type { FlowConnection, FlowNode } from './types';

const NODE_WIDTH = 250;
const NODE_HEADER = 70;
const NODE_OPTION_H = 32;

export function nodeHeight(node: FlowNode): number {
  if (node.type === 'start') return 120;
  if (node.type === 'end') return 130;
  const options = node.options?.length ?? 0;
  const optionsBlock =
    node.type === 'multiple_choice' || node.type === 'random'
      ? Math.ceil(options / 2) * NODE_OPTION_H + 20
      : 0;
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

  if (handle === 'true') {
    return { x: node.x + NODE_WIDTH * 0.25, y: node.y + h - 7 };
  }
  if (handle === 'false') {
    return { x: node.x + NODE_WIDTH * 0.75, y: node.y + h - 7 };
  }

  if (typeof handle === 'string' && handle.startsWith('option:')) {
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

const NAME_STOP_WORDS = new Set([
  'a',
  'al',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'para',
  'por',
  'un',
  'una',
  'y',
]);

function cleanNameToken(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function significantNameParts(name: string): string[] {
  return name
    .trim()
    .split(/\s+/)
    .map(cleanNameToken)
    .filter((part) => part.length > 0 && !NAME_STOP_WORDS.has(part.toLowerCase()));
}

export function initialsFromName(name: string): string {
  const parts = significantNameParts(name);
  const fallback = name
    .trim()
    .split(/\s+/)
    .map(cleanNameToken)
    .filter(Boolean);

  const words = parts.length > 0 ? parts : fallback;
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  if (words.length === 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  const last = words[words.length - 1];
  if (last.length === 2) return last.toUpperCase();
  return `${words[0][0]}${last[0]}`.toUpperCase();
}

const AVATAR_PALETTE = [
  { background: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.28)', color: '#2563eb' },
  { background: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.28)', color: '#7c3aed' },
  { background: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.28)', color: '#db2777' },
  { background: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.28)', color: '#059669' },
  { background: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.3)', color: '#d97706' },
  { background: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.28)', color: '#0284c7' },
  { background: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.28)', color: '#e11d48' },
  { background: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.28)', color: '#0d9488' },
] as const;

export function avatarStyleFromSeed(seed: string): {
  background: string;
  border: string;
  color: string;
} {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 997;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
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
