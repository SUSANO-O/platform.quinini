'use client';

import { useState } from 'react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';
import { Play, Loader2, Copy, Check, ChevronDown } from 'lucide-react';

// Use local proxy to avoid CORS issues
const GATEWAY_URL = '';

const AGENTS = [
  { id: 'health-monitor', name: 'Health Monitor', defaultInput: '{\n  "spo2": 98,\n  "heartRate": 72,\n  "bloodPressure": "120/80"\n}' },
  { id: 'water-quality', name: 'Water Quality', defaultInput: '{\n  "ph": 7.2,\n  "turbidity": 3.1,\n  "chlorine": 0.5\n}' },
  { id: 'drug-discovery', name: 'Drug Discovery', defaultInput: '{\n  "molecule": "C9H8O4",\n  "target": "COX-2"\n}' },
  { id: 'sustainable-agriculture', name: 'Smart Agriculture', defaultInput: '{\n  "soilPh": 6.5,\n  "moisture": 45,\n  "crop": "tomato"\n}' },
  { id: 'personalized-education', name: 'Education AI', defaultInput: '{\n  "topic": "calculus",\n  "level": "beginner",\n  "style": "visual"\n}' },
  { id: 'plethysmography', name: 'Plethysmography', defaultInput: '{\n  "waveformData": [0.2, 0.5, 0.9, 0.7, 0.3],\n  "sampleRate": 100\n}' },
  { id: 'geoeconomics', name: 'Geoeconomics', defaultInput: '{\n  "analysisType": "country",\n  "country": "Brazil",\n  "gdpGrowth": 2.9,\n  "inflation": 4.6,\n  "unemployment": 7.8,\n  "debtToGdp": 74,\n  "tradeBalance": 8500\n}' },
];

const ENDPOINTS = [
  // Agent Farm
  { id: 'agent-farm', name: 'Agent Farm (Execute)', method: 'POST', path: 'agent-farm', needsAgent: true, group: 'Agent Farm' },
  { id: 'agent-farm-status', name: 'Farm Status', method: 'GET', path: 'agent-farm', needsAgent: false, group: 'Agent Farm' },
  // Agents CRUD
  { id: 'agents-list', name: 'List Agents', method: 'GET', path: 'agents', needsAgent: false, group: 'Agents' },
  { id: 'agents-create', name: 'Create Agent', method: 'POST', path: 'agents', needsAgent: false, group: 'Agents' },
  // Models
  { id: 'models', name: 'AI Generate', method: 'POST', path: 'models', needsAgent: false, group: 'Models' },
  { id: 'models-health', name: 'Models Health', method: 'GET', path: 'models', needsAgent: false, group: 'Models' },
  // Embeddings & RAG
  { id: 'embeddings-embed', name: 'Generate Embeddings', method: 'POST', path: 'embeddings/embed', needsAgent: false, group: 'Embeddings' },
  { id: 'embeddings-search', name: 'Semantic Search', method: 'POST', path: 'embeddings/search', needsAgent: false, group: 'Embeddings' },
  { id: 'embeddings-rag', name: 'RAG Query', method: 'POST', path: 'embeddings/rag', needsAgent: false, group: 'Embeddings' },
  { id: 'embeddings-upload', name: 'Upload Document', method: 'POST', path: 'embeddings/upload', needsAgent: false, group: 'Embeddings' },
  // Health & Analytics
  { id: 'analyze-health', name: 'Health Analysis', method: 'POST', path: 'analyze-health', needsAgent: false, group: 'Health' },
  { id: 'analyze-pleth', name: 'Plethysmography Analysis', method: 'POST', path: 'analyze-plethysmography', needsAgent: false, group: 'Health' },
  // Usage
  { id: 'usage', name: 'My Usage Stats', method: 'GET', path: 'usage', needsAgent: false, group: 'Account' },
];

