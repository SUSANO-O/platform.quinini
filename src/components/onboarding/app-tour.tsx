'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';

const JOURNEY_STORAGE_KEY = 'afhub_onboarding_journey_v2';
const LEGACY_TOUR_STORAGE_KEY = 'afhub_trial_tours_v1';
const INTERACTIVE_RESUME_KEY = 'afhub_tour_resume_v1';
/** Flujo guiado inicio ↔ agentes (reanudación del paso con clic en el menú). */
const INICIO_AGENTS_FLOW_KEY = 'afhub_inicio_agents_flow_v1';
/** Si se borró el camino antes de tener sesión, completar DELETE en servidor al iniciar sesión. */
const PENDING_SERVER_JOURNEY_CLEAR_KEY = 'afhub_pending_journey_server_clear';

function requestServerJourneyClearWhenAuthed() {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(PENDING_SERVER_JOURNEY_CLEAR_KEY, '1');
    }
  } catch {
    /* noop */
  }
}

async function flushPendingServerJourneyClear(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage.getItem(PENDING_SERVER_JOURNEY_CLEAR_KEY) !== '1') return;
    const r = await fetch('/api/user/onboarding-journey', { method: 'DELETE', credentials: 'include' });
    if (r.ok) window.sessionStorage.removeItem(PENDING_SERVER_JOURNEY_CLEAR_KEY);
  } catch {
    /* noop */
  }
}

export const JOURNEY_STAGE_IDS = [
  'inicio',
  'crear-agente',
  'mis-agentes',
  'mcp',
  'widget-builder',
  'mis-widgets',
  'ajustes',
] as const;

export type JourneyStageId = (typeof JOURNEY_STAGE_IDS)[number];

type JourneyStateV2 = {
  v: 2;
  done: Partial<Record<JourneyStageId, boolean>>;
};

type TourResumeV1 = {
  v: 1;
  stage: JourneyStageId;
  /** Paso del array `steps` en el que reanudar tras la navegación */
  stepIndex: number;
  /** `pathname` esperado para ese paso */
  route: string;
};

type AfhubStepMeta = {
  advance: 'next' | 'click';
  /** Si el clic navega a otra ruta, reanudar aquí */
  resume?: { route: string; stepIndex: number };
  /**
   * Botones del popover en driver.js. En pasos `advance: 'click'` hay que **excluir «next»**:
   * si no, driver vuelve a poner «Siguiente» visible y contradice el texto del paso.
   */
  driverShowButtons?: ('next' | 'previous' | 'close')[];
};

export type AfhubDriveStep = DriveStep & { afhubMeta?: AfhubStepMeta };

