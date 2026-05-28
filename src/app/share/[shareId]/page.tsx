'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock } from 'lucide-react';

export default function ShareLoginPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const router       = useRouter();
  const inputRef     = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState('');
  const [show, setShow]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit() {
    if (!password.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/share/${shareId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Contraseña incorrecta.');
        setBusy(false);
        inputRef.current?.select();
        return;
      }
      router.push(`/share/${shareId}/chat`);
    } catch {
      setError('Error de red. Intenta de nuevo.');
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'rgba(30,27,75,0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 20,
        padding: '40px 36px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <Lock size={26} color="#a5b4fc" />
        </div>

        <h1 style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
          Agente compartido
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>
          Ingresa la contraseña que te compartieron para acceder al chat.
        </p>

        {/* Password input */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input
            ref={inputRef}
            type={show ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSubmit(); }}
            placeholder="Contraseña de acceso"
            autoFocus
            disabled={busy}
            style={{
              width: '100%',
              padding: '13px 44px 13px 16px',
              background: 'rgba(15,23,42,0.8)',
              border: `1px solid ${error ? 'rgba(248,113,113,0.6)' : 'rgba(99,102,241,0.3)'}`,
              borderRadius: 12,
              color: '#e2e8f0',
              fontSize: 15,
              outline: 'none',
              letterSpacing: '0.05em',
            }}
          />
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748b', padding: 4,
            }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && (
          <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 14px' }}>{error}</p>
        )}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={busy || !password.trim()}
          style={{
            width: '100%',
            padding: '13px',
            background: busy || !password.trim()
              ? 'rgba(99,102,241,0.3)'
              : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none',
            borderRadius: 12,
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: busy || !password.trim() ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {busy ? 'Verificando…' : 'Entrar al chat →'}
        </button>
      </div>
    </div>
  );
}
