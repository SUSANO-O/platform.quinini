import type { Connection, Edge, Node } from '@xyflow/react';
import type { FlowConnection, FlowConnectionHandle, FlowNode, FlowNodeConfig, FlowNodeType } from './types';

export type FlowNodeData = {
  flowType: FlowNodeType;
  question?: string;
  options?: { label: string; value: string }[];
  config?: FlowNodeConfig;
};

function reactFlowNodeType(flowType: FlowNodeType): string {
  if (flowType === 'start') return 'flowStart';
  if (flowType === 'multiple_choice' || flowType === 'random') return 'flowChoice';
  if (flowType === 'condition') return 'flowCondition';
  return 'flowStep';
}

function handleToSourceId(handle: FlowConnectionHandle): string | undefined {
  if (handle === 'output') return 'output';
  if (handle === 'true') return 'true';
  if (handle === 'false') return 'false';
  if (handle.startsWith('option:')) return `option-${handle.split(':')[1]}`;
  return undefined;
}

function sourceIdToHandle(sourceHandle: string | null | undefined): FlowConnectionHandle {
  if (!sourceHandle || sourceHandle === 'output') return 'output';
  if (sourceHandle === 'true') return 'true';
  if (sourceHandle === 'false') return 'false';
  if (sourceHandle.startsWith('option-')) return `option:${sourceHandle.slice(7)}` as FlowConnectionHandle;
  return 'output';
}

export function flowToReactFlow(
  nodes: FlowNode[],
  connections: FlowConnection[],
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const rfNodes: Node<FlowNodeData>[] = nodes.map((n) => ({
    id: n.id,
    type: reactFlowNodeType(n.type),
    position: { x: n.x, y: n.y },
    data: {
      flowType: n.type,
      question: n.question,
      options: n.options,
      config: n.config,
    },
    draggable: true,
    deletable: n.type !== 'start',
  }));

  const rfEdges: Edge[] = connections.map((c) => ({
    id: c.id,
    source: c.fromNodeId,
    target: c.toNodeId,
    sourceHandle: handleToSourceId(c.fromHandle),
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'var(--brand-primary)', strokeWidth: 2 },
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

export function reactFlowToFlow(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
): { nodes: FlowNode[]; connections: FlowConnection[] } {
  const flowNodes: FlowNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.data.flowType,
    x: n.position.x,
    y: n.position.y,
    question: n.data.question,
    options: n.data.options,
    config: n.data.config,
  }));

  const connections: FlowConnection[] = edges.map((e) => ({
    id: e.id,
    fromNodeId: e.source,
    fromHandle: sourceIdToHandle(e.sourceHandle),
    toNodeId: e.target,
  }));

  return { nodes: flowNodes, connections };
}

export function connectionToFlowConnection(conn: Connection): FlowConnection | null {
  if (!conn.source || !conn.target) return null;
  return {
    id: `conn_${conn.source}_${conn.sourceHandle ?? 'output'}_${conn.target}`,
    fromNodeId: conn.source,
    fromHandle: sourceIdToHandle(conn.sourceHandle),
    toNodeId: conn.target,
  };
}
