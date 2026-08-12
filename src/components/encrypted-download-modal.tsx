'use client';

import { useState, useRef } from 'react';
import { Download, Eye, EyeOff, Lock } from '@/components/ui/icons';

interface Props {
  open:       boolean;
  onClose:    () => void;
  /** Llama a la API con la contraseña y devuelve el blob HTML para descargar */
  onDownload: (password: string) => Promise<{ blob: Blob; filename: string } | null>;
  title?:     string;
}

export function EncryptedDownloadModal({ open, onClose, onDownload, title = 'Descargar cifrado' }: Props) {
  const [pw, setPw]         = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const inputRef            = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setPw(''); setConfirm(''); setShow(false); setBusy(false); setError('');
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (pw.length < 6) { setError('La clave debe tener al menos 6 caracteres.'); return; }
    if (pw !== confirm) { setError('Las claves no coinciden.'); return; }
    setError(''); setBusy(true);
    try {
      const result = await onDownload(pw);
      if (!result) { setError('No se pudo generar el archivo.'); setBusy(false); return; }
      const url = URL.createObjectURL(result.blob);
      const a   = document.createElement('a');
      a.href = url; a.download = result.filename; a.click();
      URL.revokeObjectURL(url);
      handleClose();
    } catch {
      setError('Error al generar el archivo.');
      setBusy(false);
    }
  }

  const valid = pw.length >= 6 && pw === confirm;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Lock size={18} style={{ color: 'var(--brand-primary, #6366f1)' }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 24, lineHeight: 1.5 }}>
          El archivo se descarga encriptado con <strong>AES-256-GCM</strong>. Solo quien tenga la clave puede abrirlo — guárdala bien.
        </p>

        {/* Password */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--muted-foreground)' }}>
          Clave de cifrado
        </label>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            ref={inputRef}
            type={show ? 'text' : 'password'}
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            disabled={busy}
            style={{ width: '100%', padding: '10px 40px 10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 14, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter' && valid) void handleSubmit(); }}
          />
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0 }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Confirm */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--muted-foreground)' }}>
          Confirmar clave
        </label>
        <input
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Repite la clave"
          disabled={busy}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${confirm && pw !== confirm ? '#ef4444' : 'var(--border)'}`, background: 'var(--background)', color: 'var(--foreground)', fontSize: 14, outline: 'none', marginBottom: 16 }}
          onKeyDown={e => { if (e.key === 'Enter' && valid) void handleSubmit(); }}
        />

        {/* Hint */}
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 16, background: 'var(--muted)', padding: '8px 12px', borderRadius: 8, lineHeight: 1.5 }}>
          ⚠️ Si pierdes la clave, el archivo no podrá abrirse. No la almacenamos.
        </p>

        {error && (
          <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{error}</p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: 14, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!valid || busy}
            style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: valid && !busy ? 'var(--brand-primary, #6366f1)' : 'var(--muted)', color: valid && !busy ? '#fff' : 'var(--muted-foreground)', fontSize: 14, fontWeight: 600, cursor: valid && !busy ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {busy ? 'Generando…' : <><Download size={14} /> Descargar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
