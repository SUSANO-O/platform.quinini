'use client';

import { useState, type ReactNode } from 'react';
import { Eye, Monitor, Smartphone } from 'lucide-react';

export function WidgetBuilderPreviewPanel({
  children,
  mobilePreviewOpen,
  onMobilePreviewOpenChange,
}: {
  children: ReactNode;
  mobilePreviewOpen?: boolean;
  onMobilePreviewOpenChange?: (open: boolean) => void;
}) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const controlled = onMobilePreviewOpenChange !== undefined;
  const sheetOpen = controlled ? Boolean(mobilePreviewOpen) : false;

  return (
    <>
      <aside className="widget-builder-preview hidden xl:flex xl:flex-col">
        <p className="widget-builder-preview__label">Vista previa</p>
        <div
          className={`widget-builder-preview__frame${
            viewport === 'mobile' ? ' widget-builder-preview__frame--mobile' : ''
          }`}
        >
          <div className="widget-builder-preview__browser-bar" aria-hidden>
            <span className="widget-builder-preview__dot widget-builder-preview__dot--red" />
            <span className="widget-builder-preview__dot widget-builder-preview__dot--yellow" />
            <span className="widget-builder-preview__dot widget-builder-preview__dot--green" />
            <span className="widget-builder-preview__url">tusitio.com</span>
          </div>
          <div className="widget-builder-preview__canvas">{children}</div>
        </div>
        <div className="widget-builder-preview__viewport-toggle" role="group" aria-label="Modo de vista previa">
          <button
            type="button"
            className={viewport === 'desktop' ? 'is-active' : ''}
            onClick={() => setViewport('desktop')}
            title="Vista escritorio"
          >
            <Monitor size={16} aria-hidden />
          </button>
          <button
            type="button"
            className={viewport === 'mobile' ? 'is-active' : ''}
            onClick={() => setViewport('mobile')}
            title="Vista móvil"
          >
            <Smartphone size={16} aria-hidden />
          </button>
        </div>
        ) : null}
      </aside>

      {controlled ? (
        <>
          <button
            type="button"
            className="widget-builder-preview-fab xl:hidden"
            onClick={() => onMobilePreviewOpenChange(true)}
          >
            <Eye size={16} aria-hidden />
            Vista previa
          </button>
          {sheetOpen ? (
            <>
              <button
                type="button"
                className="widget-builder-preview-sheet__backdrop xl:hidden"
                aria-label="Cerrar vista previa"
                onClick={() => onMobilePreviewOpenChange(false)}
              />
              <div className="widget-builder-preview-sheet xl:hidden" role="dialog" aria-label="Vista previa">
                <div className="widget-builder-preview-sheet__head">
                  <span className="widget-builder-preview__label m-0">Vista previa</span>
                  <button type="button" onClick={() => onMobilePreviewOpenChange(false)}>
                    Cerrar
                  </button>
                </div>
                <div className="widget-builder-preview__frame widget-builder-preview__frame--mobile">
                  <div className="widget-builder-preview__browser-bar" aria-hidden>
                    <span className="widget-builder-preview__dot widget-builder-preview__dot--red" />
                    <span className="widget-builder-preview__dot widget-builder-preview__dot--yellow" />
                    <span className="widget-builder-preview__dot widget-builder-preview__dot--green" />
                  </div>
                  <div className="widget-builder-preview__canvas">{children}</div>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