export default function PlaygroundPage() {
  const [apiKey, setApiKey] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS[0]);
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0]);
  const [inputBody, setInputBody] = useState(AGENTS[0].defaultInput);
  const [customPrompt, setCustomPrompt] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  async function execute() {
    if (!apiKey.trim()) {
      setResponse(JSON.stringify({ error: 'Please enter your API key' }, null, 2));
      return;
    }

    setLoading(true);
    setResponse(null);
    setLatency(null);
    setStatus(null);

    const start = Date.now();

    try {
      const url = `${GATEWAY_URL}/api/gateway/${selectedEndpoint.path}`;
      const isGet = selectedEndpoint.method === 'GET';

      let body: string | undefined;
      if (!isGet) {
        if (selectedEndpoint.id === 'agent-farm') {
          // Wrap agent input with mode + agent id
          body = JSON.stringify({
            mode: 'direct',
            agent: selectedAgent.id,
            data: JSON.parse(inputBody),
          });
        } else {
          // All other POST endpoints: send the textarea JSON directly
          body = inputBody;
        }
      }

      const res = await fetch(url, {
        method: selectedEndpoint.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        ...(body ? { body } : {}),
      });

      const data = await res.json();
      setLatency(Date.now() - start);
      setStatus(res.status);
      setResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setLatency(Date.now() - start);
      setStatus(0);
      setResponse(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setLoading(false);
    }
  }

  function copyResponse() {
    if (response) {
      navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <div className="pt-28 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10">
            <h1 className="text-3xl font-extrabold">API Playground</h1>
            <p style={{ color: 'var(--muted-foreground)' }}>
              Test the AgentFlow API live. Enter your API key and try any endpoint.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left — Request */}
            <div className="space-y-4">
              {/* API Key */}
              <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="afhub_live_..."
                  className="w-full mt-2 px-4 py-2.5 rounded-xl text-sm font-mono outline-none"
                  style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                />
              </div>

              {/* Endpoint selector */}
              <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                  Endpoint
                </label>
                <div className="relative mt-2">
                  <select
                    value={selectedEndpoint.id}
                    onChange={(e) => {
                      const ep = ENDPOINTS.find((x) => x.id === e.target.value)!;
                      setSelectedEndpoint(ep);
                      setResponse(null);
                      // Set default body for each endpoint
                      const defaults: Record<string, string> = {
                        'agent-farm': selectedAgent.defaultInput,
                        'agents-create': JSON.stringify({ name: "Mi Nuevo Agente", description: "Descripción del agente", prompt: "Eres un experto en...", model: "gemini-2.5-flash", hasWidget: true }, null, 2),
                        'models': JSON.stringify({ prompt: "Hello, what can you do?", provider: "gemini" }, null, 2),
                        'embeddings-embed': JSON.stringify({ texts: ["What is vector similarity search?"] }, null, 2),
                        'embeddings-search': JSON.stringify({ query: "water quality analysis", agentId: "agente-de-geoeconomia", topK: 5 }, null, 2),
                        'embeddings-rag': JSON.stringify({ query: "What are safe pH levels?", agentId: "agente-de-geoeconomia" }, null, 2),
                        'analyze-health': JSON.stringify({ spo2: 98, heartRate: 72, bloodPressure: "120/80" }, null, 2),
                        'analyze-pleth': JSON.stringify({ waveformData: [0.2, 0.5, 0.9, 0.7, 0.3], sampleRate: 100 }, null, 2),
                      };
                      if (defaults[ep.id]) setInputBody(defaults[ep.id]);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none cursor-pointer"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  >
                    {Array.from(new Set(ENDPOINTS.map((e) => e.group))).map((group) => (
                      <optgroup key={group} label={group}>
                        {ENDPOINTS.filter((e) => e.group === group).map((ep) => (
                          <option key={ep.id} value={ep.id}>
                            {ep.method} — {ep.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3.5 pointer-events-none" style={{ color: 'var(--muted-foreground)' }} />
                </div>
              </div>

              {/* Agent selector (for agent-farm) */}
              {selectedEndpoint.needsAgent && (
                <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    Agent
                  </label>
                  <div className="relative mt-2">
                    <select
                      value={selectedAgent.id}
                      onChange={(e) => {
                        const ag = AGENTS.find((x) => x.id === e.target.value)!;
                        setSelectedAgent(ag);
                        setInputBody(ag.defaultInput);
                      }}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none cursor-pointer"
                      style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                    >
                      {AGENTS.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-3.5 pointer-events-none" style={{ color: 'var(--muted-foreground)' }} />
                  </div>
                </div>
              )}

              {/* Body input */}
              {selectedEndpoint.method !== 'GET' && (
                <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    Request Body (JSON)
                  </label>
                  <textarea
                    value={inputBody}
                    onChange={(e) => setInputBody(e.target.value)}
                    rows={8}
                    className="w-full mt-2 px-4 py-3 rounded-xl text-sm font-mono outline-none resize-none"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  />
                </div>
              )}

              {/* Execute */}
              <button
                onClick={execute}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:shadow-lg disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0d9488, #6366f1)' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {loading ? 'Executing...' : 'Send Request'}
              </button>
            </div>

            {/* Right — Response */}
            <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--card)', border: '1px solid var(--border)', minHeight: 400 }}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    Response
                  </span>
                  {status !== null && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: status >= 200 && status < 300 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: status >= 200 && status < 300 ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {status}
                    </span>
                  )}
                  {latency !== null && (
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{latency}ms</span>
                  )}
                </div>
                {response && (
                  <button onClick={copyResponse} className="text-xs flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }}>
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>

              <div className="flex-1 p-5 overflow-auto">
                {response ? (
                  <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--card-foreground)' }}>
                    {response}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      Send a request to see the response here
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
