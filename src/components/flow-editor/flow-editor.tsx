'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FlowsBetaBadge } from '@/components/flows/flows-beta-badge';
import { toast } from 'sonner';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  NODE_PALETTE,
  createFlowNode,
} from '@/lib/flow-editor/constants';
import type { FlowNodeType } from '@/lib/flow-editor/types';
import {
  flowToReactFlow,
  reactFlowToFlow,
  type FlowNodeData,
} from '@/lib/flow-editor/serialization';
import type { FlowDocument, FlowNode, FlowSettings } from '@/lib/flow-editor/types';
import { flowNodeTypes } from './flow-nodes';
import './flow-editor.css';

function FlowEditorInner({ initialFlow }: { initialFlow: FlowDocument }) {
  const flowId = initialFlow.id;
  const [name, setName] = useState(initialFlow.name);
  const [settings, setSettings] = useState<FlowSettings>(initialFlow.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const savedSnapshotRef = useRef('');
  const saveInFlightRef = useRef(false);

  const initial = useMemo(
    () => flowToReactFlow(initialFlow.nodes, initialFlow.connections),
    [initialFlow.nodes, initialFlow.connections],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const { screenToFlowPosition } = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const buildPayload = useCallback(() => {
    const { nodes: flowNodes, connections } = reactFlowToFlow(nodes, edges);
    return { name, settings, nodes: flowNodes, connections };
  }, [nodes, edges, name, settings]);

  const payloadSnapshot = useMemo(() => JSON.stringify(buildPayload()), [buildPayload]);

  useEffect(() => {
    if (!savedSnapshotRef.current) {
      savedSnapshotRef.current = payloadSnapshot;
    }
  }, [payloadSnapshot]);

  const isDirty = payloadSnapshot !== savedSnapshotRef.current;

  useEffect(() => {
    if (isDirty && saveStatus === 'saved') setSaveStatus('dirty');
  }, [isDirty, saveStatus]);

  const persistFlow = useCallback(async (mode: 'manual' | 'auto') => {
    if (saveInFlightRef.current) return;
    if (payloadSnapshot === savedSnapshotRef.current) return;

    saveInFlightRef.current = true;
    setSaving(true);
    setSaveStatus('saving');
    try {
      const payload = buildPayload();
      const res = await fetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Error al guardar');
      }
      savedSnapshotRef.current = payloadSnapshot;
      setSaveStatus('saved');
      if (mode === 'manual') toast.success('Flujo guardado');
    } catch (err) {
      setSaveStatus('error');
      if (mode === 'manual') {
        toast.error(err instanceof Error ? err.message : 'Error al guardar');
      }
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  }, [buildPayload, flowId, payloadSnapshot]);

  useEffect(() => {
    if (!isDirty || saving) return;
    const timer = window.setTimeout(() => {
      void persistFlow('auto');
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [isDirty, saving, persistFlow, payloadSnapshot]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (payloadSnapshot !== savedSnapshotRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [payloadSnapshot]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'smoothstep',
            style: { stroke: '#006b7d', strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/flow-node-type') as FlowNodeType;
      if (!type || type === 'start') return;

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const flowNode = createFlowNode(type, position.x, position.y);
      const rfType = type === 'multiple_choice' ? 'flowChoice' : 'flowStep';

      const newNode: Node<FlowNodeData> = {
        id: flowNode.id,
        type: rfType,
        position,
        data: {
          flowType: flowNode.type,
          question: flowNode.question,
          options: flowNode.options,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(flowNode.id);
    },
    [screenToFlowPosition, setNodes],
  );

  const updateSelectedNode = useCallback(
    (patch: Partial<FlowNodeData>) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [selectedNodeId, setNodes],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId || selectedNodeId === 'start') return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, []);

  const saveFlow = () => void persistFlow('manual');

  const saveStatusLabel = {
    saved: 'Guardado',
    saving: 'Guardando…',
    dirty: 'Cambios sin guardar',
    error: 'Error al guardar',
  }[saveStatus];

  const onPaletteDragStart = (e: React.DragEvent, type: FlowNodeType) => {
    e.dataTransfer.setData('application/flow-node-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="flow-editor-root flow-editor-root--xyflow">
      <header className="flow-editor-header">
        <div className="flow-editor-header-left">
          <Link href={`/dashboard/flows/${flowId}`} className="flow-editor-btn flow-editor-btn--back">
            ← Volver
          </Link>
          <div className="flow-editor-title">
            Editor de flujos
            <FlowsBetaBadge className="flow-editor-beta-badge" />
          </div>
          <input
            className="flow-editor-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del flujo"
          />
          <button type="button" className="flow-editor-btn" onClick={() => setSettingsOpen(true)}>
            ⚙️ Ajustes
          </button>
        </div>
        <div className="flow-editor-header-right">
          <span
            className={`flow-editor-save-status flow-editor-save-status--${saveStatus}`}
            role="status"
            aria-live="polite"
          >
            {saveStatusLabel}
          </span>
          <button
            type="button"
            className="flow-editor-btn flow-editor-btn--primary"
            disabled={saving || !isDirty}
            onClick={saveFlow}
          >
            {saving ? 'Guardando…' : 'Guardar ahora'}
          </button>
        </div>
      </header>

      <div className="flow-editor-main">
        <aside className="flow-editor-palette">
          {NODE_PALETTE.map((section) => (
            <div key={section.section}>
              <div className="flow-editor-section-title">{section.section}</div>
              {section.items.map((item) => (
                <div
                  key={item.type}
                  className="flow-editor-palette-item"
                  draggable
                  onDragStart={(e) => onPaletteDragStart(e, item.type)}
                >
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="text-xs opacity-60">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </aside>

        <div className="flow-editor-canvas-wrap" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={flowNodeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="#374151" />
            <Controls className="flow-rf-controls" />
            <MiniMap className="flow-rf-minimap" maskColor="rgba(0,0,0,0.6)" />
            <Panel position="top-left" className="flow-rf-hint">
              Arrastra nodos · Conecta los puntos · Auto-guardado cada 2,5 s
            </Panel>
          </ReactFlow>
        </div>

        <aside className="flow-editor-properties">
          {selectedNode && selectedNode.data.flowType !== 'start' ? (
            <div>
              <h3 className="text-base font-semibold m-0 mb-4">Propiedades</h3>
              <div className="flow-editor-field">
                <label>Pregunta / mensaje</label>
                <textarea
                  value={selectedNode.data.question ?? ''}
                  onChange={(e) => updateSelectedNode({ question: e.target.value })}
                />
              </div>
              {selectedNode.data.flowType === 'multiple_choice' && (
                <div className="flow-editor-field">
                  <label>Opciones (etiqueta|valor por línea)</label>
                  <textarea
                    value={(selectedNode.data.options ?? [])
                      .map((o) => `${o.label}|${o.value}`)
                      .join('\n')}
                    onChange={(e) => {
                      const options = e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [label, value] = line.split('|');
                          const l = (label ?? '').trim();
                          const v = (value ?? l).trim().toLowerCase().replace(/\s+/g, '_');
                          return { label: l, value: v || 'opt' };
                        });
                      updateSelectedNode({ options });
                    }}
                  />
                </div>
              )}
              <button
                type="button"
                className="flow-editor-btn flow-editor-btn--danger w-full mt-2"
                onClick={deleteSelectedNode}
              >
                Eliminar nodo
              </button>
            </div>
          ) : (
            <div className="flow-editor-empty">
              <div className="text-4xl mb-3 opacity-30">⚙️</div>
              <div className="font-semibold mb-1">Ningún nodo seleccionado</div>
              <div className="text-sm opacity-60">Haz clic en un nodo para editarlo</div>
            </div>
          )}
        </aside>
      </div>

      {settingsOpen && (
        <div className="flow-editor-modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="flow-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flow-editor-modal-header">
              <h3 className="m-0 text-lg font-semibold">Ajustes del flujo</h3>
            </div>
            <div className="flow-editor-modal-body">
              <div className="flow-editor-field">
                <label>Descripción</label>
                <textarea
                  value={settings.description}
                  onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))}
                />
              </div>
              <div className="flow-editor-field">
                <label>Etiquetas (auto-trigger)</label>
                <input
                  value={settings.tags}
                  onChange={(e) => setSettings((s) => ({ ...s, tags: e.target.value }))}
                />
              </div>
            </div>
            <div className="flow-editor-modal-footer">
              <button type="button" className="flow-editor-btn" onClick={() => setSettingsOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FlowEditor({ initialFlow }: { initialFlow: FlowDocument }) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner initialFlow={initialFlow} />
    </ReactFlowProvider>
  );
}
