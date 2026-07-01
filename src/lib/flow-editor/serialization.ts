import type { Connection, Edge, Node } from '@xyflow/react';
import type { FlowConnection, FlowConnectionHandle, FlowNode, FlowNodeType } from './types';

export type FlowNodeData = {
  flowType: FlowNodeType;
  question?: string;
  options?: { label: string; value: string }[];
};

function reactFlowNodeType(flowType: FlowNodeType): string {
  if (flowType === 'start') return 'flowStart';
  if (flowType === 'multiple_choice') return 'flowChoice';
  return 'flowStep';
}

function handleToSourceId(handle: FlowConnectionHandle): string | undefined {
  if (handle === 'output') return 'output';
  if (handle.startsWith('option:')) return `option-${handle.split(':')[1]}`;
  return undefined;
}

function sourceIdToHandle(sourceHandle: string | null | undefined): FlowConnectionHandle {
  if (!sourceHandle || sourceHandle === 'output') return 'output';
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
    },
    draggable: n.type !== 'start' ? true : true,
    deletable: n.type !== 'start',
  }));

  const rfEdges: Edge[] = connections.map((c) => ({
    id: c.id,
    source: c.fromNodeId,
    target: c.toNodeId,
    sourceHandle: handleToSourceId(c.fromHandle),
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#667eea', strokeWidth: 2 },
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
