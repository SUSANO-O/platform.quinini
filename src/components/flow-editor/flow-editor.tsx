'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Flag,
  GitBranch,
  GripVertical,
  Hash,
  ListChecks,
  Mail,
  Phone,
  Save,
  Settings2,
  SlidersHorizontal,
  Type,
} from 'lucide-react';
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

const PALETTE_ICONS: Record<FlowNodeType, LucideIcon> = {
  start: GitBranch,
  text: Type,
  multiple_choice: ListChecks,
  number: Hash,
  email: Mail,
  phone: Phone,
  condition: GitBranch,
  end: Flag,
  calendar_booking: Calendar,
  calendly_booking: CalendarDays,
};

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
            <ArrowLeft size={15} strokeWidth={2} aria-hidden />
            Volver
          </Link>
          <div className="flow-editor-header-brand">
            <div className="flow-editor-title">
              Editor de flujos
              <FlowsBetaBadge />
            </div>
            <input
              className="flow-editor-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del flujo"
              aria-label="Nombre del flujo"
            />
          </div>
          <button type="button" className="flow-editor-btn" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} strokeWidth={1.75} aria-hidden />
            Ajustes
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
            <Save size={15} strokeWidth={2} aria-hidden />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </header>

      <div className="flow-editor-main">
        <aside className="flow-editor-sidebar flow-editor-sidebar--palette">
          <div className="flow-editor-sidebar__head">
            <span className="flow-editor-sidebar__head-icon" aria-hidden>
              <GitBranch size={16} strokeWidth={1.75} />
            </span>
            <div className="flow-editor-sidebar__head-text">
              <span className="flow-editor-sidebar__title">Componentes</span>
              <span className="flow-editor-sidebar__hint">Arrastra al lienzo para añadir</span>
            </div>
          </div>
          <nav className="flow-editor-sidebar__nav" aria-label="Paleta de nodos">
            {NODE_PALETTE.map((section) => (
              <div key={section.section}>
                <div className="flow-editor-section-title">{section.section}</div>
                {section.items.map((item) => {
                  const Icon = PALETTE_ICONS[item.type];
                  return (
                    <div
                      key={item.type}
                      className="flow-editor-palette-item"
                      draggable
                      onDragStart={(e) => onPaletteDragStart(e, item.type)}
                      title={item.desc}
                    >
                      <span className="flow-editor-palette-item__icon" aria-hidden>
                        <Icon size={15} strokeWidth={1.75} />
                      </span>
                      <div className="flow-editor-palette-item__text">
                        <span className="flow-editor-palette-item__name">{item.name}</span>
                        <span className="flow-editor-palette-item__desc">{item.desc}</span>
                      </div>
                      <GripVertical className="flow-editor-palette-item__grip" size={14} aria-hidden />
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
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
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: '#006b7d', strokeWidth: 2 },
            }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} size={1} color="rgba(0, 107, 125, 0.12)" />
            <Controls className="flow-rf-controls" />
            <MiniMap
              className="flow-rf-minimap"
              maskColor="rgba(244, 247, 248, 0.75)"
              nodeColor={(n) => (n.type === 'flowStart' ? '#006b7d' : '#94a3b8')}
            />
            <Panel position="top-left" className="flow-rf-hint">
              Arrastra nodos · Conecta los puntos · Auto-guardado cada 2,5 s
            </Panel>
          </ReactFlow>
        </div>

        <aside className="flow-editor-sidebar flow-editor-sidebar--props">
          {selectedNode && selectedNode.data.flowType !== 'start' ? (
            <>
              <div className="flow-editor-props-head">
                <h3>Propiedades</h3>
                <p>Edita el nodo seleccionado en el lienzo.</p>
              </div>
              <div className="flow-editor-props-body">
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
                  className="flow-editor-btn flow-editor-btn--danger"
                  style={{ width: '100%' }}
                  onClick={deleteSelectedNode}
                >
                  Eliminar nodo
                </button>
              </div>
            </>
          ) : (
            <div className="flow-editor-empty">
              <div className="flow-editor-empty__icon" aria-hidden>
                <SlidersHorizontal size={20} strokeWidth={1.75} />
              </div>
              <p className="flow-editor-empty__title">Sin selección</p>
              <p className="flow-editor-empty__desc">
                Haz clic en un nodo del lienzo para ver y editar sus propiedades.
              </p>
            </div>
          )}
        </aside>
      </div>

      {settingsOpen && (
        <div className="flow-editor-modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="flow-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flow-editor-modal-header">
              <h3>Ajustes del flujo</h3>
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
