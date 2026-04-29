const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3100';

export function gatewayUrl(path: string) {
  return `${GATEWAY_URL}/api/gateway/${path}`;
}

export function gatewayAdminUrl(path: string) {
  return `${GATEWAY_URL}/api/${path}`;
}

export async function gatewayFetch(
  path: string,
  apiKey: string,
  options?: RequestInit,
) {
  const url = gatewayUrl(path);
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...options?.headers,
    },
  });
}

export type Agent = {
  _id: string;
  name: string;
  description: string;
  status: string;
  type: string;
  systemPrompt?: string;
  tools?: string[];
};

export type PlanInfo = {
  id: string;
  name: string;
  price: string;
  priceNote?: string;
  rateLimit: number;
  monthlyRequests: number;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    rateLimit: 10,
    monthlyRequests: 500,
    features: [
      '500 requests/month',
      '10 requests/min',
      'Agent execution',
      'Model generation',
      'Community support',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    priceNote: '/month',
    rateLimit: 60,
    monthlyRequests: 5000,
    features: [
      '5,000 conversaciones/mes',
      '60 requests/min',
      'Modelos rápidos (Gemini Flash)',
      'Sin RAG (sube a Growth para conocimiento)',
      'Soporte prioritario',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$79',
    priceNote: '/month',
    rateLimit: 120,
    monthlyRequests: 25000,
    highlighted: true,
    features: [
      '25,000 conversaciones/mes',
      'Modelos avanzados',
      'RAG + carga de archivos/URLs',
      'Límite de conocimiento: 100 MB o 50 fuentes',
      'Soporte prioritario',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '$199',
    priceNote: '/month',
    rateLimit: 300,
    monthlyRequests: 100000,
    features: [
      '100,000 conversaciones/mes',
      'Integraciones MCP',
      'Límites altos de RAG y herramientas',
      'Soporte dedicado',
      'SLA',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Contacto',
    rateLimit: 600,
    monthlyRequests: 1000000,
    features: [
      'Volumen empresarial',
      'White-label',
      'Acuerdos personalizados',
      'Soporte dedicado 24/7',
    ],
  },
];
