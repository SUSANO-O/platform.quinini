'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ExternalLink, Loader2 } from 'lucide-react';
import {
  isMcpIntegrationAllowedForPlan,
  minPlanForMcpIntegration,
  planLabelForMin,
} from '@/lib/mcp-catalog-filter';

type CatField = { key: string; label: string; secret: boolean; required: boolean };

type CatalogBanner = {
  variant?: string;
  text: string;
  linkUrl?: string;
  linkLabel?: string;
};

type McpStandardPreset = {
  id: string;
  name: string;
  description?: string;
  serverUrl: string;
  authHeaderEnv?: string;
};

type CatalogEntry = {
  key: string;
  name: string;
  description: string;
  credentialFields: CatField[];
  authMethods?: { id: string; label: string }[];
  credentialFieldsByAuthMethod?: Record<string, CatField[]>;
  docsUrl?: string;
  oauthRedirectHelp?: string;
  banners?: CatalogBanner[];
  /** Definidos en AIBackHub (MCP_STANDARD_PRESETS). */
  standardPresets?: McpStandardPreset[];
  /** false = solo presets, sin URL libre. */
  standardAllowCustomUrl?: boolean;
};

const INTEGRATION_ICONS: Record<string, string> = {
  gmail: '📧',
  hubspot: '🏢',
  google_calendar: '📅',
  googleCalendar: '📅',
  slack: '💬',
  weather: '🌤️',
  webSearch: '🔍',
  web_search: '🔍',
};

function integrationIcon(key: string): string {
  return INTEGRATION_ICONS[key] ?? '🔌';
}

/**
 * HubSpot valida `scope` como lista separada por espacios (RFC 6749). Muchas rutas serializan
 * espacios como `+` en la query; HubSpot puede tratarlos mal y mostrar «discrepancia».
 * Reconstruye la URL con `%20` entre permisos (mismo criterio que AIBackHub `buildHubspotOAuthAuthorizeUrl`).
 */
function normalizeHubspotAuthorizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (!/\.hubspot\.com$/i.test(u.hostname) || !/\/oauth/i.test(u.pathname)) return raw;
    const scopeRaw = u.searchParams.get('scope')?.trim() ?? '';
    if (!scopeRaw) return raw;
    const parts = scopeRaw.split(/[\s+]+/).filter(Boolean);
    if (parts.length < 2) return raw;

    const clientId = u.searchParams.get('client_id') ?? '';
    const redirectUri = u.searchParams.get('redirect_uri') ?? '';
    const state = u.searchParams.get('state') ?? '';
    const optional = u.searchParams.get('optional_scope');

    const q = new URLSearchParams();
    if (clientId) q.set('client_id', clientId);
    if (redirectUri) q.set('redirect_uri', redirectUri);
    if (state) q.set('state', state);
    if (optional) q.set('optional_scope', optional);

    const baseQs = q.toString().replace(/\+/g, '%20');
    const scopeQs = parts.map((p) => encodeURIComponent(p)).join('%20');
    return `${u.origin}${u.pathname}?${baseQs}&scope=${scopeQs}`;
  } catch {
    return raw;
  }
}

type StdPreview =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; tools: { name: string; description: string }[] }
  | { kind: 'err'; message: string };

type Props = {
  landingAgentId: string;
  onConnected?: () => void;
  initialIntegrationKey?: string;
  /** Plan de suscripción (Fase D — visibilidad por plan). Por defecto free. */
  plan?: string;
};

