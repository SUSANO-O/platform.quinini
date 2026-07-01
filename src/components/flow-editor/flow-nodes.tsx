'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { NODE_TYPE_ICONS, NODE_TYPE_LABELS } from '@/lib/flow-editor/constants';
import type { FlowNodeData } from '@/lib/flow-editor/serialization';

type FlowRfNode = Node<FlowNodeData>;

function StartNode({ data }: NodeProps<FlowRfNode>) {
  return (
    <div className="flow-rf-node flow-rf-node--start">
      <div className="flow-rf-node__header">
        <span className="flow-rf-node__icon">{NODE_TYPE_ICONS.start}</span>
        <span className="flow-rf-node__type">START</span>
      </div>
      <p className="flow-rf-node__question">{data.question ?? 'El flujo comienza aquí'}</p>
      <Handle type="source" position={Position.Bottom} id="output" className="flow-rf-handle" />
    </div>
  );
}

function StepNode({ data, selected }: NodeProps<FlowRfNode>) {
  const icon = NODE_TYPE_ICONS[data.flowType] ?? '📝';
  const label = NODE_TYPE_LABELS[data.flowType] ?? data.flowType;
  const isEnd = data.flowType === 'end';

  return (
    <div className={`flow-rf-node ${selected ? 'flow-rf-node--selected' : ''} ${isEnd ? 'flow-rf-node--end' : ''}`}>
      <Handle type="target" position={Position.Top} id="input" className="flow-rf-handle" />
      <div className="flow-rf-node__header">
        <span className="flow-rf-node__icon">{icon}</span>
        <span className="flow-rf-node__type">{label}</span>
      </div>
      <p className="flow-rf-node__question">{data.question ?? '…'}</p>
      {!isEnd && data.flowType !== 'multiple_choice' && (
        <Handle type="source" position={Position.Bottom} id="output" className="flow-rf-handle" />
      )}
    </div>
  );
}

function ChoiceNode({ data, selected }: NodeProps<FlowRfNode>) {
  const options = data.options ?? [];

  return (
    <div className={`flow-rf-node flow-rf-node--choice ${selected ? 'flow-rf-node--selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="input" className="flow-rf-handle" />
      <div className="flow-rf-node__header">
        <span className="flow-rf-node__icon">{NODE_TYPE_ICONS.multiple_choice}</span>
        <span className="flow-rf-node__type">MULTIPLE CHOICE</span>
      </div>
      <p className="flow-rf-node__question">{data.question ?? '¿Cómo podemos ayudarte?'}</p>
      <div className="flow-rf-node__options">
        {options.map((opt, idx) => (
          <span key={opt.value} className="flow-rf-option">
            {opt.label}
            <Handle
              type="source"
              position={Position.Right}
              id={`option-${idx}`}
              className="flow-rf-handle flow-rf-handle--option"
            />
          </span>
        ))}
      </div>
    </div>
  );
}

export const flowNodeTypes = {
  flowStart: memo(StartNode),
  flowStep: memo(StepNode),
  flowChoice: memo(ChoiceNode),
};
