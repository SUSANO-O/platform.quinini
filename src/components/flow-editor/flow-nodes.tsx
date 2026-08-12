'use client';

import { memo, type ComponentType } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { LucideIcon } from '@/components/ui/icons';
import {
  Calendar,
  CalendarDays,
  CornerDownRight,
  Dices,
  Flag,
  GitBranch,
  Hash,
  ListChecks,
  Mail,
  MessageSquareText,
  Phone,
  Pin,
  Play,
  Timer,
  Type,
} from '@/components/ui/icons';
import { NODE_TYPE_LABELS } from '@/lib/flow-editor/constants';
import type { FlowNodeType } from '@/lib/flow-editor/types';
import type { FlowNodeData } from '@/lib/flow-editor/serialization';

type FlowRfNode = Node<FlowNodeData>;

const NODE_ICONS: Record<FlowNodeType, LucideIcon> = {
  start: Play,
  text: Type,
  multiple_choice: ListChecks,
  number: Hash,
  email: Mail,
  phone: Phone,
  message: MessageSquareText,
  delay: Timer,
  set_variable: Pin,
  goto: CornerDownRight,
  random: Dices,
  condition: GitBranch,
  end: Flag,
  calendar_booking: Calendar,
  calendly_booking: CalendarDays,
};

function NodeIcon({ type }: { type: FlowNodeType }) {
  const Icon = NODE_ICONS[type] ?? Type;
  return <Icon size={14} strokeWidth={2} aria-hidden />;
}

function StartNode({ data }: NodeProps<FlowRfNode>) {
  return (
    <div className="flow-rf-node flow-rf-node--start">
      <div className="flow-rf-node__header">
        <span className="flow-rf-node__icon" aria-hidden>
          <NodeIcon type="start" />
        </span>
        <span className="flow-rf-node__type">{NODE_TYPE_LABELS.start}</span>
      </div>
      <p className="flow-rf-node__question">{data.question ?? 'El flujo comienza aquí'}</p>
      <Handle type="source" position={Position.Bottom} id="output" className="flow-rf-handle" />
    </div>
  );
}

function StepNode({ data, selected }: NodeProps<FlowRfNode>) {
  const label = NODE_TYPE_LABELS[data.flowType] ?? data.flowType;
  const isEnd = data.flowType === 'end';
  const isBooking =
    data.flowType === 'calendar_booking' || data.flowType === 'calendly_booking';
  const cfg = data.config;

  let meta = '';
  if (cfg?.placeholder) meta = `Placeholder: ${cfg.placeholder}`;
  if (isBooking && cfg?.bookingUrl) meta = cfg.bookingUrl;
  if (data.flowType === 'delay' && typeof cfg?.delayMs === 'number') {
    meta = `${(cfg.delayMs / 1000).toFixed(cfg.delayMs % 1000 === 0 ? 0 : 1)} s`;
  }
  if (data.flowType === 'set_variable' && cfg?.variableKey) {
    meta = `${cfg.variableKey} = ${cfg.setValue ?? ''}`;
  }
  if (data.flowType === 'goto') {
    meta = cfg?.targetNodeId ? `→ ${cfg.targetNodeId}` : '→ Inicio';
  }

  return (
    <div
      className={`flow-rf-node flow-rf-node--${data.flowType} ${selected ? 'flow-rf-node--selected' : ''} ${isEnd ? 'flow-rf-node--end' : ''}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="flow-rf-handle" />
      <div className="flow-rf-node__header">
        <span className="flow-rf-node__icon" aria-hidden>
          <NodeIcon type={data.flowType} />
        </span>
        <span className="flow-rf-node__type">{label}</span>
      </div>
      <p className="flow-rf-node__question">{data.question ?? '…'}</p>
      {meta ? <p className="flow-rf-node__meta">{meta}</p> : null}
      {!isEnd && data.flowType !== 'goto' && (
        <Handle type="source" position={Position.Bottom} id="output" className="flow-rf-handle" />
      )}
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps<FlowRfNode>) {
  const cfg = data.config;
  const op = cfg?.operator ?? 'eq';
  const summary = cfg?.sourceVariable
    ? `${cfg.sourceVariable} ${op}${cfg.compareValue ? ` “${cfg.compareValue}”` : ''}`
    : 'Configura la condición →';

  return (
    <div className={`flow-rf-node flow-rf-node--condition ${selected ? 'flow-rf-node--selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="input" className="flow-rf-handle" />
      <div className="flow-rf-node__header">
        <span className="flow-rf-node__icon" aria-hidden>
          <NodeIcon type="condition" />
        </span>
        <span className="flow-rf-node__type">{NODE_TYPE_LABELS.condition}</span>
      </div>
      <p className="flow-rf-node__question">{data.question ?? 'Condición'}</p>
      <p className="flow-rf-node__meta">{summary}</p>
      <div className="flow-rf-node__branches">
        <span className="flow-rf-branch flow-rf-branch--yes">
          Sí
          <Handle type="source" position={Position.Bottom} id="true" className="flow-rf-handle" />
        </span>
        <span className="flow-rf-branch flow-rf-branch--no">
          No
          <Handle type="source" position={Position.Bottom} id="false" className="flow-rf-handle" />
        </span>
      </div>
    </div>
  );
}

function ChoiceNode({ data, selected }: NodeProps<FlowRfNode>) {
  const options = data.options ?? [];
  const isRandom = data.flowType === 'random';
  const type = isRandom ? 'random' : 'multiple_choice';

  return (
    <div
      className={`flow-rf-node flow-rf-node--${isRandom ? 'random' : 'choice'} ${selected ? 'flow-rf-node--selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="flow-rf-handle" />
      <div className="flow-rf-node__header">
        <span className="flow-rf-node__icon" aria-hidden>
          <NodeIcon type={type} />
        </span>
        <span className="flow-rf-node__type">{NODE_TYPE_LABELS[type]}</span>
      </div>
      <p className="flow-rf-node__question">
        {data.question ?? (isRandom ? 'Ruta aleatoria' : '¿Cómo podemos ayudarte?')}
      </p>
      <div className="flow-rf-node__options">
        {options.map((opt, idx) => (
          <span key={`${opt.value}-${idx}`} className="flow-rf-option">
            {opt.label}
            <Handle
              type="source"
              position={Position.Right}
              id={`option-${idx}`}
              className="flow-rf-handle flow-rf-handle--option"
            />
          </span>
        ))}
        {options.length === 0 && (
          <span className="flow-rf-option flow-rf-option--empty">Sin rutas</span>
        )}
      </div>
    </div>
  );
}

export const flowNodeTypes: Record<string, ComponentType<NodeProps<FlowRfNode>>> = {
  flowStart: memo(StartNode),
  flowStep: memo(StepNode),
  flowChoice: memo(ChoiceNode),
  flowCondition: memo(ConditionNode),
};