export function McpLandingConnectForm({
  landingAgentId,
  onConnected,
  initialIntegrationKey,
  plan: planProp,
}: Props) {
  const plan = planProp ?? 'free';
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [integrationKey, setIntegrationKey] = useState('');
  const [label, setLabel] = useState('');
  const [authMethod, setAuthMethod] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [hubspotOauthConnectionId, setHubspotOauthConnectionId] = useState<string | null>(null);
  const [hubspotOauthStarting, setHubspotOauthStarting] = useState(false);
  /** URL exacta que HubSpot debe tener en «Redirect URLs» (origen = esta pestaña). */
  const [hubspotOAuthRedirectDisplay, setHubspotOAuthRedirectDisplay] = useState('');
  const appliedInitialKey = useRef(false);
  const [stdPreview, setStdPreview] = useState<StdPreview>({ kind: 'idle' });
  const stdPreviewMatchRef = useRef<string>('');

  const primaryCatalog = useMemo(() => catalog, [catalog]);

  const entry = useMemo(
    () => catalog.find((c) => c.key === integrationKey),
    [catalog, integrationKey],
  );

  const entryAllowed = useMemo(
    () => (entry ? isMcpIntegrationAllowedForPlan(entry.key, plan) : true),
    [entry, plan],
  );

  const fields = useMemo(() => {
    if (!entry) return [];
    const am = authMethod || entry.authMethods?.[0]?.id || '';
    const byAm = entry.credentialFieldsByAuthMethod?.[am];
    if (byAm?.length) return byAm;
    return entry.credentialFields ?? [];
  }, [entry, authMethod]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCat(true);
      try {
        const r = await fetch('/api/mcp/catalog', { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j?.error || 'No se pudo cargar el catálogo MCP');
        }
        const list = (j?.data?.catalog ?? j?.catalog ?? []) as CatalogEntry[];
        if (!cancelled) {
          setCatalog((Array.isArray(list) ? list : []).filter((c) => c?.key !== 'mcp_standard'));
        }
      } catch {
        if (!cancelled) setCatalog([]);
      } finally {
        if (!cancelled) setLoadingCat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHubspotOAuthRedirectDisplay(
      `${window.location.origin}/api/mcp/hubspot-oauth/callback`,
    );
  }, []);

  useEffect(() => {
    if (!initialIntegrationKey?.trim() || catalog.length === 0 || appliedInitialKey.current) return;
    const k = initialIntegrationKey.trim();
    if (catalog.some((c) => c.key === k)) {
      setIntegrationKey(k);
      setStep(2);
      appliedInitialKey.current = true;
    }
  }, [catalog, initialIntegrationKey]);

  useEffect(() => {
    if (!entry) {
      setAuthMethod('');
      setCreds({});
      return;
    }
    const first = entry.authMethods?.[0]?.id ?? '';
    setAuthMethod((prev) => (prev && entry.authMethods?.some((a) => a.id === prev) ? prev : first));
  }, [entry]);

  useEffect(() => {
    if (!entry) return;
    const am = authMethod || entry.authMethods?.[0]?.id || '';
    const list =
      entry.credentialFieldsByAuthMethod?.[am] ?? entry.credentialFields ?? [];
    setCreds((prev) => {
      const next: Record<string, string> = {};
      for (const f of list) {
        const prevVal = prev[f.key] ?? '';
        next[f.key] = prevVal;
      }
      if (am) next.AUTH_METHOD = am;
      if (entry.key === 'mcp_standard' && prev.MCP_STANDARD_PRESET_ID) {
        next.MCP_STANDARD_PRESET_ID = prev.MCP_STANDARD_PRESET_ID;
        const p = entry.standardPresets?.find((x) => x.id === prev.MCP_STANDARD_PRESET_ID);
        if (p) next.MCP_SERVER_URL = p.serverUrl;
      }
      return next;
    });
  }, [entry, authMethod]);

  /** Si cambia URL o auth tras un preview OK, invalidar (Fase B). */
  useEffect(() => {
    if (entry?.key !== 'mcp_standard') return;
    const presetId = creds.MCP_STANDARD_PRESET_ID?.trim();
    const cur = presetId
      ? `${presetId}|${creds.MCP_AUTH_HEADER?.trim() ?? ''}`
      : `${creds.MCP_SERVER_URL?.trim() ?? ''}|${creds.MCP_AUTH_HEADER?.trim() ?? ''}`;
    if (stdPreview.kind === 'ok' && stdPreviewMatchRef.current && stdPreviewMatchRef.current !== cur) {
      setStdPreview({ kind: 'idle' });
      stdPreviewMatchRef.current = '';
    }
  }, [creds.MCP_SERVER_URL, creds.MCP_AUTH_HEADER, creds.MCP_STANDARD_PRESET_ID, entry?.key, stdPreview.kind]);

  const goBackToPicker = useCallback(() => {
    setStep(1);
    setIntegrationKey('');
    setLabel('');
    setAuthMethod('');
    setCreds({});
    setErr(null);
    setOk(null);
    setHubspotOauthConnectionId(null);
    setHubspotOauthStarting(false);
    setStdPreview({ kind: 'idle' });
    stdPreviewMatchRef.current = '';
  }, []);

  const selectIntegration = useCallback((key: string) => {
    if (!isMcpIntegrationAllowedForPlan(key, plan)) return;
    setIntegrationKey(key);
    setStep(2);
    setErr(null);
    setOk(null);
    setLabel('');
    setAuthMethod('');
    setCreds({});
    setStdPreview({ kind: 'idle' });
    stdPreviewMatchRef.current = '';
    setHubspotOauthConnectionId(null);
    setHubspotOauthStarting(false);
  }, [plan]);

  const startHubspotOAuth = useCallback(async () => {
    const cid = hubspotOauthConnectionId?.trim();
    if (!cid) return;
    setHubspotOauthStarting(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/mcp/connections/${encodeURIComponent(cid)}/hubspot-oauth/start?landingAgentId=${encodeURIComponent(landingAgentId)}`,
        { method: 'POST', credentials: 'include' },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          (typeof j?.error === 'object' && j?.error !== null && 'message' in j.error
            ? String((j.error as { message: string }).message)
            : '') ||
          (typeof j?.error === 'string' ? j.error : '') ||
          (typeof j?.message === 'string' ? j.message : '') ||
          'No se pudo iniciar OAuth HubSpot';
        throw new Error(msg);
      }
      const data = j?.data ?? j;
      const url = typeof data?.authorizeUrl === 'string' ? data.authorizeUrl : '';
      if (!url) throw new Error('El hub no devolvió authorizeUrl.');
      window.location.assign(normalizeHubspotAuthorizeUrl(url));
    } catch (e) {
      setHubspotOauthStarting(false);
      setErr(e instanceof Error ? e.message : 'Error OAuth HubSpot');
    }
  }, [hubspotOauthConnectionId, landingAgentId]);

  const runStandardPreview = useCallback(async () => {
    const url = creds.MCP_SERVER_URL?.trim();
    const presetId = creds.MCP_STANDARD_PRESET_ID?.trim();
    const hasPresets = (entry?.standardPresets?.length ?? 0) > 0;
    const allowCustom = entry?.standardAllowCustomUrl !== false;

    if (hasPresets && !allowCustom && !presetId) {
      setErr('Selecciona un servidor de la lista.');
      return;
    }
    if (hasPresets && presetId) {
      setErr(null);
      setStdPreview({ kind: 'loading' });
    } else if (!url) {
      setErr('Indica la URL del servidor MCP o elige un servidor de la lista.');
      return;
    } else {
      setErr(null);
      setStdPreview({ kind: 'loading' });
    }
    try {
      const body =
        hasPresets && presetId
          ? {
              presetId,
              authHeader: creds.MCP_AUTH_HEADER?.trim() || undefined,
            }
          : {
              serverUrl: url,
              authHeader: creds.MCP_AUTH_HEADER?.trim() || undefined,
            };
      const r = await fetch('/api/mcp/preview-standard', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        let msg = 'Error al conectar con el servidor MCP';
        if (j?.error && typeof j.error === 'object' && j.error !== null && 'message' in j.error) {
          msg = String((j.error as { message: string }).message);
        } else if (typeof j?.error === 'string') {
          msg = j.error;
        } else if (typeof j?.message === 'string') {
          msg = j.message;
        }
        throw new Error(msg);
      }
      const data = j?.data ?? j;
      const toolsRaw = data?.tools ?? [];
      const tools = Array.isArray(toolsRaw)
        ? toolsRaw.map((t: { name?: string; description?: string }) => ({
            name: String(t.name ?? ''),
            description: String(t.description ?? ''),
          }))
        : [];
      const hasPresetsOk = (entry?.standardPresets?.length ?? 0) > 0;
      const pid = creds.MCP_STANDARD_PRESET_ID?.trim();
      stdPreviewMatchRef.current =
        hasPresetsOk && pid
          ? `${pid}|${creds.MCP_AUTH_HEADER?.trim() ?? ''}`
          : `${creds.MCP_SERVER_URL?.trim() ?? ''}|${creds.MCP_AUTH_HEADER?.trim() ?? ''}`;
      setStdPreview({ kind: 'ok', tools });
    } catch (e) {
      stdPreviewMatchRef.current = '';
      setStdPreview({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Error de conexión',
      });
    }
  }, [creds.MCP_SERVER_URL, creds.MCP_AUTH_HEADER, creds.MCP_STANDARD_PRESET_ID, entry]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setOk(null);
      if (!entry) return;
      if (!entryAllowed) {
        setErr('Tu plan no incluye esta integración.');
        return;
      }
      const am = authMethod || entry.authMethods?.[0]?.id || '';
      const payload: Record<string, string> = { ...creds };
      if (am) payload.AUTH_METHOD = am;

      const isHubspotOauthPending =
        entry.key === 'hubspot' &&
        am === 'oauth2' &&
        !String(payload.HUBSPOT_REFRESH_TOKEN ?? '').trim() &&
        !String(payload.HUBSPOT_ACCESS_TOKEN ?? '').trim() &&
        String(payload.HUBSPOT_CLIENT_ID ?? '').trim() &&
        String(payload.HUBSPOT_CLIENT_SECRET ?? '').trim();

      if (entry.key === 'mcp_standard') {
        const pid = creds.MCP_STANDARD_PRESET_ID?.trim();
        const cur = pid
          ? `${pid}|${creds.MCP_AUTH_HEADER?.trim() ?? ''}`
          : `${creds.MCP_SERVER_URL?.trim() ?? ''}|${creds.MCP_AUTH_HEADER?.trim() ?? ''}`;
        if (stdPreview.kind !== 'ok' || stdPreviewMatchRef.current !== cur) {
          setErr('Primero pulsa «Probar conexión» y espera a ver las herramientas detectadas.');
          return;
        }
      }

      for (const f of fields) {
        if (f.required && !String(payload[f.key] ?? '').trim()) {
          if (
            entry.key === 'mcp_standard' &&
            f.key === 'MCP_SERVER_URL' &&
            payload.MCP_STANDARD_PRESET_ID?.trim()
          ) {
            continue;
          }
          setErr(`Completa: ${f.label}`);
          return;
        }
      }
      setSaving(true);
      try {
        const r = await fetch('/api/mcp/connections', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            landingAgentId,
            integrationKey: entry.key,
            label: label.trim() || undefined,
            credentials: payload,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j?.error || j?.message || 'Error al crear la conexión');
        }
        const connId =
          j?.data?.connection?.id ??
          j?.connection?.id ??
          j?.data?.id ??
          j?.id;
        if (connId) {
          if (!isHubspotOauthPending) {
            const sr = await fetch(
              `/api/mcp/connections/${encodeURIComponent(String(connId))}/sync?landingAgentId=${encodeURIComponent(landingAgentId)}`,
              { method: 'POST', credentials: 'include' },
            );
            if (!sr.ok) {
              const sj = await sr.json().catch(() => ({}));
              throw new Error(sj?.error || 'Conexión creada pero falló la sincronización');
            }
          } else {
            setHubspotOauthConnectionId(String(connId));
            setOk(
              'Conexión guardada. Pulsa «Autorizar con HubSpot» para conceder acceso; al volver se sincronizará en el hub.',
            );
            setLabel('');
            setCreds({});
            setStdPreview({ kind: 'idle' });
            stdPreviewMatchRef.current = '';
            onConnected?.();
            return;
          }
        }
        setOk('Conexión guardada y sincronizada.');
        setHubspotOauthConnectionId(null);
        setLabel('');
        setCreds({});
        setStdPreview({ kind: 'idle' });
        stdPreviewMatchRef.current = '';
        onConnected?.();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error');
      } finally {
        setSaving(false);
      }
    },
    [
      entry,
      entryAllowed,
      fields,
      creds,
      authMethod,
      label,
      landingAgentId,
      onConnected,
      stdPreview,
    ],
  );

  function renderIntegrationCard(c: CatalogEntry, opts?: { advanced?: boolean }) {
    const advanced = opts?.advanced ?? false;
    const allowed = isMcpIntegrationAllowedForPlan(c.key, plan);
    const minP = minPlanForMcpIntegration(c.key);

    if (!allowed) {
      return (
        <div
          key={c.key}
          className={`flex w-full flex-col gap-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 ${
            advanced ? 'border-dashed' : ''
          }`}
          role="group"
          aria-label={`${c.name} — requiere plan superior`}
        >
          <div className="flex gap-3 opacity-90">
            <span className="text-2xl leading-none" aria-hidden>
              {integrationIcon(c.key)}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{c.name}</span>
              <span className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{c.description}</span>
              <span className="mt-2 inline-block text-[10px] font-bold uppercase text-amber-800 dark:text-amber-200">
                Requiere plan {planLabelForMin(minP)} o superior
              </span>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex w-fit items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Ver planes y mejorar
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      );
    }

    return (
      <button
        key={c.key}
        type="button"
        onClick={() => selectIntegration(c.key)}
        className={`flex w-full gap-3 rounded-lg border p-4 text-left transition-colors ${
          advanced
            ? 'border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/60'
            : 'border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/50'
        }`}
        aria-label={`Conectar ${c.name}`}
      >
        <span className="text-2xl leading-none" aria-hidden>
          {integrationIcon(c.key)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{c.name}</span>
          <span className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{c.description}</span>
          {advanced && (
            <span className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              URL personalizada · usuarios avanzados
            </span>
          )}
        </span>
      </button>
    );
  }

  if (loadingCat) {
    return (
      <div
        className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"
        role="status"
        aria-live="polite"
      >
        Cargando catálogo MCP…
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        role="alert"
      >
        No hay integraciones MCP disponibles en el hub. Comprueba BACKEND_URL y que AIBackHub esté en marcha.
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Conectar integración MCP</h3>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Elige un servicio. Las integraciones marcadas requieren un plan superior; el siguiente paso solo pide credenciales de la opción elegida.
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">Plan actual: {plan}</p>
        </div>

        {primaryCatalog.length > 0 && (
          <div
            className="grid gap-3 sm:grid-cols-2"
            role="list"
            aria-label="Integraciones disponibles"
          >
            {primaryCatalog.map((c) => renderIntegrationCard(c))}
          </div>
        )}

      </div>
    );
  }

  /* Paso 2: bloqueado por plan */
  if (entry && !entryAllowed) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
        <button
          type="button"
          onClick={goBackToPicker}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Volver
        </button>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {entry.name} requiere plan {planLabelForMin(minPlanForMcpIntegration(entry.key))} o superior
        </p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Tu plan actual es <strong>{plan}</strong>. Mejora el plan para conectar esta integración.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex w-fit items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Ver planes
          <ExternalLink className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const urlField = fields.find((f) => f.key === 'MCP_SERVER_URL');
  const authHeaderField = fields.find((f) => f.key === 'MCP_AUTH_HEADER');
  const isStandard = entry?.key === 'mcp_standard';
  const hasStandardPresets = (entry?.standardPresets?.length ?? 0) > 0;
  const allowStdCustomUrl = entry?.standardAllowCustomUrl !== false;
  const showStandardBlock = isStandard && (hasStandardPresets || Boolean(urlField));

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
      aria-labelledby="mcp-form-title"
    >
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={goBackToPicker}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Cambiar integración
        </button>
      </div>

      <div>
        <h3 id="mcp-form-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <span className="mr-2" aria-hidden>
            {entry ? integrationIcon(entry.key) : null}
          </span>
          {entry?.name ?? 'Integración'}
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Credenciales solo para este agente. Plan: <strong>{plan}</strong>
        </p>
      </div>

      {entry?.banners?.length ? (
        <div className="space-y-2" role="region" aria-label="Avisos">
          {entry.banners.slice(0, 2).map((b, i) => (
            <div
              key={i}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300"
            >
              {b.text}
              {b.linkUrl && b.linkLabel && (
                <a
                  href={b.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 font-semibold text-indigo-600 underline dark:text-indigo-400"
                >
                  {b.linkLabel}
                </a>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {(entry?.key === 'gmail' || entry?.key === 'google_calendar' || entry?.key === 'hubspot') && (
        <div
          className="rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-3 text-xs text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"
          role="region"
          aria-label="Ayuda OAuth y documentación"
        >
          <p className="font-semibold">Credenciales OAuth / API</p>
          <p className="mt-1 leading-relaxed">
            {entry.key === 'hubspot'
              ? 'OAuth2: Client ID + Secret. «Scopes OAuth» debe incluir todos los permisos que en HubSpot (Developer → tu app → Auth) figuren como «Obligatorios», separados por espacio. La «URL de instalación de muestra» a veces solo muestra scope=oauth aunque también tengas CRM obligatorios: en ese caso no copies solo esa URL; lista los tres nombres (p. ej. oauth crm.objects.contacts.read crm.objects.contacts.write). Si hay discrepancia, o faltan obligatorios en el campo o sobran scopes que la app no tiene. Guarda, «Conectar y sincronizar» y luego «Autorizar con HubSpot».'
              : 'Obtén Client ID, secret y tokens en la consola del proveedor y pégalos abajo. No almacenamos tu sesión de login del proveedor; solo los valores que indiques.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {entry.docsUrl && (
              <a
                href={entry.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-700"
              >
                Documentación
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {(entry.key === 'gmail' || entry.key === 'google_calendar') && (
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2 py-1 font-semibold text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100"
              >
                Google Cloud — credenciales
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {entry.key === 'hubspot' && (
              <a
                href="https://developers.hubspot.com/docs/api/working-with-oauth"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2 py-1 font-semibold text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100"
              >
                HubSpot — OAuth / apps
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {entry.key === 'hubspot' && hubspotOAuthRedirectDisplay ? (
            <div className="mt-3 rounded-md border border-indigo-300/80 bg-white/90 px-2.5 py-2 dark:border-indigo-700 dark:bg-indigo-950/60">
              <p className="text-[11px] font-semibold text-indigo-950 dark:text-indigo-100">
                Redirect URL en HubSpot (Auth → «Redirect URLs»)
              </p>
              <p className="mt-1 text-[10px] leading-snug text-indigo-900/95 dark:text-indigo-200/95">
                Debe ser <strong>exactamente</strong> esta línea (mismo host y puerto que usas ahora en el navegador;{' '}
                <code className="rounded bg-indigo-100/80 px-0.5 dark:bg-indigo-900/80">localhost</code> y{' '}
                <code className="rounded bg-indigo-100/80 px-0.5 dark:bg-indigo-900/80">127.0.0.1</code> cuentan como
                distintos).
              </p>
              <code className="mt-1.5 block select-all break-all rounded bg-indigo-100/70 px-2 py-1.5 text-[10px] text-indigo-950 dark:bg-indigo-900/80 dark:text-indigo-100">
                {hubspotOAuthRedirectDisplay}
              </code>
              <button
                type="button"
                className="mt-2 inline-flex items-center rounded border border-indigo-400 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-100 dark:hover:bg-indigo-900/70"
                onClick={() => {
                  void navigator.clipboard?.writeText(hubspotOAuthRedirectDisplay).catch(() => {});
                }}
              >
                Copiar URL
              </button>
            </div>
          ) : null}
          {entry.oauthRedirectHelp && (
            <p className="mt-2 text-[11px] leading-snug text-indigo-900/90 dark:text-indigo-200/90">{entry.oauthRedirectHelp}</p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="text-zinc-700 dark:text-zinc-300">Etiqueta (opcional)</span>
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="p. ej. cuenta trabajo"
            autoComplete="off"
          />
        </label>
      </div>

      {entry?.authMethods && entry.authMethods.length > 0 && (
        <label className="block text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">Método de autenticación</span>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={authMethod || entry.authMethods[0]?.id}
            onChange={(e) => setAuthMethod(e.target.value)}
          >
            {entry.authMethods.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {entry?.key === 'hubspot' &&
        (authMethod || entry?.authMethods?.[0]?.id) === 'oauth2' &&
        hubspotOauthConnectionId && (
          <div
            className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
            role="region"
            aria-label="Autorizar HubSpot"
          >
            <p className="font-semibold">Siguiente paso: autorizar en HubSpot</p>
            <p className="mt-1 leading-relaxed">
              Se abrirá la página de consentimiento de HubSpot. Tras aceptar, volverás al dashboard y se
              guardarán refresh y access token en el hub.
            </p>
            <button
              type="button"
              disabled={hubspotOauthStarting}
              onClick={() => void startHubspotOAuth()}
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {hubspotOauthStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Abriendo HubSpot…
                </>
              ) : (
                'Autorizar con HubSpot'
              )}
            </button>
          </div>
        )}

      {showStandardBlock && (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/30">
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Probar antes de guardar</p>

          {hasStandardPresets && entry?.standardPresets && (
            <div role="radiogroup" aria-label="Servidores MCP disponibles en el hub" className="space-y-2">
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Elige un servidor habilitado por el backend. Solo se listan los definidos en la configuración del hub.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {entry.standardPresets.map((p) => {
                  const selected = creds.MCP_STANDARD_PRESET_ID === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setCreds((prev) => ({
                          ...prev,
                          MCP_STANDARD_PRESET_ID: p.id,
                          MCP_SERVER_URL: p.serverUrl,
                        }));
                        setStdPreview({ kind: 'idle' });
                        stdPreviewMatchRef.current = '';
                      }}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50/90 dark:border-indigo-500 dark:bg-indigo-950/50'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-950 dark:hover:border-zinc-500'
                      }`}
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</span>
                      {p.description ? (
                        <span className="mt-1 block text-[11px] text-zinc-600 dark:text-zinc-400">{p.description}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {allowStdCustomUrl && urlField && (
            <label className="block text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                {urlField.label}
                {urlField.required && !creds.MCP_STANDARD_PRESET_ID?.trim() ? ' *' : ''}
              </span>
              <input
                type="text"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                value={creds.MCP_SERVER_URL ?? ''}
                onChange={(e) =>
                  setCreds((p) => ({
                    ...p,
                    MCP_SERVER_URL: e.target.value,
                    MCP_STANDARD_PRESET_ID: '',
                  }))
                }
                required={urlField.required && !creds.MCP_STANDARD_PRESET_ID?.trim()}
              />
            </label>
          )}
          <button
            type="button"
            onClick={runStandardPreview}
            disabled={stdPreview.kind === 'loading'}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            {stdPreview.kind === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Probando…
              </>
            ) : (
              'Probar conexión'
            )}
          </button>
          {stdPreview.kind === 'ok' && stdPreview.tools.length > 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                Herramientas detectadas ({stdPreview.tools.length})
              </p>
              <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-xs text-emerald-900 dark:text-emerald-200">
                {stdPreview.tools.map((t) => (
                  <li key={t.name}>{t.name || '(sin nombre)'}</li>
                ))}
              </ul>
            </div>
          )}
          {stdPreview.kind === 'ok' && stdPreview.tools.length === 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-200">Conexión OK, pero el servidor no devolvió herramientas.</p>
          )}
          {stdPreview.kind === 'err' && (
            <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
              <span role="alert">{stdPreview.message}</span>
              <button
                type="button"
                onClick={runStandardPreview}
                className="w-fit rounded border border-red-300 px-2 py-1 font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/50"
              >
                Reintentar
              </button>
            </div>
          )}
          {authHeaderField && (
            <label className="block text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">{authHeaderField.label}</span>
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                value={creds.MCP_AUTH_HEADER ?? ''}
                onChange={(e) => setCreds((p) => ({ ...p, MCP_AUTH_HEADER: e.target.value }))}
              />
            </label>
          )}
        </div>
      )}

      {entry && !isStandard && fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="block text-sm sm:col-span-2">
              <span className="text-zinc-700 dark:text-zinc-300">
                {f.label}
                {f.required ? ' *' : ''}
              </span>
              <input
                type={f.secret ? 'password' : 'text'}
                autoComplete={f.secret ? 'new-password' : 'off'}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                value={creds[f.key] ?? ''}
                onChange={(e) => setCreds((p) => ({ ...p, [f.key]: e.target.value }))}
                required={f.required}
              />
            </label>
          ))}
        </div>
      )}

      {err && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      )}
      {ok && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {ok}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !entry || (isStandard && stdPreview.kind !== 'ok')}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? 'Guardando…' : 'Conectar y sincronizar'}
        </button>
      </div>
    </form>
  );
}
