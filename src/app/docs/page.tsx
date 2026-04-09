import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

const STRIPE_SETUP_CMDS = [
  {
    title: '1. Crear producto Starter ($19/mes)',
    cmd: `# Paso 1 — crear producto
PROD=$(curl -s https://api.stripe.com/v1/products \\
  -u "$SK:" -d "name=Starter" | grep -o '"id": "prod_[^"]*"' | cut -d'"' -f4)

# Paso 2 — crear precio recurrente
curl -s https://api.stripe.com/v1/prices \\
  -u "$SK:" \\
  -d "product=$PROD" \\
  -d "unit_amount=1900" \\
  -d "currency=usd" \\
  -d "recurring[interval]=month" \\
  -d "nickname=Starter"
# → guarda el "id": "price_..." del response`,
  },
  {
    title: '2. Crear producto Growth ($49/mes)',
    cmd: `PROD=$(curl -s https://api.stripe.com/v1/products \\
  -u "$SK:" -d "name=Growth" | grep -o '"id": "prod_[^"]*"' | cut -d'"' -f4)

curl -s https://api.stripe.com/v1/prices \\
  -u "$SK:" \\
  -d "product=$PROD" \\
  -d "unit_amount=4900" \\
  -d "currency=usd" \\
  -d "recurring[interval]=month" \\
  -d "nickname=Growth"`,
  },
  {
    title: '3. Crear producto Business ($129/mes)',
    cmd: `PROD=$(curl -s https://api.stripe.com/v1/products \\
  -u "$SK:" -d "name=Business" | grep -o '"id": "prod_[^"]*"' | cut -d'"' -f4)

curl -s https://api.stripe.com/v1/prices \\
  -u "$SK:" \\
  -d "product=$PROD" \\
  -d "unit_amount=12900" \\
  -d "currency=usd" \\
  -d "recurring[interval]=month" \\
  -d "nickname=Business"`,
  },
  {
    title: '4. Verificar que los precios estén activos',
    cmd: `curl -s https://api.stripe.com/v1/prices?active=true \\
  -u "$SK:" | grep -E '"id"|"nickname"|"unit_amount"|"active"'`,
  },
  {
    title: '5. Actualizar .env con los price IDs',
    cmd: `# En .env:
STRIPE_PRICE_STARTER=price_1TJMpV2dx33YwrpgWgTjdajP
STRIPE_PRICE_GROWTH=price_1TJMpj2dx33YwrpgGzX9mZ9J
STRIPE_PRICE_BUSINESS=price_1TJMpk2dx33YwrpgebJGEbUx

# Reiniciar servidor para que tome los nuevos valores
npm run dev`,
  },
];

const ENDPOINT_GROUPS = [
  {
    group: 'Agent Farm',
    endpoints: [
      { method: 'POST', path: '/gateway/agent-farm', desc: 'Execute an AI agent with structured input', plan: 'free' },
      { method: 'GET', path: '/gateway/agent-farm', desc: 'Get farm status and registered agents', plan: 'free' },
    ],
  },
  {
    group: 'Agents CRUD',
    endpoints: [
      { method: 'GET', path: '/gateway/agents', desc: 'List all agents', plan: 'free' },
      { method: 'GET', path: '/gateway/agents/:id', desc: 'Get agent details', plan: 'free' },
      { method: 'POST', path: '/gateway/agents', desc: 'Create a new agent', plan: 'pro' },
      { method: 'PUT', path: '/gateway/agents/:id', desc: 'Update an agent', plan: 'pro' },
    ],
  },
  {
    group: 'AI Models',
    endpoints: [
      { method: 'POST', path: '/gateway/models', desc: 'Generate text with AI (multi-provider)', plan: 'free' },
      { method: 'GET', path: '/gateway/models', desc: 'Model health and availability report', plan: 'free' },
    ],
  },
  {
    group: 'Embeddings & RAG',
    endpoints: [
      { method: 'POST', path: '/gateway/embeddings/embed', desc: 'Generate vector embeddings for text', plan: 'pro' },
      { method: 'POST', path: '/gateway/embeddings/search', desc: 'Semantic similarity search', plan: 'pro' },
      { method: 'POST', path: '/gateway/embeddings/upload', desc: 'Upload and process a document for RAG', plan: 'pro' },
      { method: 'POST', path: '/gateway/embeddings/rag', desc: 'Query with RAG-augmented context', plan: 'pro' },
      { method: 'GET', path: '/gateway/embeddings/stats/:agentId', desc: 'Vector store statistics', plan: 'pro' },
      { method: 'GET', path: '/gateway/embeddings/files/:agentId', desc: 'List processed files', plan: 'pro' },
      { method: 'DELETE', path: '/gateway/embeddings/file', desc: 'Delete file vectors', plan: 'pro' },
    ],
  },
  {
    group: 'Geoeconomics',
    endpoints: [
      { method: 'POST', path: '/gateway/agent-farm', desc: 'Execute geoeconomics agent (agent: "geoeconomics")', plan: 'free' },
    ],
  },
  {
    group: 'Health & Analytics',
    endpoints: [
      { method: 'POST', path: '/gateway/analyze-health', desc: 'Comprehensive health analysis', plan: 'free' },
      { method: 'POST', path: '/gateway/analyze-plethysmography', desc: 'Plethysmography waveform analysis', plan: 'free' },
    ],
  },
];

