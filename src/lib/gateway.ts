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
    id: 'pro',
    name: 'Pro',
    price: '$29',
    priceNote: '/month',
    rateLimit: 60,
    monthlyRequests: 25000,
    highlighted: true,
    features: [
      '25,000 requests/month',
      '60 requests/min',
      'Everything in Free',
      'Embeddings & RAG',
      'Document uploads',
      'Semantic search',
      'Priority support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$149',
    priceNote: '/month',
    rateLimit: 300,
    monthlyRequests: 500000,
    features: [
      '500,000 requests/month',
      '300 requests/min',
      'Everything in Pro',
      'Fine-tuning',
      'White-label',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
];
