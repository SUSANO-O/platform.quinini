'use client';

import { useEffect, useMemo, useState } from 'react';
import { Joyride, EVENTS, STATUS } from 'react-joyride';
import { usePathname } from 'next/navigation';
import { useSubscription } from '@/hooks/use-subscription';

const TOUR_STORAGE_KEY = 'afhub_trial_tours_v1';

type TourMap = Record<string, boolean>;

function readTourState(): TourMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TourMap;
  } catch {
    return {};
  }
}

function writeTourState(state: TourMap) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
}

function getTourForPath(pathname: string): { id: string; steps: any[] } | null {
  const withTooltip = (
    target: string,
    content: string,
    extra?: Record<string, unknown>
  ) => ({
    target,
    content,
    skipBeacon: true,
    showProgress: true,
    placement: 'auto',
    ...extra,
  });
  if (pathname === '/dashboard') {
    return {
      id: 'dashboard-home',
      steps: [
        withTooltip('[data-tour="dashboard-quick-actions"]', 'Estos accesos rapidos te llevan al flujo principal del trial.'),
        withTooltip('[data-tour="dashboard-upgrade"]', 'Aqui puedes revisar o mejorar tu plan cuando lo necesites.'),
      ],
    };
  }
  if (pathname === '/dashboard/agents/new') {
    return {
      id: 'agents-new',
      steps: [
        withTooltip('[data-tour="agent-name"]', 'Empieza por definir el nombre y la descripcion del agente.'),
        withTooltip('[data-tour="agent-model"]', 'Elige un modelo. Puedes buscar por nombre, proveedor o capacidad.'),
        withTooltip(
          '[data-tour="agent-create-submit"]',
          'Cuando todo este listo, crea el agente para continuar con widgets.',
          { placement: 'top', isFixed: true }
        ),
      ],
    };
  }
  if (pathname.startsWith('/dashboard/agents/')) {
    return {
      id: 'agents-edit',
      steps: [
        withTooltip('[data-tour="agent-edit-model"]', 'Aqui puedes ajustar el modelo del agente segun tu caso de uso.'),
        withTooltip('[data-tour="agent-edit-save"]', 'Guarda cambios para aplicar configuracion de modelo y prompt.'),
      ],
    };
  }
  if (pathname === '/dashboard/widget-builder') {
    return {
      id: 'widget-builder',
      steps: [
        withTooltip('[data-tour="widget-builder-header"]', 'Este es el constructor visual de tu widget.'),
        withTooltip('[data-tour="widget-builder-save"]', 'Guarda el widget para poder usarlo en tu sitio.'),
        withTooltip('[data-tour="widget-builder-copy"]', 'Copia el snippet e insertalo en tu web para activarlo.'),
      ],
    };
  }
  if (pathname === '/dashboard/widgets') {
    return {
      id: 'widgets-list',
      steps: [
        withTooltip('[data-tour="widgets-new"]', 'Desde aqui creas widgets adicionales para otros agentes o sitios.'),
        withTooltip('[data-tour="widgets-list"]', 'Administra, edita y elimina tus widgets ya creados.'),
      ],
    };
  }
  if (pathname === '/dashboard/settings') {
    return {
      id: 'settings',
      steps: [
        withTooltip('[data-tour="settings-account"]', 'Actualiza nombre, email y ajustes basicos de tu cuenta.'),
        withTooltip('[data-tour="settings-billing"]', 'Gestiona suscripcion, metodo de pago y estado del trial.'),
      ],
    };
  }
  return null;
}

export function TrialOnboarding() {
  const pathname = usePathname();
  const { isTrialActive } = useSubscription();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [completedTours, setCompletedTours] = useState<TourMap>({});
  const [hasShownTooltip, setHasShownTooltip] = useState(false);
  const [forceTour, setForceTour] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldReset = params.get('tour') === 'reset';
    const shouldForce = params.get('tour') === '1';
    if (shouldReset) {
      writeTourState({});
      setCompletedTours({});
    } else {
      setCompletedTours(readTourState());
    }
    setForceTour(shouldForce || shouldReset);
  }, []);

  const tourConfig = useMemo(() => getTourForPath(pathname), [pathname]);

  useEffect(() => {
    if ((!isTrialActive && !forceTour) || !tourConfig) {
      setRun(false);
      return;
    }
    if (!forceTour && completedTours[tourConfig.id]) {
      setRun(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setHasShownTooltip(false);
      setRun(true);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [isTrialActive, forceTour, tourConfig, completedTours]);

  const onCallback = (data: any) => {
    if (data.type === EVENTS.TOOLTIP) {
      setHasShownTooltip(true);
    }
    if (data.type === EVENTS.STEP_AFTER || data.type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(data.index + (data.action === 'prev' ? -1 : 1));
    }

    if (!tourConfig) return;
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      // Evita marcar "completado" si nunca se mostró un tooltip (p.ej. target ausente).
      if (hasShownTooltip) {
        const next = { ...completedTours, [tourConfig.id]: true };
        setCompletedTours(next);
        writeTourState(next);
      }
      setRun(false);
    }
  };

  if (!tourConfig || !tourConfig.steps.length) return null;

  return (
    <Joyride
      run={run}
      stepIndex={stepIndex}
      steps={tourConfig.steps}
      continuous
      options={{
        zIndex: 12000,
        overlayColor: 'rgba(15, 23, 42, 0.42)',
        primaryColor: '#e41414',
        spotlightPadding: 6,
      }}
      onEvent={onCallback}
      locale={{
        back: 'Atras',
        close: 'Cerrar',
        last: 'Finalizar',
        next: 'Siguiente',
        skip: 'Omitir',
      }}
    />
  );
}
