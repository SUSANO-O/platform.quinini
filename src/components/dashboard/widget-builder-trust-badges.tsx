import { Shield, Zap } from '@/components/ui/icons';

export function WidgetBuilderTrustBadges() {
  return (
    <div className="widget-builder-trust-badges">
      <span className="widget-builder-trust-badges__item">
        <Shield size={14} aria-hidden />
        Seguridad total
      </span>
      <span className="widget-builder-trust-badges__item">
        <Zap size={14} aria-hidden />
        Carga ultra rápida
      </span>
    </div>
  );
}
