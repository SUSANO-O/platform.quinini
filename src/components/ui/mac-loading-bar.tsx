'use client';

/**
 * Barra de carga estilo macOS (pill con relleno graphite que progresa).
 * Pensada para mostrarse mientras se autentica/carga el dashboard tras el login.
 */

export function MacLoadingBar({ label }: { label?: string }) {
  return (
    <div style={{ width: '100%' }} role="progressbar" aria-busy="true" aria-label={label || 'Cargando'}>
      <div className="mac-loading-bar__track">
        <div className="mac-loading-bar__fill" />
      </div>
      {label && (
        <p
          style={{
            textAlign: 'center',
            fontSize: 12.5,
            marginTop: 10,
            color: 'var(--muted-foreground)',
            letterSpacing: 0.2,
          }}
        >
          {label}
        </p>
      )}
      <style>{`
        .mac-loading-bar__track{
          height:6px;width:100%;border-radius:999px;overflow:hidden;
          background:rgba(0,0,0,0.08);
          box-shadow:inset 0 0 0 1px rgba(0,0,0,0.06);
        }
        .mac-loading-bar__fill{
          height:100%;border-radius:999px;width:4%;
          background:linear-gradient(90deg,#b9bcc2,#6b6f76 60%,#595d63);
          box-shadow:0 0 6px rgba(90,94,100,0.35);
          animation:macLoadingFill 2.6s cubic-bezier(.22,.8,.26,1) forwards;
        }
        @keyframes macLoadingFill{
          0%{width:4%}
          55%{width:68%}
          100%{width:93%}
        }
        @media (prefers-color-scheme: dark){
          :root:not([data-theme="light"]) .mac-loading-bar__track{background:rgba(255,255,255,0.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08);}
          :root:not([data-theme="light"]) .mac-loading-bar__fill{background:linear-gradient(90deg,#e6e7ea,#b7bbc1 60%,#9aa0a6);}
        }
      `}</style>
    </div>
  );
}
