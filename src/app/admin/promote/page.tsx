'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';

export default function PromotePage() {
  const [email, setEmail]   = useState('');
  const [code, setCode]     = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setResult('');
    setLoading(true);
    const res = await fetch('/api/admin/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, secret: code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) setError(data.error || 'Error.');
    else setResult(`✅ ${data.email} ahora es admin.`);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--foreground)', fontSize: '14px', boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={{ padding: '32px', maxWidth: '440px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <Shield size={20} style={{ color: '#6366f1' }} />
        <h1 style={{ fontSize: '20px', fontWeight: 800 }}>Promover a Admin</h1>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '28px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Email del usuario
            </label>
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="usuario@email.com" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Código de admin
            </label>
            <input style={inputStyle} type="password" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="••••••••" />
          </div>

          {error  && <p style={{ color: '#ef4444', fontSize: '13px', background: 'rgba(239,68,68,0.08)', padding: '10px 14px', borderRadius: '8px' }}>{error}</p>}
          {result && <p style={{ color: '#22c55e', fontSize: '13px', background: 'rgba(34,197,94,0.08)', padding: '10px 14px', borderRadius: '8px' }}>{result}</p>}

          <button type="submit" disabled={loading} style={{
            padding: '11px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Procesando...' : 'Promover a admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
