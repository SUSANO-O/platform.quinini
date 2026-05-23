'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Copy, Check, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { BRAND_TEXT_COLOR, UI_SURFACE_SECONDARY } from '@/lib/brand';

import { uploadRagFileToAgent } from '@/lib/rag-upload-client';

const MAX_PDF_MB = 10;
const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

type QuickStartResult = {
  agentId: string;
  widgetId: string;
  afhubToken: string;
  agentName: string;
  widgetName: string;
  snippet: string;
  filesIngested: number;
  hubSynced?: boolean;
  shortcutsCount?: number;
  ingestWarnings?: string[];
};

export default function QuickStartPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickStartResult | null>(null);
  const [copied, setCopied] = useState(false);

  const onFiles = useCallback((list: FileList | File[]) => {
    const pdfs = Array.from(list).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (!pdfs.length) {
      toast.error('Solo se aceptan archivos PDF.');
      return;
    }
    const tooLarge = pdfs.find((f) => f.size > MAX_PDF_BYTES);
    if (tooLarge) {
      toast.error(`${tooLarge.name} supera ${MAX_PDF_MB} MB. Comprime el PDF o divide el contenido.`);
      return;
    }
    setFiles(pdfs.slice(0, 3));
    setResult(null);
  }, []);

  async function handleSubmit() {
    if (!files.length || loading) return;
    setLoading(true);
    const ingestWarnings: string[] = [];
    try {
      const initRes = await fetch('/api/quick-start/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.name, size: f.size })),
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) {
        toast.error(typeof initData.error === 'string' ? initData.error : 'Error al iniciar Quick Start.');
        return;
      }

      const agentId = initData.agentId as string;
      for (const file of files) {
        const upload = await uploadRagFileToAgent(agentId, file, {
          deferSync: true,
          onStatus: (msg) => toast.message(msg),
        });
        if (!upload.ok) {
          toast.error(`${file.name}: ${upload.error ?? 'Error al subir el PDF.'}`);
          return;
        }
        if (typeof upload.message === 'string' && upload.message.includes('aviso')) {
          ingestWarnings.push(upload.message);
        }
      }

      const finalizeRes = await fetch('/api/quick-start/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data = await finalizeRes.json();
      if (!finalizeRes.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Error al finalizar Quick Start.');
        return;
      }

      setResult({
        agentId,
        widgetId: data.widgetId,
        afhubToken: data.afhubToken,
        agentName: initData.agentName,
        widgetName: data.widgetName,
        snippet: data.snippet,
        filesIngested: data.filesIngested,
        hubSynced: data.hubSynced !== false,
        shortcutsCount: typeof data.shortcutsCount === 'number' ? data.shortcutsCount : 0,
        ingestWarnings,
      });
      toast.success('¡Widget listo! Copia el snippet e instálalo en tu web.');
      if (typeof data.shortcutsCount === 'number' && data.shortcutsCount > 0) {
        toast.info(`${data.shortcutsCount} accesos rápidos generados según tu documentación.`, { duration: 5000 });
      }
      if (data.hubSynced === false) {
        toast.warning(
          'El agente no se sincronizó con el motor de IA. El chat puede fallar hasta que arranques AgentFlowhub/AIBackHub o reintentes la sync.',
          { duration: 8000 },
        );
      }
      ingestWarnings.forEach((w) => toast.message(w));
    } catch {
      toast.error('Error de red. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function copySnippet() {
    if (!result?.snippet) return;
    await navigator.clipboard.writeText(result.snippet);
    setCopied(true);
    toast.success('Snippet copiado');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 48px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Sparkles size={22} style={{ color: BRAND_TEXT_COLOR }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Quick Start</h1>
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>
          Sube hasta 3 PDFs y obtén un widget listo para embeber en menos de 2 minutos.
          Creamos el agente con RAG y un widget con la configuración por defecto.
        </p>
      </div>

      {!result ? (
        <>
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById('qs-file-input')?.click()}
            onKeyDown={(e) => e.key === 'Enter' && document.getElementById('qs-file-input')?.click()}
            style={{
              border: `2px dashed ${dragOver ? BRAND_TEXT_COLOR : 'var(--border)'}`,
              borderRadius: 16,
              padding: '40px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'rgba(var(--brand-primary-rgb),0.05)' : 'var(--card)',
              marginBottom: 16,
            }}
          >
            <input
              id="qs-file-input"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => e.target.files && onFiles(e.target.files)}
            />
            <Upload size={32} style={{ color: dragOver ? BRAND_TEXT_COLOR : 'var(--muted-foreground)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>
              Arrastra 1–3 PDFs o haz clic para seleccionar
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
              Máx. {MAX_PDF_MB} MB por PDF · Hasta 3 archivos · PDFs grandes se comprimen o se extrae solo el texto
            </p>
          </div>

          {files.length > 0 && (
            <div style={{ ...UI_SURFACE_SECONDARY, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 10px', color: 'var(--muted-foreground)' }}>
                {files.length} archivo{files.length !== 1 ? 's' : ''} seleccionado{files.length !== 1 ? 's' : ''}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {files.map((f) => (
                  <li key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                    <FileText size={14} style={{ color: BRAND_TEXT_COLOR, flexShrink: 0 }} />
                    {f.name}
                    <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
                      ({(f.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            disabled={!files.length || loading}
            onClick={handleSubmit}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 12,
              border: 'none',
              background: !files.length || loading ? 'var(--muted)' : BRAND_TEXT_COLOR,
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              cursor: !files.length || loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Creando agente y widget…
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Crear widget en 1 clic
              </>
            )}
          </button>
        </>
      ) : (
        <div style={{ ...UI_SURFACE_SECONDARY, borderRadius: 16, padding: '24px 20px' }}>
          <p style={{ fontWeight: 800, fontSize: 16, margin: '0 0 6px', color: '#22c55e' }}>
            ¡Listo! Tu widget está activo
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 16px' }}>
            {result.agentName} · {result.filesIngested} PDF{result.filesIngested !== 1 ? 's' : ''} indexado{result.filesIngested !== 1 ? 's' : ''}
            {(result.shortcutsCount ?? 0) > 0 && (
              <> · {result.shortcutsCount} acceso{(result.shortcutsCount ?? 0) !== 1 ? 's' : ''} rápido{(result.shortcutsCount ?? 0) !== 1 ? 's' : ''}</>
            )}
          </p>

          {result.hubSynced === false && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #f59e0b',
                background: 'rgba(245, 158, 11, 0.08)',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--foreground)',
              }}
            >
              El agente no se sincronizó con el motor de IA. El chat fallará hasta que arranques{' '}
              <strong>AgentFlowhub</strong> (puerto <strong>9002</strong>) y <strong>AIBackHub</strong>, y revises{' '}
              <code style={{ fontSize: 11 }}>AGENTFLOWHUB_URL=http://127.0.0.1:9002</code> en tu <code>.env</code>.
            </div>
          )}

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 8 }}>
            SNIPPET PARA TU WEB
          </label>
          <pre
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '14px 12px',
              fontSize: 11,
              lineHeight: 1.5,
              overflow: 'auto',
              margin: '0 0 12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {result.snippet}
          </pre>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={copySnippet}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: BRAND_TEXT_COLOR,
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copiado' : 'Copiar snippet'}
            </button>
            <Link
              href={`/dashboard/widget-preview?id=${result.widgetId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={15} />
              Probar widget
            </Link>
            <Link
              href={`/dashboard/agents/${result.agentId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Ver agente
            </Link>
          </div>

          <button
            type="button"
            onClick={() => { setResult(null); setFiles([]); }}
            style={{
              marginTop: 16,
              background: 'none',
              border: 'none',
              color: 'var(--muted-foreground)',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Crear otro widget
          </button>
        </div>
      )}
    </div>
  );
}
