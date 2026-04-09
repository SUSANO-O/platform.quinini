import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-04-30.basil',
});

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 19,
    priceId: process.env.STRIPE_PRICE_STARTER || '',
    widgets: 3,
    requests: '50k/mo',
    features: ['3 widgets', '50,000 requests/month', 'Chat SDK', 'Basic analytics'],
  },
  growth: {
    name: 'Growth',
    price: 49,
    priceId: process.env.STRIPE_PRICE_GROWTH || '',
    widgets: 6,
    requests: '200k/mo',
    features: ['6 widgets', '200,000 requests/month', 'Chat SDK + RAG', 'Advanced analytics', 'Priority support'],
  },
  business: {
    name: 'Business',
    price: 129,
    priceId: process.env.STRIPE_PRICE_BUSINESS || '',
    widgets: 12,
    requests: 'Unlimited',
    features: ['12 widgets', 'Unlimited requests', 'All features', 'Dedicated support', 'Custom agents', 'SLA 99.9%'],
  },
} as const;