interface TourContextValue {
  startTour: () => void;
  resetJourney: () => void;
  journeyComplete: boolean;
  journeyPercent: number;
  completedCount: number;
  totalStages: number;
  currentStage: JourneyStageId | null;
  currentStageLabel: string | null;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

const STAGE_META: Record<
  JourneyStageId,
  { label: string; path: string; match: (pathname: string) => boolean; sidebarTour: string }
> = {
  inicio: {
    label: 'Inicio',
    path: '/dashboard',
    match: (p) => p === '/dashboard',
    sidebarTour: 'sidebar-inicio',
  },
  'crear-agente': {
    label: 'Crear agente',
    path: '/dashboard/agents/new',
    match: (p) => p === '/dashboard/agents/new',
    sidebarTour: 'sidebar-agentes',
  },
  'mis-agentes': {
    label: 'Mis agentes',
    path: '/dashboard/agents',
    match: (p) => p === '/dashboard/agents',
    sidebarTour: 'sidebar-agentes',
  },
  mcp: {
    label: 'Integraciones MCP',
    path: '/dashboard/mcp',
    match: (p) => p === '/dashboard/mcp',
    sidebarTour: 'sidebar-mcp',
  },
  'widget-builder': {
    label: 'Widget Builder',
    path: '/dashboard/widget-builder',
    match: (p) => p === '/dashboard/widget-builder',
    sidebarTour: 'sidebar-widget-builder',
  },
  'mis-widgets': {
    label: 'Mis widgets',
    path: '/dashboard/widgets',
    match: (p) => p === '/dashboard/widgets',
    sidebarTour: 'sidebar-widgets',
  },
  ajustes: {
    label: 'Ajustes',
    path: '/dashboard/settings',
    match: (p) => p === '/dashboard/settings',
    sidebarTour: 'sidebar-ajustes',
  },
};

function readTourResume(): TourResumeV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(INTERACTIVE_RESUME_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as TourResumeV1;
    if (p?.v === 1 && p.stage && typeof p.stepIndex === 'number' && typeof p.route === 'string') {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeTourResume(payload: TourResumeV1) {
  window.sessionStorage.setItem(INTERACTIVE_RESUME_KEY, JSON.stringify(payload));
}

function clearTourResume() {
  try {
    window.sessionStorage.removeItem(INTERACTIVE_RESUME_KEY);
  } catch {
    /* noop */
  }
}

function setInicioAgentsFlow(active: boolean) {
  try {
    if (active) window.localStorage.setItem(INICIO_AGENTS_FLOW_KEY, '1');
    else window.localStorage.removeItem(INICIO_AGENTS_FLOW_KEY);
  } catch {
    /* noop */
  }
}

function readJourneyState(): JourneyStateV2 {
  if (typeof window === 'undefined') return { v: 2, done: {} };
  try {
    const raw = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (!raw) return { v: 2, done: {} };
    const parsed = JSON.parse(raw) as JourneyStateV2;
    if (parsed && parsed.v === 2 && parsed.done && typeof parsed.done === 'object') {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { v: 2, done: {} };
}

function writeJourneyState(state: JourneyStateV2) {
  window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(state));
}

/** Une progreso local y remoto sin perder etapas marcadas en ninguno de los dos lados. */
function mergeJourneyDone(
  local: Partial<Record<JourneyStageId, boolean>>,
  remote: Partial<Record<JourneyStageId, boolean>>,
): Partial<Record<JourneyStageId, boolean>> {
  const out: Partial<Record<JourneyStageId, boolean>> = { ...local };
  for (const id of JOURNEY_STAGE_IDS) {
    if (remote[id]) out[id] = true;
  }
  return out;
}

function markStageDone(id: JourneyStageId) {
  const cur = readJourneyState();
  writeJourneyState({ v: 2, done: { ...cur.done, [id]: true } });
}

function firstIncompleteStage(state: JourneyStateV2): JourneyStageId | null {
  for (const id of JOURNEY_STAGE_IDS) {
    if (!state.done[id]) return id;
  }
  return null;
}

export type TourCountsState = {
  loaded: boolean;
  hasAgents: boolean;
  hasWidgets: boolean;
};

/**
 * Marca como hechas (en orden) todas las etapas hasta la que corresponde a la URL actual.
 * Así el % del camino sube al explorar el panel, sin redirecciones ni obligar a abrir el driver.
 */
function markStagesReachedByPath(pathname: string): boolean {
  const ix = JOURNEY_STAGE_IDS.findIndex((id) => STAGE_META[id].match(pathname));
  if (ix === -1) return false;
  const state = readJourneyState();
  const nextDone = { ...state.done };
  let changed = false;
  for (let i = 0; i <= ix; i++) {
    const id = JOURNEY_STAGE_IDS[i];
    if (!nextDone[id]) {
      nextDone[id] = true;
      changed = true;
    }
  }
  if (changed) {
    writeJourneyState({ v: 2, done: nextDone });
  }
  return changed;
}

/** Siempre incluir `close`: driver.js fusiona el popover del paso al final y puede ocultar la X si falta aquí. */
const AFHUB_DRIVER_POPOVER_BUTTONS = ['next', 'previous', 'close'] as const;

function mk(
  element: string,
  title: string,
  description: string,
  side: 'top' | 'right' | 'bottom' | 'left' = 'bottom',
  align: 'start' | 'center' | 'end' = 'center',
  meta?: AfhubStepMeta,
): AfhubDriveStep {
  const popoverShowButtons: ('next' | 'previous' | 'close')[] =
    meta?.driverShowButtons != null
      ? [...meta.driverShowButtons]
      : meta?.advance === 'click'
        ? ['previous', 'close']
        : [...AFHUB_DRIVER_POPOVER_BUTTONS];
  return {
    element,
    popover: {
      title,
      description,
      side,
      align,
      showButtons: popoverShowButtons,
    },
    ...(meta ? { afhubMeta: meta } : {}),
  };
}

const s = (sel: string) => `[data-tour="${sel}"]`;

/** Pasos del builder (sin intro de sidebar); reutilizado en etapa `widget-builder` y en `mis-widgets` vacío. */
function buildWidgetBuilderFormSteps(): AfhubDriveStep[] {
  return [
    mk(s('widget-builder-header'), 'Resumen', 'Título del builder y descripción. El panel izquierdo es la configuración; a la derecha, preview y snippet.', 'bottom', 'start'),
    mk(s('widget-builder-name'), 'Nombre del widget', 'Identifica este widget en tu lista (Mis widgets).', 'bottom', 'start'),
    mk(s('widget-builder-agent'), 'Agente vinculado', 'El chat usará este agente. El ID es el de la landing (ObjectId o slug según corresponda).', 'bottom', 'start'),
    mk(s('widget-builder-branding'), 'Color y tema', 'Color de acento y modo claro u oscuro; se reflejan al instante en la vista previa.', 'bottom', 'start'),
    mk(s('widget-builder-chat-texts'), 'Textos del chat', 'Título, subtítulo, bienvenida y hint del FAB que ve el visitante.', 'bottom', 'start'),
    mk(s('widget-builder-support'), 'WhatsApp opcional', 'Si configuras número, el visitante puede pedir atención humana y ver el acceso a WhatsApp.', 'bottom', 'start'),
    mk(s('widget-builder-look'), 'Avatar y bordes', 'URL del avatar en cabecera/FAB y radio de esquinas del widget.', 'bottom', 'start'),
    mk(s('widget-builder-position'), 'Posición en pantalla', 'Esquina o borde donde aparece el botón flotante del chat.', 'bottom', 'start'),
    mk(s('widget-builder-embed-options'), 'Comportamiento del embed', 'Abrir al cargar la página y si el snippet incluye el token de widget.', 'bottom', 'start'),
    mk(s('widget-builder-preview'), 'Vista previa', 'Prueba el FAB y el chat con la configuración actual sin publicar.', 'left', 'start'),
    mk(s('widget-builder-snippet-panel'), 'Código incrustable', 'HTML generado según tu config; revisa antes de copiar o guardar.', 'left', 'start'),
    mk(s('widget-builder-save'), 'Guardar widget', 'Persiste en el servidor; si es nuevo, obtendrás token y podrás seguir editando.', 'top', 'center'),
    mk(s('widget-builder-copy'), 'Copiar código', 'Lleva el snippet al portapapeles para pegarlo en tu web.', 'top', 'center'),
  ];
}

function journeyStepsFor(stage: JourneyStageId, counts: TourCountsState): AfhubDriveStep[] {
  const intro = (title: string, description: string): AfhubDriveStep =>
    mk(s(STAGE_META[stage].sidebarTour), title, description, 'right', 'start');
  const c = counts.loaded ? counts : { loaded: false, hasAgents: true, hasWidgets: true };

  switch (stage) {
    case 'inicio':
      return [
        mk(
          s('sidebar-agentes'),
          'Abrir Mis Agentes',
          'En este paso <strong>no uses «Siguiente»</strong> (está oculto): en el menú lateral pulsa <strong>Mis Agentes</strong>; el enlace mostrará un pulso hasta que navegues.',
          'right',
          'start',
          {
            advance: 'click',
            resume: { route: '/dashboard/agents', stepIndex: 1 },
            driverShowButtons: ['close'],
          },
        ),
        mk(
          s('agents-list'),
          'Tu lista de agentes',
          'Aquí aparecen los agentes que crees. Puedes seguir con «Siguiente».',
          'top',
          'start',
        ),
        mk(
          s('sidebar-inicio'),
          'Volver al inicio',
          'Igual que antes: <strong>sin «Siguiente»</strong>. Pulsa <strong>Inicio</strong> en el menú lateral para volver al panel y seguir el recorrido.',
          'right',
          'start',
          {
            advance: 'click',
            resume: { route: '/dashboard', stepIndex: 3 },
            driverShowButtons: ['previous', 'close'],
          },
        ),
        mk(
          s('dashboard-quick-actions'),
          'Accesos rápidos',
          'Desde el inicio tienes atajos al flujo principal del trial.',
          'bottom',
          'center',
        ),
        mk(
          s('dashboard-upgrade'),
          'Plan y upgrade',
          'Aquí revisas o mejoras tu plan cuando lo necesites.',
          'top',
          'center',
        ),
      ];
    case 'crear-agente':
      return [
        intro('Crear tu primer agente', 'Sigues en Mis agentes: ahora damos de alta un agente antes de gestionar la lista.'),
        mk(s('agent-name'), 'Datos básicos', 'Define nombre y descripción; ayudan a identificar el agente en el panel.', 'bottom', 'start'),
        mk(s('agent-model'), 'Modelo de IA', 'Elige un modelo; puedes buscar por nombre, proveedor o capacidad.', 'top', 'start'),
        mk(s('agent-create-submit'), 'Crear agente', 'Cuando esté listo, crea el agente para seguir con widgets e integraciones.', 'top', 'center'),
      ];
    case 'mis-agentes':
      if (c.loaded && !c.hasAgents) {
        return [
          intro(
            'Crear tu primer agente',
            'Aún no tienes agentes en la cuenta. Este paso del roadmap te lleva al alta: nombre, modelo y crear.',
          ),
          mk(s('agent-name'), 'Datos básicos', 'Define nombre y descripción del agente.', 'bottom', 'start'),
          mk(s('agent-model'), 'Modelo de IA', 'Elige un modelo; puedes buscar por nombre, proveedor o capacidad.', 'top', 'start'),
          mk(s('agent-create-submit'), 'Crear agente', 'Cuando esté listo, créalo para seguir con widgets e integraciones.', 'top', 'center'),
        ];
      }
      return [
        intro('Mis agentes', 'Aquí administras la lista, estados y accesos a edición.'),
        mk(s('agents-new'), 'Nuevo agente', 'Abre otra ficha de alta si necesitas más agentes.', 'bottom', 'center'),
        mk(s('agents-list'), 'Lista de agentes', 'Gestiona los existentes, edita configuración y revisa el estado de cada uno.', 'top', 'start'),
      ];
    case 'mcp':
      return [
        intro('Integraciones MCP', 'Conecta capacidades externas estándar MCP y mantén credenciales alineadas con el hub.'),
        mk(s('mcp-catalog'), 'Catálogo MCP', 'Explora integraciones disponibles y enlaces al hub para conexiones avanzadas.', 'bottom', 'start'),
      ];
    case 'widget-builder':
      return [
        intro('Widget Builder', 'Recorre el formulario: nombre, agente, apariencia, textos y opciones del embed; luego vista previa y código.'),
        ...buildWidgetBuilderFormSteps(),
      ];
    case 'mis-widgets':
      if (c.loaded && !c.hasWidgets) {
        return [
          intro(
            'Tu primer widget',
            'Aún no hay widgets guardados. Este paso del roadmap abre el builder para crear el primero; el progreso sigue contando esta etapa.',
          ),
          ...buildWidgetBuilderFormSteps(),
        ];
      }
      return [
        intro('Mis widgets', 'Administra los widgets guardados y abre el builder cuando quieras otro diseño.'),
        mk(s('widgets-new'), 'Nuevo widget', 'Abre el builder con un widget nuevo (otro agente u otro sitio).', 'bottom', 'center'),
        mk(s('widgets-list'), 'Gestión de widgets', 'Edita, revisa snippets e interactúa con lo publicado.', 'top', 'start'),
      ];
    case 'ajustes':
      return [
        intro('Ajustes', 'Cierra el recorrido con cuenta y facturación en orden.'),
        mk(s('settings-account'), 'Cuenta', 'Actualiza nombre, email y preferencias básicas.', 'bottom', 'start'),
        mk(s('settings-billing'), 'Suscripción', 'Gestiona facturación, método de pago y estado del trial.', 'top', 'start'),
      ];
    default:
      return [];
  }
}

function toDriverSteps(steps: AfhubDriveStep[]): DriveStep[] {
  return steps.map((step) => {
    const { afhubMeta, ...rest } = step;
    const advance = afhubMeta?.advance ?? 'next';
    if (advance === 'click') {
      return { ...rest, disableActiveInteraction: false };
    }
    return { ...rest };
  });
}

function stepMetas(steps: AfhubDriveStep[]): AfhubStepMeta[] {
  return steps.map((s) => s.afhubMeta ?? { advance: 'next' });
}

/** Tras completar el camino: guía corta solo de la página actual (sin sidebar). */
function postJourneyPageSteps(pathname: string): AfhubDriveStep[] | null {
  if (pathname === '/dashboard') {
    return [
      mk('[data-tour="dashboard-quick-actions"]', 'Accesos rápidos', 'Atajos al flujo principal.', 'bottom', 'center'),
      mk('[data-tour="dashboard-upgrade"]', 'Plan', 'Revisa o mejora tu plan.', 'top', 'center'),
    ];
  }
  if (pathname === '/dashboard/agents/new') {
    return [
      mk('[data-tour="agent-name"]', 'Alta de agente', 'Nombre y descripción.', 'bottom', 'start'),
      mk('[data-tour="agent-model"]', 'Modelo', 'Selección y búsqueda de modelos.', 'top', 'start'),
      mk('[data-tour="agent-create-submit"]', 'Crear', 'Confirma la creación.', 'top', 'center'),
    ];
  }
  if (pathname === '/dashboard/agents') {
    return [
      mk('[data-tour="agents-new"]', 'Nuevo agente', 'Abre el formulario de alta.', 'bottom', 'center'),
      mk('[data-tour="agents-list"]', 'Lista', 'Gestiona agentes existentes.', 'top', 'start'),
    ];
  }
  if (pathname.startsWith('/dashboard/agents/') && pathname !== '/dashboard/agents/new') {
    return [
      mk('[data-tour="agent-edit-model"]', 'Modelo', 'Ajusta el modelo al caso de uso.', 'top', 'start'),
      mk('[data-tour="agent-edit-save"]', 'Guardar', 'Aplica cambios de configuración.', 'top', 'center'),
    ];
  }
  if (pathname === '/dashboard/widget-builder') {
    return [
      mk('[data-tour="widget-builder-header"]', 'Builder', 'Resumen del constructor.', 'bottom', 'start'),
      mk('[data-tour="widget-builder-name"]', 'Nombre', 'Nombre interno del widget.', 'bottom', 'start'),
      mk('[data-tour="widget-builder-agent"]', 'Agente', 'Agente asociado al chat.', 'bottom', 'start'),
      mk('[data-tour="widget-builder-branding"]', 'Marca', 'Color y tema.', 'bottom', 'start'),
      mk('[data-tour="widget-builder-chat-texts"]', 'Textos', 'Título, subtítulo y mensajes.', 'bottom', 'start'),
      mk('[data-tour="widget-builder-preview"]', 'Preview', 'Vista previa en vivo.', 'left', 'start'),
      mk('[data-tour="widget-builder-save"]', 'Guardar', 'Persiste el diseño.', 'top', 'center'),
      mk('[data-tour="widget-builder-copy"]', 'Snippet', 'Copia el script.', 'top', 'center'),
    ];
  }
  if (pathname === '/dashboard/widgets') {
    return [
      mk('[data-tour="widgets-new"]', 'Nuevo widget', 'Crea otro widget.', 'bottom', 'center'),
      mk('[data-tour="widgets-list"]', 'Lista', 'Administra widgets.', 'top', 'start'),
    ];
  }
  if (pathname === '/dashboard/settings') {
    return [
      mk('[data-tour="settings-account"]', 'Cuenta', 'Datos de perfil.', 'bottom', 'start'),
      mk('[data-tour="settings-billing"]', 'Facturación', 'Suscripción y trial.', 'top', 'start'),
    ];
  }
  if (pathname === '/dashboard/mcp') {
    return [mk('[data-tour="mcp-catalog"]', 'MCP', 'Catálogo de integraciones.', 'bottom', 'start')];
  }
  return null;
}

function stepsHaveDomFrom(steps: DriveStep[], startIndex: number): boolean {
  const step = steps[startIndex];
  if (!step || typeof step.element !== 'string') return false;
  return !!document.querySelector(step.element);
}

/** Espera a que el ancla exista (p. ej. tras navegación o fetch) sin bloquear la UI. */
function whenStepsDomReady(
  steps: DriveStep[],
  startIndex: number,
  onReady: () => void,
  opts?: { maxMs?: number; intervalMs?: number; onTimeout?: () => void },
): () => void {
  const maxMs = opts?.maxMs ?? 3200;
  const intervalMs = opts?.intervalMs ?? 48;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let id: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (id !== undefined) clearTimeout(id);
  };

  const tick = () => {
    if (stepsHaveDomFrom(steps, startIndex)) {
      cancel();
      requestAnimationFrame(() => onReady());
      return;
    }
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (elapsed >= maxMs) {
      opts?.onTimeout?.();
      return;
    }
    id = setTimeout(tick, intervalMs);
  };

  tick();
  return cancel;
}

function setTourNavButtonsDisabled(disabled: boolean) {
  document.querySelectorAll('.driver-popover-next-btn, .driver-popover-prev-btn').forEach((n) => {
    if (n instanceof HTMLButtonElement) {
      n.disabled = disabled;
      n.setAttribute('aria-busy', disabled ? 'true' : 'false');
    }
  });
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { isTrialActive } = useSubscription();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const [journeyTick, setJourneyTick] = useState(0);
  const [journeyRemoteReady, setJourneyRemoteReady] = useState(false);
  const metasRef = useRef<AfhubStepMeta[]>([]);
  const stageRef = useRef<JourneyStageId | null>(null);
  const clickCleanupRef = useRef<(() => void) | null>(null);
  const pendingDomWaitCancelRef = useRef<(() => void) | null>(null);
  const pendingStepDomWaitCancelRef = useRef<(() => void) | null>(null);
  const driverStepsRef = useRef<DriveStep[]>([]);
  const driveSessionRef = useRef(0);
  const [tourCounts, setTourCounts] = useState<TourCountsState>({
    loaded: false,
    hasAgents: true,
    hasWidgets: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ra, rw] = await Promise.all([fetch('/api/agents'), fetch('/api/widgets')]);
        const aj = ra.ok ? await ra.json() : {};
        const wj = rw.ok ? await rw.json() : {};
        if (cancelled) return;
        const agents = Array.isArray(aj.agents) ? aj.agents : [];
        const widgets = Array.isArray(wj.widgets) ? wj.widgets : [];
        setTourCounts({
          loaded: true,
          hasAgents: agents.length > 0,
          hasWidgets: widgets.length > 0,
        });
      } catch {
        if (!cancelled) {
          setTourCounts({ loaded: true, hasAgents: true, hasWidgets: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, journeyTick]);

  /** Hidratar progreso desde el servidor (otro dispositivo / pestaña) antes de volver a guardar. */
  useEffect(() => {
    if (authLoading || !user?.uid) {
      setJourneyRemoteReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await flushPendingServerJourneyClear();
        const r = await fetch('/api/user/onboarding-journey', { credentials: 'include' });
        if (!r.ok) {
          if (!cancelled) setJourneyRemoteReady(true);
          return;
        }
        const data = (await r.json()) as {
          journey: {
            v: number;
            done?: Partial<Record<JourneyStageId, boolean>>;
            lastTourResume?: TourResumeV1 | null;
          } | null;
        };
        if (cancelled) return;
        const j = data.journey;
        if (j && j.v === 2) {
          const local = readJourneyState();
          const mergedDone = mergeJourneyDone(local.done, j.done ?? {});
          writeJourneyState({ v: 2, done: mergedDone });
          const resume = j.lastTourResume;
          if (
            resume &&
            resume.v === 1 &&
            typeof resume.route === 'string' &&
            typeof window !== 'undefined' &&
            window.location.pathname === resume.route
          ) {
            writeTourResume(resume);
          }
          setJourneyTick((x) => x + 1);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setJourneyRemoteReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid]);

  /** Guardar camino en servidor (debounce) para soporte y continuidad entre sesiones. */
  useEffect(() => {
    if (!journeyRemoteReady || !user?.uid || authLoading) return;
    if (typeof window === 'undefined') return;
    const t = setTimeout(() => {
      const done = readJourneyState().done;
      const lastTourResume = readTourResume();
      void fetch('/api/user/onboarding-journey', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          done,
          lastPathname: pathname,
          lastTourResume,
        }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [journeyRemoteReady, user?.uid, authLoading, journeyTick, pathname]);

  const journeySnapshot = useMemo((): JourneyStateV2 => {
    if (typeof window === 'undefined') {
      return { v: 2, done: {} };
    }
    return readJourneyState();
  }, [pathname, journeyTick]);

  const completedCount = useMemo(() => {
    return JOURNEY_STAGE_IDS.filter((id) => journeySnapshot.done[id]).length;
  }, [journeySnapshot]);

  const journeyComplete = completedCount >= JOURNEY_STAGE_IDS.length;
  const totalStages = JOURNEY_STAGE_IDS.length;
  const journeyPercent = Math.round((completedCount / totalStages) * 100);
  const currentStage = journeyComplete ? null : firstIncompleteStage(journeySnapshot);
  const currentStageLabel = currentStage ? STAGE_META[currentStage].label : null;

  const clearClickUi = useCallback(() => {
    clickCleanupRef.current?.();
    clickCleanupRef.current = null;
    document.querySelectorAll('.afhub-click-target').forEach((n) => n.classList.remove('afhub-click-target'));
  }, []);

  const destroyDriver = useCallback(() => {
    pendingDomWaitCancelRef.current?.();
    pendingDomWaitCancelRef.current = null;
    pendingStepDomWaitCancelRef.current?.();
    pendingStepDomWaitCancelRef.current = null;
    setTourNavButtonsDisabled(false);
    driveSessionRef.current += 1;
    clearClickUi();
    try {
      driverRef.current?.destroy();
    } catch {
      /* noop */
    }
    driverRef.current = null;
  }, [clearClickUi]);

  const runDriverInteractive = useCallback(
    (
      afhubSteps: AfhubDriveStep[],
      stage: JourneyStageId,
      startIndex: number,
      opts: { journeyMode: boolean; onLastNext: () => void },
    ) => {
      destroyDriver();
      const driverSteps = toDriverSteps(afhubSteps);
      driverStepsRef.current = driverSteps;
      const metas = stepMetas(afhubSteps);
      metasRef.current = metas;
      stageRef.current = stage;

      const tour = driver({
        showProgress: true,
        animate: true,
        /* Cerrar (X) y teclado siempre: el usuario puede salir del recorrido en cualquier paso */
        allowClose: true,
        allowKeyboardControl: true,
        /* Opacidad suave: el panel sigue legible; solo se atenúa un poco el resto */
        overlayOpacity: opts.journeyMode ? 0.32 : 0.24,
        overlayColor: 'rgb(15 23 42)',
        stageRadius: 14,
        stagePadding: 6,
        smoothScroll: true,
        popoverClass: 'afhub-driver-popover',
        nextBtnText: 'Siguiente',
        prevBtnText: 'Atrás',
        doneBtnText: 'Listo',
        progressText: 'Paso {{current}} de {{total}}',
        showButtons: ['next', 'previous', 'close'],
        steps: driverSteps,
        onPopoverRender: (popover, { driver: d }) => {
          const i = d.getActiveIndex();
          const clickStep = i !== undefined && metasRef.current[i]?.advance === 'click';
          popover.nextButton.style.display = clickStep ? 'none' : '';
          popover.nextButton.disabled = clickStep;
          const cb = popover.closeButton;
          cb.style.setProperty('display', 'flex', 'important');
          cb.style.setProperty('visibility', 'visible', 'important');
          cb.style.setProperty('opacity', '1', 'important');
          cb.style.setProperty('position', 'absolute', 'important');
          cb.style.setProperty('z-index', '20', 'important');
          cb.style.setProperty('top', '10px', 'important');
          cb.style.setProperty('right', '10px', 'important');
          cb.style.setProperty('align-items', 'center', 'important');
          cb.style.setProperty('justify-content', 'center', 'important');
          cb.setAttribute('aria-label', 'Cerrar guía');
          if (!cb.innerHTML?.trim()) cb.innerHTML = '&times;';
          const w = popover.wrapper;
          w.classList.remove('afhub-popover-enter');
          void w.offsetWidth;
          w.classList.add('afhub-popover-enter');
        },
        onHighlighted: (el, _step, { driver: d }) => {
          clearClickUi();
          const i = d.getActiveIndex();
          if (i === undefined || !el) return;
          const meta = metasRef.current[i];
          if (meta?.advance === 'click') {
            el.classList.add('afhub-click-target');
            const stageNow = stageRef.current;
            const onCap = (ev: Event) => {
              if (!(ev.target instanceof Node) || !el.contains(ev.target)) return;
              if (meta.resume && stageNow) {
                writeTourResume({
                  v: 1,
                  stage: stageNow,
                  stepIndex: meta.resume.stepIndex,
                  route: meta.resume.route,
                });
                if (stageNow === 'inicio' && meta.resume.route === '/dashboard/agents') {
                  setInicioAgentsFlow(true);
                }
                if (stageNow === 'inicio' && meta.resume.route === '/dashboard') {
                  setInicioAgentsFlow(false);
                }
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    try {
                      d.destroy();
                    } catch {
                      /* noop */
                    }
                  });
                });
              } else {
                if (d.isActive() && !d.isLastStep()) {
                  const steps = driverStepsRef.current;
                  const nextIdx = (d.getActiveIndex() ?? 0) + 1;
                  pendingStepDomWaitCancelRef.current?.();
                  setTourNavButtonsDisabled(true);
                  pendingStepDomWaitCancelRef.current = whenStepsDomReady(
                    steps,
                    nextIdx,
                    () => {
                      pendingStepDomWaitCancelRef.current = null;
                      setTourNavButtonsDisabled(false);
                      if (!d.isActive()) return;
                      d.moveNext();
                    },
                    {
                      maxMs: 4000,
                      intervalMs: 40,
                      onTimeout: () => {
                        pendingStepDomWaitCancelRef.current = null;
                        setTourNavButtonsDisabled(false);
                      },
                    },
                  );
                }
              }
            };
            el.addEventListener('click', onCap, true);
            clickCleanupRef.current = () => {
              el.removeEventListener('click', onCap, true);
              el.classList.remove('afhub-click-target');
            };
          }
        },
        onDeselected: () => {
          clearClickUi();
        },
        onNextClick: (_el, _step, { driver: d }) => {
          const i = d.getActiveIndex();
          if (i !== undefined && metasRef.current[i]?.advance === 'click') {
            return;
          }
          if (d.isLastStep()) {
            opts.onLastNext();
            d.destroy();
            return;
          }
          const steps = driverStepsRef.current;
          const nextIdx = (i ?? 0) + 1;
          pendingStepDomWaitCancelRef.current?.();
          setTourNavButtonsDisabled(true);
          pendingStepDomWaitCancelRef.current = whenStepsDomReady(
            steps,
            nextIdx,
            () => {
              pendingStepDomWaitCancelRef.current = null;
              setTourNavButtonsDisabled(false);
              if (driverRef.current !== tour || !d.isActive()) return;
              d.moveNext();
            },
            {
              maxMs: 4500,
              intervalMs: 40,
              onTimeout: () => {
                pendingStepDomWaitCancelRef.current = null;
                setTourNavButtonsDisabled(false);
              },
            },
          );
        },
        onPrevClick: (_el, _step, { driver: d }) => {
          const i = d.getActiveIndex();
          if (i === undefined || i <= 0) return;
          const steps = driverStepsRef.current;
          const prevIdx = i - 1;
          pendingStepDomWaitCancelRef.current?.();
          setTourNavButtonsDisabled(true);
          pendingStepDomWaitCancelRef.current = whenStepsDomReady(
            steps,
            prevIdx,
            () => {
              pendingStepDomWaitCancelRef.current = null;
              setTourNavButtonsDisabled(false);
              if (driverRef.current !== tour || !d.isActive()) return;
              d.movePrevious();
            },
            {
              maxMs: 4500,
              intervalMs: 40,
              onTimeout: () => {
                pendingStepDomWaitCancelRef.current = null;
                setTourNavButtonsDisabled(false);
              },
            },
          );
        },
        onCloseClick: (_el, _step, { driver: d }) => {
          d.destroy();
        },
        onDestroyed: () => {
          clearClickUi();
          driverRef.current = null;
        },
      });
      driverRef.current = tour;
      pendingDomWaitCancelRef.current?.();
      const session = driveSessionRef.current;
      pendingDomWaitCancelRef.current = whenStepsDomReady(
        driverSteps,
        startIndex,
        () => {
          if (driveSessionRef.current !== session) return;
          if (driverRef.current !== tour) return;
          pendingDomWaitCancelRef.current = null;
          tour.drive(startIndex);
        },
        { maxMs: 2800, intervalMs: 40 },
      );
    },
    [clearClickUi, destroyDriver],
  );

  const startJourneyStage = useCallback(
    (stage: JourneyStageId, startIndex = 0) => {
      const raw = journeyStepsFor(stage, tourCounts);
      runDriverInteractive(raw, stage, startIndex, {
        journeyMode: true,
        onLastNext: () => {
          clearTourResume();
          if (stage === 'inicio') setInicioAgentsFlow(false);
          markStageDone(stage);
          setJourneyTick((x) => x + 1);
        },
      });
    },
    [runDriverInteractive, tourCounts],
  );

  const startTour = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (journeyComplete) {
      const extra = postJourneyPageSteps(pathname);
      if (!extra?.length) return;
      runDriverInteractive(extra, 'inicio', 0, {
        journeyMode: false,
        onLastNext: () => {},
      });
      return;
    }

    const next = currentStage ?? firstIncompleteStage(readJourneyState());
    if (!next) return;

    const resume = readTourResume();
    if (resume && resume.stage === next && pathname === resume.route) {
      clearTourResume();
      startJourneyStage(next, resume.stepIndex);
      return;
    }

    if (resume && resume.stage !== next) {
      clearTourResume();
    }

    startJourneyStage(next, 0);
  }, [currentStage, journeyComplete, pathname, startJourneyStage, tourCounts]);

  const resetJourney = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(JOURNEY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_TOUR_STORAGE_KEY);
    clearTourResume();
    setInicioAgentsFlow(false);
    destroyDriver();
    setJourneyTick((x) => x + 1);
    if (user?.uid) {
      void fetch('/api/user/onboarding-journey', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    } else {
      requestServerJourneyClearWhenAuthed();
    }
  }, [destroyDriver, user?.uid]);

  useEffect(() => {
    return () => destroyDriver();
  }, [destroyDriver]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const force = params.get('tour') === '1';
    const reset = params.get('tour') === 'reset';

    if (reset) {
      window.localStorage.removeItem(JOURNEY_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_TOUR_STORAGE_KEY);
      clearTourResume();
      setInicioAgentsFlow(false);
      setJourneyTick((x) => x + 1);
      if (user?.uid) {
        void fetch('/api/user/onboarding-journey', { method: 'DELETE', credentials: 'include' }).catch(() => {});
      } else {
        requestServerJourneyClearWhenAuthed();
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('tour');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }

    const state = readJourneyState();
    const incomplete = firstIncompleteStage(state);
    if (!incomplete) {
      clearTourResume();
      setInicioAgentsFlow(false);
      return;
    }

    if (
      (incomplete === 'mis-agentes' || incomplete === 'mis-widgets') &&
      !tourCounts.loaded
    ) {
      return;
    }

    let resume = readTourResume();
    if (resume && resume.stage !== incomplete) {
      clearTourResume();
      resume = null;
    }

    if (resume && pathname === resume.route && isTrialActive) {
      const stepIx = resume.stepIndex;
      let cancelled = false;
      const steps = toDriverSteps(journeyStepsFor(incomplete, tourCounts));
      const cancelWait = whenStepsDomReady(
        steps,
        stepIx,
        () => {
          if (cancelled) return;
          clearTourResume();
          destroyDriver();
          startJourneyStage(incomplete, stepIx);
        },
        { maxMs: 3200, intervalMs: 36 },
      );
      return () => {
        cancelled = true;
        cancelWait();
      };
    }

    /* Sin redirecciones ni arranque automático del driver al navegar: el usuario recorre el menú a su ritmo.
       El % del camino sube con el efecto `markStagesReachedByPath` (otro useEffect). */
    if (force && isTrialActive && incomplete) {
      let cancelled = false;
      const steps = toDriverSteps(journeyStepsFor(incomplete, tourCounts));
      const cancelWait = whenStepsDomReady(
        steps,
        0,
        () => {
          if (cancelled) return;
          destroyDriver();
          startJourneyStage(incomplete, 0);
        },
        { maxMs: 3200, intervalMs: 36 },
      );
      return () => {
        cancelled = true;
        cancelWait();
      };
    }

    return undefined;
  }, [pathname, isTrialActive, destroyDriver, startJourneyStage, tourCounts, user?.uid]);

  /** Progreso del camino al visitar cada sección (sin abrir el popover). No pisar reanudación interactiva. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!pathname.startsWith('/dashboard')) return;
    try {
      const r = readTourResume();
      if (r?.v === 1 && typeof r.route === 'string' && pathname === r.route) return;
    } catch {
      /* noop */
    }
    if (firstIncompleteStage(readJourneyState()) === null) return;
    if (markStagesReachedByPath(pathname)) {
      setJourneyTick((x) => x + 1);
    }
  }, [pathname]);

  const ctx = useMemo<TourContextValue>(
    () => ({
      startTour,
      resetJourney,
      journeyComplete,
      journeyPercent,
      completedCount,
      totalStages,
      currentStage,
      currentStageLabel,
    }),
    [
      startTour,
      resetJourney,
      journeyComplete,
      journeyPercent,
      completedCount,
      totalStages,
      currentStage,
      currentStageLabel,
    ],
  );

  return <TourContext.Provider value={ctx}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
