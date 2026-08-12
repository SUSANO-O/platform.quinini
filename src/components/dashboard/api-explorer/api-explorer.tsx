'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Search,
} from '@/components/ui/icons';
import {
  fetchOpenApiSpec,
  loadStoredApiKey,
  provisionApiKey,
  sendExplorerRequest,
  storeApiKey,
  type ApiExplorerResponse,
} from '@/lib/api-explorer-client';
import {
  buildRequestUrl,
  defaultBodyJson,
  defaultPathParams,
  defaultQueryParams,
  METHOD_COLORS,
  type ApiOperation,
  type HttpMethod,
  type ParsedOpenApi,
} from '@/lib/openapi-explorer';
import { BRAND } from '@/lib/brand-colors';

type ApiExplorerProps = {
  apiBase: string;
};

function formatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function statusTone(status: number): string {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 400 && status < 500) return 'warn';
  if (status >= 500) return 'error';
  return 'muted';
}

export function ApiExplorer({ apiBase }: ApiExplorerProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [spec, setSpec] = useState<(ParsedOpenApi & { rawComponents?: Record<string, unknown> }) | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [apiKey, setApiKey] = useState('');
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ApiExplorerResponse | null>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [activeSection, setActiveSection] = useState<'auth' | 'params' | 'body'>('auth');

  const selected = useMemo(
    () => spec?.operations.find((op) => op.id === selectedId) ?? null,
    [spec, selectedId],
  );

  const loadSpec = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const parsed = await fetchOpenApiSpec();
      setSpec(parsed);
      setExpandedGroups(new Set(parsed.groups.map((g) => g.name)));
      const health = parsed.operations.find((op) => op.path === '/health' && op.method === 'get');
      const first = health ?? parsed.operations[0];
      if (first) setSelectedId(first.id);
      const cached = loadStoredApiKey();
      if (cached) {
        setApiKey(cached);
        return;
      }
      try {
        const keyData = await provisionApiKey(false);
        if (keyData.apiKey) {
          storeApiKey(keyData.apiKey);
          setApiKey(keyData.apiKey);
          setKeyHint(keyData.warning ?? 'Clave generada para pruebas.');
        } else if (keyData.hasExistingKeys) {
          setKeyHint(keyData.message ?? 'Pega tu clave X-Api-Key o genera una nueva.');
        }
      } catch {
        setKeyHint('Configura tu clave X-Api-Key para probar endpoints protegidos.');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al cargar la API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSpec();
  }, [loadSpec]);

  useEffect(() => {
    if (!selected || !spec) return;
    setPathParams(defaultPathParams(selected));
    setQueryParams(defaultQueryParams(selected));
    setBody(defaultBodyJson(selected, spec.rawComponents));
    setResponse(null);
    if (selected.requestBodySchema) setActiveSection('body');
    else if (Object.keys(defaultQueryParams(selected)).length > 0) setActiveSection('params');
    else setActiveSection('auth');
  }, [selected, spec]);

  const filteredGroups = useMemo(() => {
    if (!spec) return [];
    const q = search.trim().toLowerCase();
    if (!q) return spec.groups;
    return spec.groups
      .map((group) => ({
        ...group,
        operations: group.operations.filter((op) => {
          const haystack = [op.summary, op.path, op.tag, op.method, op.id].join(' ').toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((group) => group.operations.length > 0);
  }, [spec, search]);

  const requestUrl = useMemo(() => {
    if (!selected) return '';
    return buildRequestUrl(selected.path, pathParams, queryParams);
  }, [selected, pathParams, queryParams]);

  const displayUrl = useMemo(() => {
    if (!requestUrl) return '';
    return `${apiBase.replace(/\/$/, '')}${requestUrl}`;
  }, [apiBase, requestUrl]);

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      const data = await provisionApiKey(true);
      if (data.apiKey) {
        storeApiKey(data.apiKey);
        setApiKey(data.apiKey);
        setKeyHint(data.warning ?? 'Nueva clave generada.');
      }
    } catch (err) {
      setKeyHint(err instanceof Error ? err.message : 'No se pudo generar la clave');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    setResponse(null);
    setCopiedResponse(false);
    const result = await sendExplorerRequest({
      url: requestUrl,
      method: selected.method,
      apiKey,
      body: ['post', 'put', 'patch'].includes(selected.method) ? body : undefined,
    });
    setResponse(result);
    setSending(false);
  };

  const copyApiKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopiedApiKey(true);
      window.setTimeout(() => setCopiedApiKey(false), 1600);
    } catch {
      /* noop */
    }
  }, [apiKey]);

  const copyResponseBody = useCallback(async () => {
    if (!response?.bodyText) return;
    const text = formatJson(response.bodyText) || response.bodyText;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedResponse(true);
      window.setTimeout(() => setCopiedResponse(false), 1600);
    } catch {
      /* noop */
    }
  }, [response]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="api-explorer-state">
        <Loader2 size={26} className="animate-spin" style={{ color: BRAND.primary }} />
        <p>Cargando referencia de la API…</p>
      </div>
    );
  }

  if (loadError || !spec || !selected) {
    return (
      <div className="api-explorer-state api-explorer-state--warn">
        <p>{loadError ?? 'No hay endpoints disponibles'}</p>
        <button type="button" className="api-docs-btn api-docs-btn--ghost" onClick={() => void loadSpec()}>
          <RefreshCw size={14} />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="api-explorer">
      <aside className="api-explorer__sidebar">
        <div className="api-explorer__search-wrap">
          <Search size={14} className="api-explorer__search-icon" aria-hidden />
          <input
            type="search"
            className="api-explorer__search"
            placeholder="Buscar endpoint…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <nav className="api-explorer__nav" aria-label="Endpoints">
          {filteredGroups.map((group) => {
            const open = expandedGroups.has(group.name);
            return (
              <section key={group.name} className="api-explorer__group">
                <button
                  type="button"
                  className="api-explorer__group-toggle"
                  onClick={() => toggleGroup(group.name)}
                  aria-expanded={open}
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{group.name}</span>
                </button>
                {open ? (
                  <ul className="api-explorer__ops">
                    {group.operations.map((op) => (
                      <li key={op.id}>
                        <button
                          type="button"
                          className={`api-explorer__op${selectedId === op.id ? ' api-explorer__op--active' : ''}`}
                          onClick={() => setSelectedId(op.id)}
                        >
                          <MethodBadge method={op.method} compact />
                          <span className="api-explorer__op-label">{op.summary}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </nav>
      </aside>

      <div className="api-explorer__workspace">
        <header className="api-explorer__bar">
          <MethodBadge method={selected.method} />
          <input
            className="api-explorer__url"
            value={displayUrl}
            readOnly
            aria-label="URL de la petición"
          />
          <button
            type="button"
            className="api-explorer__send"
            onClick={() => void handleSend()}
            disabled={sending}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Enviar
          </button>
        </header>

        <div className="api-explorer__main">
          <div className="api-explorer__request">
            <div className="api-explorer__head">
              <div>
                <h3 className="api-explorer__title">{selected.summary}</h3>
                {selected.description && selected.description !== selected.summary ? (
                  <p className="api-explorer__desc">{selected.description}</p>
                ) : null}
              </div>
              <code className="api-explorer__path">{selected.path}</code>
            </div>

            <div className="api-explorer__tabs">
              {(['auth', 'params', 'body'] as const).map((tab) => {
                const hidden =
                  tab === 'body'
                    ? !selected.requestBodySchema
                    : tab === 'params'
                      ? Object.keys(pathParams).length === 0 && Object.keys(queryParams).length === 0
                      : false;
                if (hidden) return null;
                return (
                  <button
                    key={tab}
                    type="button"
                    className={`api-explorer__tab${activeSection === tab ? ' api-explorer__tab--active' : ''}`}
                    onClick={() => setActiveSection(tab)}
                  >
                    {tab === 'auth' ? 'Autenticación' : tab === 'params' ? 'Parámetros' : 'Body JSON'}
                  </button>
                );
              })}
            </div>

            <div className="api-explorer__section">
              {activeSection === 'auth' ? (
                <div className="api-explorer__auth">
                  <label className="api-explorer__field-label">
                    <KeyRound size={13} aria-hidden />
                    X-Api-Key
                    {selected.requiresAuth ? <span className="api-explorer__required">requerido</span> : null}
                  </label>
                  <div className="api-explorer__auth-row">
                    <input
                      type="password"
                      className="api-explorer__input api-explorer__input--mono"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        storeApiKey(e.target.value);
                      }}
                      placeholder="afapi_…"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className={`api-explorer__copy-icon${copiedApiKey ? ' api-explorer__copy-icon--done' : ''}`}
                      onClick={() => void copyApiKey()}
                      disabled={!apiKey.trim()}
                      title={copiedApiKey ? 'Copiado' : 'Copiar API key'}
                      aria-label={copiedApiKey ? 'Copiado' : 'Copiar API key'}
                    >
                      {copiedApiKey ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                    <button
                      type="button"
                      className="api-docs-btn api-docs-btn--ghost"
                      onClick={() => void handleGenerateKey()}
                      disabled={generatingKey}
                    >
                      {generatingKey ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Generar
                    </button>
                  </div>
                  {keyHint ? <p className="api-explorer__hint">{keyHint}</p> : null}
                  <p className="api-explorer__hint">
                    Base: <code>{apiBase}/api/v1</code>
                  </p>
                </div>
              ) : null}

              {activeSection === 'params' ? (
                <div className="api-explorer__params">
                  {Object.keys(pathParams).length > 0 ? (
                    <ParamBlock
                      title="Path"
                      params={pathParams}
                      onChange={(name, value) => setPathParams((p) => ({ ...p, [name]: value }))}
                      operation={selected}
                      kind="path"
                    />
                  ) : null}
                  {Object.keys(queryParams).length > 0 ? (
                    <ParamBlock
                      title="Query"
                      params={queryParams}
                      onChange={(name, value) => setQueryParams((p) => ({ ...p, [name]: value }))}
                      operation={selected}
                      kind="query"
                    />
                  ) : null}
                </div>
              ) : null}

              {activeSection === 'body' && selected.requestBodySchema ? (
                <div className="api-explorer__body">
                  <textarea
                    className="api-explorer__textarea"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="api-docs-btn api-docs-btn--ghost api-explorer__format-btn"
                    onClick={() => setBody((b) => formatJson(b))}
                  >
                    Formatear JSON
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="api-explorer__response">
            <div className="api-explorer__response-head">
              <h3>Respuesta</h3>
              <div className="api-explorer__response-actions">
                {response && !response.error && response.bodyText ? (
                  <button
                    type="button"
                    className={`api-explorer__copy-icon${copiedResponse ? ' api-explorer__copy-icon--done' : ''}`}
                    onClick={() => void copyResponseBody()}
                    title={copiedResponse ? 'Copiado' : 'Copiar respuesta'}
                    aria-label={copiedResponse ? 'Copiado' : 'Copiar respuesta'}
                  >
                    {copiedResponse ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                ) : null}
                {response ? (
                  <span className={`api-explorer__status api-explorer__status--${statusTone(response.status)}`}>
                    {response.status || '—'} {response.statusText}
                    <span className="api-explorer__duration">{response.durationMs} ms</span>
                  </span>
                ) : (
                  <span className="api-explorer__status api-explorer__status--muted">Sin enviar</span>
                )}
              </div>
            </div>
            <div className="api-explorer__response-body">
              {!response ? (
                <p className="api-explorer__empty">
                  Pulsa <strong>Enviar</strong> para ver status, headers y body aquí.
                </p>
              ) : response.error ? (
                <div className="api-explorer__error">
                  <p>{response.error}</p>
                  <p className="api-explorer__hint">
                    Si trabajas en local, confirma que el API REST esté activo en el puerto 4000.
                  </p>
                </div>
              ) : (
                <>
                  <ResponseMeta response={response} />
                  <pre className="api-explorer__code">{formatJson(response.bodyText) || response.bodyText || '—'}</pre>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MethodBadge({ method, compact }: { method: HttpMethod; compact?: boolean }) {
  const colors = METHOD_COLORS[method];
  return (
    <span
      className={`api-explorer__method${compact ? ' api-explorer__method--compact' : ''}`}
      style={{ background: colors.bg, color: colors.text }}
    >
      {method.toUpperCase()}
    </span>
  );
}

function ParamBlock({
  title,
  params,
  onChange,
  operation,
  kind,
}: {
  title: string;
  params: Record<string, string>;
  onChange: (name: string, value: string) => void;
  operation: ApiOperation;
  kind: 'path' | 'query';
}) {
  return (
    <div className="api-explorer__param-block">
      <p className="api-explorer__param-title">{title}</p>
      <div className="api-explorer__param-grid">
        {Object.entries(params).map(([name, value]) => {
          const meta = operation.parameters.find((p) => p.in === kind && p.name === name);
          return (
            <label key={name} className="api-explorer__param-row">
              <span>
                {name}
                {meta?.required ? ' *' : ''}
              </span>
              <input
                className="api-explorer__input"
                value={value}
                onChange={(e) => onChange(name, e.target.value)}
                placeholder={meta?.description ?? name}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ResponseMeta({ response }: { response: ApiExplorerResponse }) {
  return (
    <div className="api-explorer__response-meta">
      <details className="api-explorer__headers-details">
        <summary>Headers ({Object.keys(response.headers).length})</summary>
        <ul>
          {Object.entries(response.headers).map(([k, v]) => (
            <li key={k}>
              <code>{k}</code>: {v}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
