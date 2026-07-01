import type { FlowNode, FlowNodeType, FlowSettings } from './types';

export const WORKSPACE_RAIL_WIDTH_PX = 64;

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  description: '',
  tags: '',
  generatesLeads: false,
  enabledChannels: ['widget'],
  completionMessage: 'Gracias. Nos pondremos en contacto contigo pronto.',
  tooltipEnabled: false,
  tooltipMessage: '👋 ¿Necesitas ayuda? ¡Chatea con nosotros!',
  tooltipDelay: 3000,
  tooltipDuration: 5000,
};

export const NODE_PALETTE: {
  section: string;
  items: { type: FlowNodeType; icon: string; name: string; desc: string }[];
}[] = [
  {
    section: 'Tipos de pregunta',
    items: [
      { type: 'text', icon: '📝', name: 'Texto', desc: 'Respuesta libre' },
      { type: 'multiple_choice', icon: '☑️', name: 'Opción múltiple', desc: 'Botones de opción' },
      { type: 'number', icon: '🔢', name: 'Número', desc: 'Entrada numérica' },
      { type: 'email', icon: '📧', name: 'Email', desc: 'Correo electrónico' },
      { type: 'phone', icon: '📱', name: 'Teléfono', desc: 'Número de teléfono' },
    ],
  },
  {
    section: 'Control de flujo',
    items: [
      { type: 'condition', icon: '🔀', name: 'Condición', desc: 'Ramificación' },
      { type: 'end', icon: '🏁', name: 'Fin', desc: 'Completar flujo' },
    ],
  },
  {
    section: 'Integraciones',
    items: [
      { type: 'calendar_booking', icon: '📅', name: 'Calendario', desc: 'Reserva BotIvA' },
      { type: 'calendly_booking', icon: '📆', name: 'Calendly', desc: 'Agenda externa' },
    ],
  },
];

export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  start: 'Inicio',
  text: 'texto',
  multiple_choice: 'opción múltiple',
  number: 'número',
  email: 'email',
  phone: 'teléfono',
  condition: 'condición',
  end: 'fin',
  calendar_booking: 'calendario',
  calendly_booking: 'calendly',
};

export const NODE_TYPE_ICONS: Record<FlowNodeType, string> = {
  start: '🚀',
  text: '📝',
  multiple_choice: '☑️',
  number: '🔢',
  email: '📧',
  phone: '📱',
  condition: '🔀',
  end: '🏁',
  calendar_booking: '📅',
  calendly_booking: '📆',
};

export function createStartNode(): FlowNode {
  return {
    id: 'start',
    type: 'start',
    x: 100,
    y: 100,
    question: 'El flujo comienza aquí',
  };
}

export function createFlowNode(type: FlowNodeType, x: number, y: number, id?: string): FlowNode {
  const nodeId = id ?? `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const base: FlowNode = { id: nodeId, type, x, y };

  switch (type) {
    case 'multiple_choice':
      return {
        ...base,
        question: '¿Cómo podemos ayudarte?',
        options: [
          { label: 'Opción A', value: 'a' },
          { label: 'Opción B', value: 'b' },
        ],
      };
    case 'end':
      return { ...base, question: '¡Gracias! Hemos recibido tu información.' };
    case 'email':
      return { ...base, question: '¿Cuál es tu correo electrónico?' };
    case 'phone':
      return { ...base, question: '¿Cuál es tu número de teléfono?' };
    case 'number':
      return { ...base, question: 'Introduce un número:' };
    case 'condition':
      return { ...base, question: 'Condición de ramificación' };
    case 'calendar_booking':
      return { ...base, question: 'Selecciona una fecha en el calendario' };
    case 'calendly_booking':
      return { ...base, question: 'Reserva tu cita con Calendly' };
    default:
      return { ...base, question: 'Escribe tu pregunta aquí' };
  }
}

/** Plantilla: ticket de soporte (como en el HTML de referencia). */
export function supportTicketTemplate(): { nodes: FlowNode[]; connections: import('./types').FlowConnection[] } {
  const nodes: FlowNode[] = [
    createStartNode(),
    {
      id: 'node_1',
      type: 'multiple_choice',
      x: 150,
      y: 250,
      question: '¡Hola! 👋 ¿Cómo podemos ayudarte hoy?',
      options: [
        { label: 'Problema técnico', value: 'technical' },
        { label: 'Facturación', value: 'billing' },
        { label: 'Solicitud de función', value: 'feature' },
        { label: 'Pregunta general', value: 'general' },
      ],
    },
    {
      id: 'node_2',
      type: 'text',
      x: 150,
      y: 500,
      question: 'Describe tu problema con detalle:',
    },
    {
      id: 'node_3',
      type: 'multiple_choice',
      x: 150,
      y: 700,
      question: '¿Qué tan urgente es?',
      options: [
        { label: 'Crítico', value: 'critical' },
        { label: 'Alto', value: 'high' },
        { label: 'Medio', value: 'medium' },
        { label: 'Bajo', value: 'low' },
      ],
    },
    {
      id: 'node_4',
      type: 'email',
      x: 150,
      y: 950,
      question: '¿Cuál es tu email para actualizaciones?',
    },
    {
      id: 'node_5',
      type: 'end',
      x: 150,
      y: 1150,
      question: '¡Gracias! 🎫 Tu ticket ha sido creado.',
    },
  ];

  const connections: import('./types').FlowConnection[] = [
    { id: 'conn_start', fromNodeId: 'start', fromHandle: 'output', toNodeId: 'node_1' },
    { id: 'conn_1a', fromNodeId: 'node_1', fromHandle: 'option:0', toNodeId: 'node_2' },
    { id: 'conn_1b', fromNodeId: 'node_1', fromHandle: 'option:1', toNodeId: 'node_2' },
    { id: 'conn_1c', fromNodeId: 'node_1', fromHandle: 'option:2', toNodeId: 'node_2' },
    { id: 'conn_1d', fromNodeId: 'node_1', fromHandle: 'option:3', toNodeId: 'node_2' },
    { id: 'conn_2', fromNodeId: 'node_2', fromHandle: 'output', toNodeId: 'node_3' },
    { id: 'conn_3a', fromNodeId: 'node_3', fromHandle: 'option:0', toNodeId: 'node_4' },
    { id: 'conn_3b', fromNodeId: 'node_3', fromHandle: 'option:1', toNodeId: 'node_4' },
    { id: 'conn_3c', fromNodeId: 'node_3', fromHandle: 'option:2', toNodeId: 'node_4' },
    { id: 'conn_3d', fromNodeId: 'node_3', fromHandle: 'option:3', toNodeId: 'node_4' },
    { id: 'conn_4', fromNodeId: 'node_4', fromHandle: 'output', toNodeId: 'node_5' },
  ];

  return { nodes, connections };
}