const methodColors: Record<string, string> = {
  GET: '#22c55e',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  DELETE: '#ef4444',
};

const planBadge: Record<string, { bg: string; text: string }> = {
  free: { bg: 'rgba(34,197,94,0.1)', text: '#22c55e' },
  pro: { bg: 'rgba(13,148,136,0.1)', text: '#0d9488' },
  enterprise: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
};

export default function DocsPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <div className="pt-28 pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-extrabold mb-2">API Documentation</h1>
          <p className="text-lg mb-10" style={{ color: 'var(--muted-foreground)' }}>
            Base URL: <code className="px-2 py-0.5 rounded-lg text-sm font-mono" style={{ background: 'var(--muted)', color: '#0d9488' }}>
              https://api.agentflowhub.com
            </code>
          </p>

          {/* Auth */}
          <div className="rounded-2xl p-7 mb-10" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4">Authentication</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
              All requests require an API key. Send it in one of these headers:
            </p>
            <pre className="rounded-xl p-5 text-sm overflow-x-auto" style={{ background: 'var(--muted)' }}>
{`Authorization: Bearer afhub_live_abc123
# or
X-API-Key: afhub_live_abc123`}
            </pre>
          </div>

          {/* Response format */}
          <div className="rounded-2xl p-7 mb-10" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4">Response Format</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
              All responses include gateway metadata in headers:
            </p>
            <pre className="rounded-xl p-5 text-sm overflow-x-auto" style={{ background: 'var(--muted)' }}>
{`X-Gateway: agentflow
X-Gateway-Plan: pro
X-Gateway-Latency: 142ms
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1711540800`}
            </pre>
          </div>

          {/* Endpoints */}
          <h2 className="text-2xl font-bold mb-6" id="endpoints">Endpoints</h2>

          <div className="space-y-8">
            {ENDPOINT_GROUPS.map((group) => (
              <div key={group.group}>
                <h3 className="text-lg font-bold mb-3">{group.group}</h3>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {group.endpoints.map((ep, i) => (
                    <div
                      key={ep.path + ep.method}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                      style={{
                        background: 'var(--card)',
                        borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                      }}
                    >
                      <span
                        className="font-mono text-xs font-bold w-16 text-center shrink-0"
                        style={{ color: methodColors[ep.method] || 'var(--muted-foreground)' }}
                      >
                        {ep.method}
                      </span>
                      <code className="text-sm font-mono flex-1" style={{ color: 'var(--foreground)' }}>
                        {ep.path}
                      </code>
                      <span className="text-xs hidden md:block" style={{ color: 'var(--muted-foreground)' }}>
                        {ep.desc}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: planBadge[ep.plan].bg, color: planBadge[ep.plan].text }}
                      >
                        {ep.plan}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Start */}
          <div className="mt-16 rounded-2xl p-7" id="sdks" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4">Quick Start</h2>
            <pre className="rounded-xl p-5 text-sm overflow-x-auto" style={{ background: '#0f1729', color: '#e2e8f0' }}>
{`# 1. Get your API key from /dashboard

# 2. Execute an agent
curl -X POST https://api.agentflowhub.com/gateway/agent-farm \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agent": "health-monitor", "input": {"spo2": 98, "heartRate": 72}}'

# 3. Generate embeddings
curl -X POST https://api.agentflowhub.com/gateway/embeddings/embed \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"texts": ["Water quality in rural areas"]}'

# 4. RAG query
curl -X POST https://api.agentflowhub.com/gateway/embeddings/rag \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId": "AGENT_ID", "query": "What are the safe pH levels?"}'

# 5. Check your usage
curl https://api.agentflowhub.com/api/gateway/usage \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
            </pre>
          </div>

          {/* Stripe Setup */}
          <div className="mt-16" id="stripe-setup">
            <h2 className="text-2xl font-bold mb-2">Stripe — Setup de productos y precios</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
              Comandos curl para crear los productos y precios de suscripción via API de Stripe.
              Reemplaza <code className="px-1 rounded" style={{ background: 'var(--muted)' }}>$SK</code> con tu{' '}
              <code className="px-1 rounded" style={{ background: 'var(--muted)' }}>STRIPE_SECRET_KEY</code>.
            </p>
            <div className="space-y-5">
              {STRIPE_SETUP_CMDS.map((s) => (
                <div key={s.title} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="px-5 py-3 font-semibold text-sm" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                    {s.title}
                  </div>
                  <pre className="p-5 text-xs overflow-x-auto leading-relaxed" style={{ background: '#0f1729', color: '#e2e8f0' }}>
                    {s.cmd}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* Widget SDK */}
          <div className="mt-8 rounded-2xl p-7" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4">Chat Widget SDK</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
              Embed a conversational AI widget in any website:
            </p>
            <pre className="rounded-xl p-5 text-sm overflow-x-auto" style={{ background: '#0f1729', color: '#e2e8f0' }}>
{`<script src="https://agentflowhub.com/widget.js"></script>
<script>
  AgentFlowhub.init({
    agentId: "YOUR_AGENT_ID",
    token: "YOUR_WIDGET_TOKEN",
    theme: "dark",
    position: "bottom-right"
  });
</script>`}
            </pre>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
