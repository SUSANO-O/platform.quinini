/**
 * AgentFlowhub Embeddable Chat Widget — SOURCE OF TRUTH
 * Edit this file, then run: npm run build:widget
 * Outputs: public/widget.js (embed público) + public/assist.js (asistente interno)
 */
(function () {
  'use strict';

  if (window.AgentFlowhub && window.AgentFlowhub.version) return;

  var VERSION = '1.5.9';
  var INSTANCES = {};
  var INSTANCE_COUNT = 0;

  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_NEW_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICON_ATTACH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_MIC_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICON_VOLUME_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  var ICON_VOLUME_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  /** Barra lateral anclada al borde de la ventana */
  var ICON_SIDEBAR_DOCK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="12" height="16" rx="2"/><rect x="15" y="8" width="6" height="10" rx="1"/></svg>';
  /** Volver al panel flotante sobre el lanzador */
  var ICON_POPOUT_CHAT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="14" height="14" rx="2"/><rect x="11" y="10" width="11" height="11" rx="2"/></svg>';
  /** Ampliar barra lateral (casi pantalla completa) */
  var ICON_SIDEBAR_WIDE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  /** Barra estrecha (vista compacta) */
  var ICON_SIDEBAR_NARROW =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M10 20l4-4"/><path d="M14 4l-4 4"/></svg>';
  /** Pantalla completa */
  var ICON_FULLSCREEN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  /** Menu kebab (3 puntos) para ajustes */
  var ICON_KEBAB =
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
  /** Papelera para borrar conversación */
  var ICON_TRASH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  /** Centrado, ondas suaves (sin conic-spin); funciona con cualquier color de marca */
  var ORB_HTML =
    '<span class="afhub-fab-inner" aria-hidden="true"><span class="afhub-orb">' +
    '<span class="afhub-orb-wave"></span><span class="afhub-orb-wave afhub-orb-wave-b"></span>' +
    '<span class="afhub-orb-core"></span></span></span>';

  /** Orbe con avatar en el centro (misma URL que cabecera) o núcleo luminoso por defecto */
  function orbHtmlForCfg(cfg) {
    var url = cfg.avatar && String(cfg.avatar).trim();
    if (url) {
      return (
        '<span class="afhub-fab-inner" aria-hidden="true"><span class="afhub-orb afhub-orb--avatar">' +
        '<span class="afhub-orb-avatar-halo" aria-hidden="true"></span>' +
        '<img class="afhub-orb-avatar-img" src="' + escapeAttr(url) + '" alt="" decoding="async">' +
        '<span class="afhub-orb-avatar-shine" aria-hidden="true"></span>' +
        '</span></span>'
      );
    }
    return ORB_HTML;
  }

  function hasFabAvatar(cfg) {
    return Boolean(cfg.avatar && String(cfg.avatar).trim());
  }

  function syncFabAvatarMode(fab, cfg) {
    if (hasFabAvatar(cfg)) fab.classList.add('afhub-fab--avatar');
    else fab.classList.remove('afhub-fab--avatar');
  }

  var AFHUB_FONT_STACK =
    'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

  var DEFAULTS = {
    agentId: '',
    /** Opcional: _id Mongo del widget (misma BD que Mis widgets); mejora la validación en la landing. */
    widgetId: '',
    token: '',
    host: '',
    color: '#6366f1',
    title: 'Asistente',
    subtitle: 'En linea',
    welcome: 'Bienvenido. ¿Cómo puedo ayudarte?',
    position: 'bottom-right',
    edgeInset: 20,
    offsetBottom: 20,
    offsetTop: 20,
    offsetLeft: null,
    offsetRight: null,
    avatar: '',
    borderRadius: 16,
    autoOpen: false,
    debug: false,
    timeoutMs: 60000,
    retries: 2,
    trackEvents: true,
    theme: 'light',
    orbLight: '',
    orbDeep: '',
    /** Habilita el botón de micrófono y modo voz continuo */
    voiceEnabled: true,
    /** Idioma BCP-47 para STT/TTS, por defecto detecta del navegador */
    voiceLang: '',
    /** Nombre exacto de la voz SpeechSynthesis; vacío = auto */
    voiceName: '',
    /** WhatsApp: dígitos con código de país; oferta por palabras clave en el chat */
    humanSupportPhone: '',
    humanSupportEnabled: true,
    /** Botón «Hablar con una persona» y formulario de escalación */
    handoffEnabled: true,
    /** Minutos sin respuesta del agente antes de ofrecer WhatsApp. 0 = sin límite. */
    handoffTimeout: 5,
    /** Encuesta de satisfacción al final de la conversación */
    feedbackEnabled: false,
    feedbackTitle: '¿Cómo fue tu experiencia?',
    feedbackThanks: '¡Gracias por tu feedback!',
    feedbackQuestions: [],
    /** Minutos de inactividad para finalizar la conversación. 0 = off. */
    conversationIdleTimeout: 15,
    /** Aviso de privacidad en el pie del chat (configurable por widget). */
    policyEnabled: true,
    policyText: '', // texto opcional antes del enlace; vacío = solo el enlace
    policyLinkLabel: 'Política de Privacidad',
    policyUrl: '',
    /** Si true: chips MCP / tools y notas técnicas de HubSpot en burbujas (vista previa o data-show-mcp-ui). Producción: false. */
    showMcpUi: false,
    /** Arrastrar el orbe (FAB) para fijar posición; se recuerda en sessionStorage por agente/widget. */
    fabDraggable: true,
    fabDismissible: true,
    /** Si false, el chat se muestra pero no acepta mensajes (widget desactivado en el panel). */
    active: true,
    onOpen: null,
    onClose: null,
    onMessageSent: null,
    onMessageReceived: null,
    onError: null,
    /**
     * Layout inicial al abrir el widget.
     * ''                  → flotante compacto (default)
     * 'sidebar'           → barra lateral compacta
     * 'sidebar-full'      → barra lateral ancha
     * 'sidebar-fullscreen'→ pantalla completa
     */
    initialLayout: ''
  };

  /** Cuadrícula 9 posiciones (widget builder) → geometría del FAB embebido. */
  var POSITION_GRID = {
    'bottom-right': { v: 'bottom', h: 'right' },
    'bottom-left':  { v: 'bottom', h: 'left' },
    'bottom':       { v: 'bottom', h: 'center' },
    'top-right':    { v: 'top', h: 'right' },
    'top-left':     { v: 'top', h: 'left' },
    'top':          { v: 'top', h: 'center' },
    'left':         { v: 'middle', h: 'left' },
    'right':        { v: 'middle', h: 'right' },
    'center':       { v: 'middle', h: 'center' }
  };

  var VALID_POSITIONS = [
    'top-left', 'top', 'top-right',
    'left', 'center', 'right',
    'bottom-left', 'bottom', 'bottom-right',
    'custom'
  ];

  /**
   * Fetches widget config from the landing's /api/widget/config endpoint.
   * Calls callback(config) on success or callback(null) on timeout/error.
   */
  function fetchWidgetConfig(host, token, callback, timeoutMs) {
    var done = false;
    var ms = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 20000;
    var timer = setTimeout(function () {
      if (!done) { done = true; callback(null); }
    }, ms);
    try {
      var req = new XMLHttpRequest();
      req.open('GET', host + '/api/widget/config?token=' + encodeURIComponent(token), true);
      req.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (req.status === 200) {
          try { callback(JSON.parse(req.responseText)); } catch (_e) { callback(null); }
        } else {
          callback(null);
        }
      };
      req.onerror = function () { if (!done) { done = true; clearTimeout(timer); callback(null); } };
      req.send();
    } catch (_e) {
      if (!done) { done = true; clearTimeout(timer); callback(null); }
    }
  }

  /**
   * Async init path: only token provided (no agentId).
   * Fetches config from the server, then creates and mounts the widget.
   * Returns a proxy API immediately so callers can queue open/close/send calls.
   */
  function initDeferred(localInput) {
    var instanceId = 'afhub_' + (++INSTANCE_COUNT);
    var resolvedApi = null;
    var pending = [];

    function enqueue(c) { pending.push(c); }
    function flush() {
      var i;
      for (i = 0; i < pending.length; i++) {
        var c = pending[i];
        if (c[0] === 'open')  resolvedApi.open();
        else if (c[0] === 'close') resolvedApi.close();
        else if (c[0] === 'send')  resolvedApi.send(c[1]);
        else if (c[0] === 'newConversation') resolvedApi.newConversation();
      }
      pending = [];
    }

    var proxyApi = {
      id:       instanceId,
      open:     function ()  { if (resolvedApi) resolvedApi.open();    else enqueue(['open']); },
      close:    function ()  { if (resolvedApi) resolvedApi.close();   else enqueue(['close']); },
      send:     function (m) { if (resolvedApi) resolvedApi.send(m);   else enqueue(['send', m]); },
      newConversation: function () { if (resolvedApi) resolvedApi.newConversation(); else enqueue(['newConversation']); },
      destroy:  function ()  { if (resolvedApi) resolvedApi.destroy(); },
      getState: function ()  { return resolvedApi ? resolvedApi.getState() : { isOpen: false, isLoading: false }; }
    };

    var tempHost = String(localInput.host || '').trim() || getScriptOrigin() || window.location.origin;
    var token    = String(localInput.token || '').trim();
    var debug    = Boolean(localInput.debug);

    var fetchTimeoutMs = typeof localInput.configFetchTimeoutMs === 'number' ? localInput.configFetchTimeoutMs : 20000;

    // If the remote fetch fails but the embed carried enough inline config
    // (agentId present), render from inline config instead of failing silently.
    var hasInlineAgent = typeof localInput.agentId === 'string' && localInput.agentId.trim().length > 0;
    function onConfigFailed() {
      if (hasInlineAgent) finishInit({});
      else warnConfigFailed(tempHost, token, debug);
    }

    fetchWidgetConfig(tempHost, token, function (remoteCfg) {
      if (!remoteCfg) {
        var scriptHost = getScriptOrigin();
        if (scriptHost && scriptHost !== tempHost.replace(/\/$/, '')) {
          fetchWidgetConfig(scriptHost, token, function (retryCfg) {
            if (retryCfg) finishInit(retryCfg);
            else onConfigFailed();
          }, fetchTimeoutMs);
          return;
        }
        onConfigFailed();
        return;
      }
      finishInit(remoteCfg);
    }, fetchTimeoutMs);

    function warnConfigFailed(host, tok, dbg) {
      if (!dbg) return;
      console.warn(
        '[AgentFlowhub Widget] No se pudo obtener configuración remota. ' +
        'host=' + host + ' token=' + tok + '. ' +
        'Comprueba: (1) host apunta a la landing (ej. http://localhost:3201), no a AIBackHub (:9003); ' +
        '(2) CORS en el servidor; (3) token wt_ válido; (4) timeout — en dev la 1ª petición puede tardar ~20s (recarga la página).'
      );
    }

    function finishInit(remoteCfg) {
      // remote config is authoritative; localInput keys (callbacks, debug, host, etc.) override last
      var mergedInput = assign({}, remoteCfg, localInput);
      var cfg = normalizeConfig(mergedInput);
      var errors = validateConfig(cfg);
      if (errors.length) {
        if (debug) console.error('[AgentFlowhub Widget]', errors.join(' '));
        return;
      }
      var instance = createWidgetInstance(instanceId, cfg);
      INSTANCES[instanceId] = instance;
      resolvedApi = instance.api;
      flush();
    }

    return proxyApi;
  }

  function init(config) {
    var localInput = config || {};
    var hasToken   = typeof localInput.token === 'string' && localInput.token.indexOf('wt_') === 0;
    var hasAgentId = typeof localInput.agentId === 'string' && localInput.agentId.trim().length > 0;

    // Any embed with a token fetches the authoritative config from the server
    // (feedbackQuestions, conversationIdleTimeout, etc. only live there). Inline
    // values still override the remote config in finishInit. If the fetch fails
    // and we have an agentId, initDeferred falls back to the inline config.
    if (hasToken) {
      return initDeferred(localInput);
    }

    // Legacy / full-config embed without token: sync path (backward compatible)
    var cfg = normalizeConfig(localInput);
    var errors = validateConfig(cfg);
    if (errors.length) {
      log(cfg, 'error', errors.join(' '));
      throw new Error(errors.join(' '));
    }

    var instanceId = 'afhub_' + (++INSTANCE_COUNT);
    var instance = createWidgetInstance(instanceId, cfg);
    INSTANCES[instanceId] = instance;
    return instance.api;
  }

  function normalizeConfig(input) {
    var merged = assign({}, DEFAULTS, input || {});
    merged.host = merged.host || getScriptOrigin() || window.location.origin;
    merged.host = String(merged.host).replace(/\/$/, '');
    if (/:(9003)(\/|$)/.test(merged.host)) {
      log(merged, 'warn', 'host apunta a AIBackHub (:9003). Usa la URL de la landing (ej. http://localhost:3201 o tu dominio BotIvA).');
    }
    var pos = String(merged.position || 'bottom-right').toLowerCase();
    if (VALID_POSITIONS.indexOf(pos) === -1) {
      pos = 'bottom-right';
    }
    merged.position = pos;
    merged.edgeInset = Number(merged.edgeInset);
    if (!isFinite(merged.edgeInset)) merged.edgeInset = 20;
    merged.edgeInset = clamp(merged.edgeInset, 0, 160);
    if (merged.position === 'custom') {
      merged.offsetLeft = input && Object.prototype.hasOwnProperty.call(input, 'offsetLeft')
        ? parseOptNum(input.offsetLeft)
        : null;
      merged.offsetRight = input && Object.prototype.hasOwnProperty.call(input, 'offsetRight')
        ? parseOptNum(input.offsetRight)
        : null;
      merged.offsetTop = input && Object.prototype.hasOwnProperty.call(input, 'offsetTop')
        ? parseOptNum(input.offsetTop)
        : null;
      merged.offsetBottom = input && Object.prototype.hasOwnProperty.call(input, 'offsetBottom')
        ? parseOptNum(input.offsetBottom)
        : null;
    } else {
      merged.offsetBottom = Number(merged.offsetBottom);
      if (!isFinite(merged.offsetBottom)) merged.offsetBottom = 20;
      merged.offsetTop = Number(merged.offsetTop);
      if (!isFinite(merged.offsetTop)) merged.offsetTop = 20;
      merged.offsetLeft = null;
      merged.offsetRight = null;
    }
    merged.borderRadius = Number(merged.borderRadius);
    if (!Number.isFinite(merged.borderRadius)) merged.borderRadius = 16;
    merged.borderRadius = clamp(merged.borderRadius, 0, 32);
    merged.timeoutMs = Number(merged.timeoutMs);
    if (!Number.isFinite(merged.timeoutMs) || merged.timeoutMs < 1000) merged.timeoutMs = 60000;
    merged.retries = Number(merged.retries);
    if (!Number.isFinite(merged.retries) || merged.retries < 0) merged.retries = 2;
    merged.retries = Math.min(5, Math.floor(merged.retries));
    merged.active = input && input.active === false ? false : true;
    merged.trackEvents = input && Object.prototype.hasOwnProperty.call(input, 'trackEvents')
      ? Boolean(input.trackEvents)
      : true;
    merged.autoOpen = Boolean(merged.autoOpen);
    merged.debug = Boolean(merged.debug);
    merged.theme = merged.theme === 'dark' ? 'dark' : 'light';
    merged.fabHint = String(merged.fabHint == null ? '' : merged.fabHint).trim().substring(0, 200);
    merged.orbLight = String(merged.orbLight == null ? '' : merged.orbLight).trim();
    merged.orbDeep = String(merged.orbDeep == null ? '' : merged.orbDeep).trim();
    merged.widgetId = String(merged.widgetId == null ? '' : merged.widgetId).trim();
    merged.humanSupportPhone = String(merged.humanSupportPhone == null ? '' : merged.humanSupportPhone)
      .trim()
      .substring(0, 48);
    merged.humanSupportEnabled = input && input.humanSupportEnabled === false ? false : true;
    merged.handoffEnabled = input && input.handoffEnabled === false ? false : true;
    merged.handoffTimeout = (input && typeof input.handoffTimeout === 'number') ? Math.max(0, input.handoffTimeout) : 5;
    merged.feedbackEnabled = input && input.feedbackEnabled === true ? true : false;
    merged.feedbackTitle = String((input && input.feedbackTitle) || '¿Cómo fue tu experiencia?');
    merged.feedbackThanks = String((input && input.feedbackThanks) || '¡Gracias por tu feedback!');
    merged.feedbackQuestions = (input && Array.isArray(input.feedbackQuestions)) ? input.feedbackQuestions : [];
    merged.conversationIdleTimeout = (input && typeof input.conversationIdleTimeout === 'number') ? Math.max(0, input.conversationIdleTimeout) : 15;
    merged.showMcpUi = Boolean(merged.showMcpUi);
    merged.fabDraggable =
      input && Object.prototype.hasOwnProperty.call(input, 'fabDraggable')
        ? Boolean(input.fabDraggable)
        : true;
    merged.fabDismissible =
      input && Object.prototype.hasOwnProperty.call(input, 'fabDismissible')
        ? input.fabDismissible !== false
        : true;
    var validLayouts = ['', 'sidebar', 'sidebar-full', 'sidebar-fullscreen'];
    merged.initialLayout = validLayouts.indexOf(String(merged.initialLayout || '')) !== -1
      ? String(merged.initialLayout || '')
      : '';
    // Aviso de privacidad (footer del chat)
    merged.policyEnabled = input && input.policyEnabled === false ? false : true;
    merged.policyText = String(merged.policyText == null ? '' : merged.policyText).trim().substring(0, 200);
    merged.policyLinkLabel = String(merged.policyLinkLabel == null ? '' : merged.policyLinkLabel).trim().substring(0, 60);
    var policyUrl = String(merged.policyUrl == null ? '' : merged.policyUrl).trim();
    if (policyUrl && !/^[a-z][a-z0-9+.-]*:/i.test(policyUrl)) policyUrl = 'https://' + policyUrl;
    merged.policyUrl = /^https?:\/\//i.test(policyUrl) ? policyUrl.substring(0, 300) : '';
    return merged;
  }

  function launcherAlign(cfg) {
    if (cfg.position === 'custom') {
      var ol = cfg.offsetLeft;
      var or = cfg.offsetRight;
      if (ol != null && isFinite(ol) && (or == null || !isFinite(or))) return 'left';
      if (or != null && isFinite(or) && (ol == null || !isFinite(ol))) return 'right';
      return 'right';
    }
    var grid = POSITION_GRID[cfg.position];
    if (grid) return grid.h;
    return 'right';
  }

  function validateConfig(cfg) {
    var errors = [];
    if (!cfg.agentId || !String(cfg.agentId).trim()) {
      errors.push('[AgentFlowhub Widget] "agentId" es requerido.');
    }
    if (!isHexColor(cfg.color)) {
      errors.push('[AgentFlowhub Widget] "color" debe ser HEX (ej: #6366f1).');
    }
    if (!/^https?:\/\//.test(cfg.host)) {
      errors.push('[AgentFlowhub Widget] "host" debe iniciar con http:// o https://');
    }
    var ol = cfg.orbLight;
    var od = cfg.orbDeep;
    if (ol || od) {
      if (!ol || !od) {
        errors.push('[AgentFlowhub Widget] "orbLight" y "orbDeep" deben definirse juntos (o ninguno).');
      } else if (!isHexColor(ol) || !isHexColor(od)) {
        errors.push('[AgentFlowhub Widget] "orbLight" y "orbDeep" deben ser HEX (#rrggbb).');
      }
    }
    return errors;
  }

  function parseOptNum(v) {
    if (v === undefined || v === null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function chatPanelMaxWidth(vw) {
    return Math.min(380, Math.max(260, vw - 40));
  }

  /** Posición vertical/horizontal del root en modo custom (arrastre del FAB). */
  function applyCustomRootPosition(root, cfg) {
    var ot = cfg.offsetTop;
    var ob = cfg.offsetBottom;
    var ol = cfg.offsetLeft;
    var or = cfg.offsetRight;
    var hasTop = ot != null && isFinite(ot);
    var hasBottom = ob != null && isFinite(ob);
    var hasL = ol != null && isFinite(ol);
    var hasR = or != null && isFinite(or);

    if (hasTop) {
      root.style.top = ot + 'px';
      root.setAttribute('data-afhub-v', 'top');
    } else if (hasBottom) {
      root.style.bottom = ob + 'px';
      root.setAttribute('data-afhub-v', 'bottom');
    } else {
      root.style.bottom = '20px';
      root.setAttribute('data-afhub-v', 'bottom');
    }

    if (hasR && !hasL) {
      root.style.right = or + 'px';
      root.style.left = '';
    } else if (hasL) {
      root.style.left = ol + 'px';
      root.style.right = '';
    } else if (hasR) {
      root.style.right = or + 'px';
      root.style.left = '';
    } else {
      root.style.right = '20px';
      root.style.left = '';
    }
  }

  /** Evita que el panel quede cortado al arrastrar el FAB cerca del borde derecho/izquierdo. */
  function applyCustomChatAlign(root, chat, cfg) {
    var pad = 8;
    var vw = window.innerWidth || 320;
    var nw = Math.max(40, root.offsetWidth || 72);
    var chatW = chatPanelMaxWidth(vw);
    var ol = cfg.offsetLeft;
    var or = cfg.offsetRight;
    var hasL = ol != null && isFinite(ol);
    var hasR = or != null && isFinite(or);
    var fabLeft;
    var fabRight;

    if (hasR && !hasL) {
      fabRight = vw - or;
      fabLeft = fabRight - nw;
    } else if (hasL) {
      fabLeft = ol;
      fabRight = fabLeft + nw;
    } else {
      fabRight = vw - (hasR ? or : 20);
      fabLeft = fabRight - nw;
    }

    var spaceRight = Math.max(0, vw - pad - fabLeft);
    var spaceLeft = Math.max(0, fabRight - pad);
    var openLeft = spaceLeft >= chatW || (spaceLeft > spaceRight && spaceLeft >= 260);

    chat.style.width = '';
    if (openLeft) {
      chat.style.right = '0';
      chat.style.left = 'auto';
      root.setAttribute('data-afhub-h', 'right');
      if (spaceLeft < chatW) chat.style.width = Math.max(260, spaceLeft) + 'px';
    } else {
      chat.style.left = '0';
      chat.style.right = 'auto';
      root.setAttribute('data-afhub-h', 'left');
      if (spaceRight < chatW) chat.style.width = Math.max(260, spaceRight) + 'px';
    }
  }

  function applyWidgetGeometry(root, chat, cfg) {
    var pos = cfg.position;
    var inset = cfg.edgeInset;

    root.style.left = '';
    root.style.right = '';
    root.style.top = '';
    root.style.bottom = '';
    root.style.transform = '';
    root.style.width = '';

    chat.style.left = '';
    chat.style.right = '';
    chat.style.top = '';
    chat.style.bottom = '';
    chat.style.transform = '';
    chat.style.width = '';
    chat.style.marginTop = '';
    chat.style.marginBottom = '';

    if (pos === 'custom') {
      applyCustomRootPosition(root, cfg);
      applyCustomChatAlign(root, chat, cfg);
    } else {
      var grid = POSITION_GRID[pos] || POSITION_GRID['bottom-right'];
      var tx = '';
      var ty = '';

      if (grid.v === 'top') {
        root.style.top = cfg.offsetTop + 'px';
        root.setAttribute('data-afhub-v', 'top');
      } else if (grid.v === 'bottom') {
        root.style.bottom = cfg.offsetBottom + 'px';
        root.setAttribute('data-afhub-v', 'bottom');
      } else {
        root.style.top = '50%';
        ty = 'translateY(-50%)';
        root.setAttribute('data-afhub-v', 'bottom');
      }

      if (grid.h === 'left') {
        root.style.left = inset + 'px';
        chat.style.left = '0';
        chat.style.right = 'auto';
      } else if (grid.h === 'right') {
        root.style.right = inset + 'px';
        chat.style.right = '0';
        chat.style.left = 'auto';
      } else {
        root.style.left = '50%';
        tx = 'translateX(-50%)';
        root.style.width = '380px';
        chat.style.left = '0';
        chat.style.right = 'auto';
        chat.style.width = '380px';
      }

      root.style.transform = [tx, ty].filter(Boolean).join(' ') || '';
      root.setAttribute('data-afhub-h', grid.h);
    }

    if (root.getAttribute('data-afhub-v') === 'top') {
      chat.style.top = '100%';
      chat.style.marginTop = '12px';
      chat.style.bottom = 'auto';
    } else {
      chat.style.bottom = '100%';
      chat.style.marginBottom = '12px';
      chat.style.top = 'auto';
    }
  }

  function formatInlineOnlyEsc(esc) {
    var t = esc;
    t = t.replace(/`([^`]+)`/g, '<code class="afhub-code">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return t;
  }

  function formatParagraphsEsc(esc) {
    var blocks = esc.split(/\n\n+/);
    var html = '';
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b].trim();
      if (!block) continue;
      var lines = block.split('\n');
      var nonEmpty = lines.filter(function (l) {
        return l.trim();
      });
      var isList =
        nonEmpty.length > 0 &&
        nonEmpty.every(function (l) {
          return /^\s*[-*•]\s+/.test(l);
        });
      if (isList) {
        var items = '';
        for (var j = 0; j < nonEmpty.length; j++) {
          var item = nonEmpty[j].replace(/^\s*[-*•]\s+/, '');
          items += '<li>' + formatInlineOnlyEsc(item) + '</li>';
        }
        html += '<ul class="afhub-ul">' + items + '</ul>';
      } else {
        html += '<p class="afhub-p">' + formatInlineOnlyEsc(block.replace(/\n/g, '<br/>')) + '</p>';
      }
    }
    return html;
  }

  function formatBotHtml(raw) {
    var s = String(raw || '');
    var segments = s.split('```');
    var html = '';
    for (var i = 0; i < segments.length; i++) {
      if (i % 2 === 1) {
        var code = escapeHtml(segments[i].replace(/^\n|\n$/g, ''));
        html += '<pre class="afhub-pre"><code>' + code + '</code></pre>';
      } else {
        html += formatParagraphsEsc(escapeHtml(segments[i]));
      }
    }
    if (!html) html = '<p class="afhub-p">' + escapeHtml(s) + '</p>';
    return html;
  }

  function formatBotHtmlWrapped(raw) {
    return '<div class="afhub-msg-text">' + formatBotHtml(raw) + '</div>';
  }

  /** Texto visible del acceso rápido: mensaje completo (la etiqueta suele estar truncada en BD). */
  function shortcutDisplayText(sc) {
    var msg = String(sc && sc.message != null ? sc.message : '').trim();
    var lbl = String(sc && sc.label != null ? sc.label : '').trim();
    if (msg) return msg;
    return lbl;
  }

  /** Clave sessionStorage por widget — misma conversación mientras la pestaña siga abierta. */
  function chatSessionStorageKey(cfg) {
    var h = String(cfg.host || '')
      .replace(/^https?:\/\//i, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .slice(0, 48);
    var tok = String(cfg.token || 'notok').slice(0, 32);
    return 'afhub:chat-session:' + h + ':' + String(cfg.agentId || 'na') + ':' + String(cfg.widgetId || tok);
  }

  var CHAT_HISTORY_STORAGE_VER = 1;
  var CHAT_HISTORY_MAX_MESSAGES = 60;
  var CHAT_HISTORY_WARN_USER_TURNS = 35;
  var CHAT_LAST_IMAGE_MAX_CHARS = 120000;

  function chatHistoryStorageKey(cfg) {
    return chatSessionStorageKey(cfg) + ':hist';
  }

  function sanitizeHistoryEntries(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < CHAT_HISTORY_MAX_MESSAGES; i++) {
      var row = raw[i];
      if (!row || typeof row !== 'object') continue;
      var role = String(row.role || '').toLowerCase();
      var content = typeof row.content === 'string' ? row.content.trim() : '';
      if (!content) continue;
      if (role !== 'user' && role !== 'model') continue;
      out.push({ role: role, content: content.slice(0, 8000) });
    }
    return out;
  }

  function loadPersistedChatState(cfg, sessionId) {
    try {
      var raw = sessionStorage.getItem(chatHistoryStorageKey(cfg));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== CHAT_HISTORY_STORAGE_VER) return null;
      if (data.sessionId !== sessionId) return null;
      var lastImg =
        typeof data.lastGeneratedImageDataUrl === 'string' &&
        data.lastGeneratedImageDataUrl.length <= CHAT_LAST_IMAGE_MAX_CHARS
          ? data.lastGeneratedImageDataUrl
          : '';
      return {
        history: sanitizeHistoryEntries(data.history),
        lastGeneratedImageDataUrl: lastImg,
      };
    } catch (_e) {
      return null;
    }
  }

  function persistChatState(cfg, sessionId, historyArr, lastImage) {
    try {
      var payload = {
        v: CHAT_HISTORY_STORAGE_VER,
        sessionId: sessionId,
        at: Date.now(),
        history: sanitizeHistoryEntries(historyArr),
        lastGeneratedImageDataUrl:
          typeof lastImage === 'string' &&
          lastImage.length > 0 &&
          lastImage.length <= CHAT_LAST_IMAGE_MAX_CHARS
            ? lastImage
            : '',
      };
      sessionStorage.setItem(chatHistoryStorageKey(cfg), JSON.stringify(payload));
    } catch (_e) {
      /* quota / modo privado */
    }
  }

  function clearPersistedChatState(cfg) {
    try {
      sessionStorage.removeItem(chatHistoryStorageKey(cfg));
    } catch (_e) {
      /* noop */
    }
  }

  function getOrCreateChatSessionId(cfg) {
    var key = chatSessionStorageKey(cfg);
    try {
      var existing = sessionStorage.getItem(key);
      if (existing && /^sess_[a-zA-Z0-9_-]{8,120}$/.test(existing)) return existing;
      var sid = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem(key, sid);
      return sid;
    } catch (_e) {
      return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }
  }

  function rotateChatSessionId(cfg) {
    var key = chatSessionStorageKey(cfg);
    var sid = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    try {
      sessionStorage.setItem(key, sid);
    } catch (_e) {
      /* noop */
    }
    return sid;
  }

  function visitorStorageKey(cfg) {
    var h = String(cfg.host || '')
      .replace(/^https?:\/\//i, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .slice(0, 48);
    var tok = String(cfg.widgetId || cfg.token || cfg.agentId || 'na').slice(0, 32);
    return 'afhub:visitor:' + h + ':' + tok;
  }

  function getOrCreateVisitorId(cfg) {
    var key = visitorStorageKey(cfg);
    try {
      var existing = localStorage.getItem(key);
      if (existing && /^vis_[a-zA-Z0-9_-]{8,120}$/.test(existing)) return existing;
      var vid = 'vis_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
      localStorage.setItem(key, vid);
      return vid;
    } catch (_e) {
      return 'vis_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }
  }

  function countUserTurnsInHistory(arr) {
    if (!Array.isArray(arr)) return 0;
    var n = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].role === 'user') n++;
    }
    return n;
  }

  function maybeWarnLongConversation(cfg, turns) {
    if (turns < CHAT_HISTORY_WARN_USER_TURNS) return;
    try {
      var warnKey = chatSessionStorageKey(cfg) + ':long-warn';
      if (sessionStorage.getItem(warnKey) === '1') return;
      sessionStorage.setItem(warnKey, '1');
    } catch (_e) {
      /* noop */
    }
    addMessage(
      'bot',
      'Esta conversación es larga. Para mejores respuestas, usa «Nueva conversación» (icono arriba) y empieza de cero.',
    );
  }

  function imageExtFromMime(mime, url) {
    var m = (mime && String(mime).toLowerCase()) || '';
    if (m.indexOf('jpeg') >= 0 || m.indexOf('jpg') >= 0) return 'jpg';
    if (m.indexOf('webp') >= 0) return 'webp';
    if (m.indexOf('gif') >= 0) return 'gif';
    if (m.indexOf('png') >= 0) return 'png';
    if (typeof url === 'string' && /^data:image\/([^;]+);/i.test(url)) {
      var mm = /^data:image\/([^;]+);/i.exec(url);
      if (mm && mm[1]) return mm[1] === 'jpeg' ? 'jpg' : mm[1];
    }
    return 'png';
  }

  function imageDownloadFileName(index, mime, url) {
    return 'agentflow-imagen-' + (index + 1) + '.' + imageExtFromMime(mime, url);
  }

  function triggerImageDownload(url, fileName) {
    if (/^data:image\//i.test(url)) {
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        return r.blob();
      })
      .then(function (blob) {
        var obj = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = obj;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(obj);
      })
      .catch(function () {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
  }

  /** Botón circular minimalista (mismo estilo que copiar texto). */
  function createImageDownloadButton(url, fileName) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'afhub-msg-copy-btn afhub-img-download-btn';
    btn.setAttribute('aria-label', 'Descargar imagen');
    btn.textContent = '↓';
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      triggerImageDownload(url, fileName);
    });
    return btn;
  }

  function appendGeneratedImage(wrap, url, item, index) {
    var frame = document.createElement('div');
    frame.className = 'afhub-img-frame';
    var im = document.createElement('img');
    im.className = 'afhub-widget-img';
    im.alt = 'Imagen generada';
    im.loading = 'lazy';
    im.referrerPolicy = 'no-referrer';
    im.src = url;
    frame.appendChild(im);
    var fname = imageDownloadFileName(index, item && item.mimeType, url);
    var dlBtn = createImageDownloadButton(url, fname);
    frame.appendChild(dlBtn);
    wrap.appendChild(frame);
  }

  function createWidgetInstance(id, cfg) {
    var rootId = 'afhub-widget-root-' + id;
    var typingId = 'afhub-typing-' + id;
    var typingTimerHandle = null;
    var typingStartedAt = 0;
    var isOpen = false;
    var isLoading = false;
    var widgetDisabled = cfg.active === false;
    var DISABLED_MSG = 'Este chat está desactivado temporalmente. Vuelve más tarde.';
    var chatLayout = 'floating';
    var sidebarSize = 'compact';
    if (cfg.initialLayout === 'sidebar-fullscreen') {
      chatLayout = 'sidebar'; sidebarSize = 'fullscreen';
    } else if (cfg.initialLayout === 'sidebar-full') {
      chatLayout = 'sidebar'; sidebarSize = 'full';
    } else if (cfg.initialLayout === 'sidebar') {
      chatLayout = 'sidebar'; sidebarSize = 'compact';
    }
    var suppressFabClick = false;
    var fabDrag = null;
    var history = [];
    var chatSessionId = getOrCreateChatSessionId(cfg);
    var persistedChat = loadPersistedChatState(cfg, chatSessionId);
    if (persistedChat) {
      history = persistedChat.history;
    }
    var historyDomReady = false;
    var resolvedAgentId = null;
    var lastGeneratedImageDataUrl = persistedChat ? persistedChat.lastGeneratedImageDataUrl || '' : '';
    var pendingAttachment = null;
    var pendingHumanAttachments = []; // adjuntos del visitante para el agente (modo humano)
    var lastSessionImageUrls = [];

    function saveChatToSession() {
      persistChatState(cfg, chatSessionId, history, lastGeneratedImageDataUrl);
    }

    function renderHistoryToDom() {
      if (historyDomReady) return;
      historyDomReady = true;
      messages.innerHTML = '';
      if (widgetDisabled) {
        addMessage('bot', DISABLED_MSG);
        return;
      }
      if (!history.length) {
        addMessage('bot', cfg.welcome);
        return;
      }
      for (var hi = 0; hi < history.length; hi++) {
        var entry = history[hi];
        if (entry.role === 'user') addMessage('user', entry.content);
        else if (entry.role === 'model') addMessage('bot', entry.content);
      }
    }

    var root = document.createElement('div');
    root.id = rootId;
    root.style.position = 'fixed';
    root.style.zIndex = String(2147483000 + INSTANCE_COUNT);
    root.style.fontFamily = AFHUB_FONT_STACK;
    root.setAttribute('data-afhub-theme', cfg.theme);

    var styleEl = document.createElement('style');
    styleEl.textContent = cssForRoot(rootId, cfg);
    root.appendChild(styleEl);

    var launcher = document.createElement('div');
    launcher.className = 'afhub-launcher';
    if (cfg.fabHint) {
      var hintWrap = document.createElement('div');
      hintWrap.className = 'afhub-fab-hint-wrap';
      var hintFloat = document.createElement('div');
      hintFloat.className = 'afhub-fab-hint-float';
      var hintEl = document.createElement('div');
      hintEl.className = 'afhub-fab-hint';
      hintEl.setAttribute('role', 'note');
      hintEl.textContent = cfg.fabHint;
      hintFloat.appendChild(hintEl);
      hintWrap.appendChild(hintFloat);
      launcher.appendChild(hintWrap);
    }

    var fabWrap = document.createElement('div');
    fabWrap.className = 'afhub-fab-wrap';
    var launcherDismiss = null;
    if (cfg.fabDismissible !== false) {
      launcherDismiss = document.createElement('button');
      launcherDismiss.className = 'afhub-launcher-dismiss afhub-launcher-dismiss--orb';
      launcherDismiss.type = 'button';
      launcherDismiss.setAttribute('aria-label', 'Ocultar asistente');
      launcherDismiss.title = 'Ocultar asistente';
      launcherDismiss.innerHTML = '&#215;';
      fabWrap.appendChild(launcherDismiss);
    }

    var fab = document.createElement('button');
    fab.className = 'afhub-fab';
    fab.innerHTML = orbHtmlForCfg(cfg);
    syncFabAvatarMode(fab, cfg);
    fab.setAttribute('aria-label', 'Abrir chat');
    fabWrap.appendChild(fab);
    launcher.appendChild(fabWrap);
    root.appendChild(launcher);

    var chat = document.createElement('div');
    chat.className = 'afhub-chat';

    var header = document.createElement('div');
    header.className = 'afhub-header';

    var avatarEl = document.createElement('div');
    avatarEl.className = 'afhub-avatar';
    avatarEl.innerHTML = cfg.avatar ? ('<img src="' + escapeAttr(cfg.avatar) + '" alt="avatar">') : ICON_BOT;
    header.appendChild(avatarEl);

    var headerInfo = document.createElement('div');
    headerInfo.className = 'afhub-header-info';
    headerInfo.innerHTML = '<h3>' + escapeHtml(cfg.title) + '</h3><p>' + escapeHtml(cfg.subtitle) + ' <span class="afhub-status-bullet" aria-hidden="true">•</span> En línea</p>';
    header.appendChild(headerInfo);

    function humanWaDigits() {
      return String(cfg.humanSupportPhone || '').replace(/\D/g, '');
    }

    /** Normaliza tildes para buscar palabras clave (ES5). */
    function normalizeForHumanKeywords(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/á/g, 'a')
        .replace(/é/g, 'e')
        .replace(/í/g, 'i')
        .replace(/ó/g, 'o')
        .replace(/ú/g, 'u')
        .replace(/ü/g, 'u')
        .replace(/ñ/g, 'n');
    }

    /** True si el usuario pide persona / humano / atención humana, etc. */
    function messageAsksForHumanAgent(userText) {
      var hay = normalizeForHumanKeywords(userText);
      if (!hay || !hay.trim()) return false;
      var keys = [
        'persona',
        'humano',
        'humana',
        'atencion humana',
        'agente humano',
        'hablar con alguien',
        'operador',
        'operadora',
        'asesor humano',
        'atencion de persona',
        'persona real',
        'quiero un humano',
        'necesito un humano',
        'me comunico con humano',
        'atencion personal',
        'hablar con persona',
        'con una persona',
        'del equipo humano',
        'un humano',
        'una persona'
      ];
      var i;
      for (i = 0; i < keys.length; i++) {
        if (hay.indexOf(keys[i]) !== -1) return true;
      }
      return false;
    }

    /** Oferta WhatsApp solo dentro del chat, si está habilitado, hay número y palabras clave. */
    function appendHumanSupportOfferInChat(userText) {
      if (cfg.humanSupportEnabled === false) return;
      var digits = humanWaDigits();
      if (digits.length < 8) return;
      if (!messageAsksForHumanAgent(userText)) return;
      var row = document.createElement('div');
      row.className = 'afhub-msg afhub-persona-offer';
      row.setAttribute('role', 'status');
      var inner = document.createElement('div');
      inner.className = 'afhub-persona-offer-inner';
      var hint = document.createElement('span');
      hint.className = 'afhub-persona-offer-hint';
      hint.textContent = 'Si prefieres atención inmediata, puedes escribirnos por WhatsApp.';
      var a = document.createElement('a');
      a.className = 'afhub-persona-tag';
      a.href = 'https://wa.me/' + digits;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'WhatsApp';
      a.title = 'Abrir WhatsApp';
      inner.appendChild(hint);
      inner.appendChild(document.createTextNode(' '));
      inner.appendChild(a);
      row.appendChild(inner);
      messages.appendChild(row);
      messages.scrollTop = messages.scrollHeight;
    }

    var headerActions = document.createElement('div');
    headerActions.className = 'afhub-header-actions';

    var layoutBtn = document.createElement('button');
    layoutBtn.className = 'afhub-header-icon-btn';
    layoutBtn.setAttribute('type', 'button');
    layoutBtn.innerHTML = ICON_SIDEBAR_DOCK;
    layoutBtn.setAttribute('aria-label', 'Anclar como barra lateral');
    layoutBtn.title = 'Anclar como barra lateral';

    var expandBtn = document.createElement('button');
    expandBtn.className = 'afhub-header-icon-btn';
    expandBtn.setAttribute('type', 'button');
    expandBtn.style.display = 'none';
    expandBtn.innerHTML = ICON_SIDEBAR_WIDE;
    expandBtn.setAttribute('aria-label', 'Ampliar barra');
    expandBtn.title = 'Ampliar barra';

    /** Botón de Ajustes (kebab) + dropdown */
    var settingsWrap = document.createElement('div');
    settingsWrap.className = 'afhub-settings-wrap';

    var settingsBtn = document.createElement('button');
    settingsBtn.className = 'afhub-header-icon-btn afhub-settings-btn';
    settingsBtn.setAttribute('type', 'button');
    settingsBtn.innerHTML = ICON_KEBAB;
    settingsBtn.setAttribute('aria-label', 'Ajustes');
    settingsBtn.title = 'Ajustes';

    var voiceMenuAvailable =
      cfg.voiceEnabled !== false && typeof window !== 'undefined' && window.speechSynthesis;
    var settingsMenuHtml =
      '<button type="button" class="afhub-settings-item afhub-settings-new-chat">' +
        ICON_NEW_CHAT +
        '<span>Nueva conversación</span>' +
      '</button>';
    if (voiceMenuAvailable) {
      settingsMenuHtml +=
        '<button type="button" class="afhub-settings-item afhub-settings-speaker">' +
          ICON_VOLUME_OFF +
          '<span>Lectura en voz alta</span>' +
        '</button>';
    }
    settingsMenuHtml +=
      '<button type="button" class="afhub-settings-item afhub-settings-clear">' +
        ICON_TRASH +
        '<span>Borrar conversación</span>' +
      '</button>';

    var settingsMenu = document.createElement('div');
    settingsMenu.className = 'afhub-settings-menu';
    settingsMenu.style.display = 'none';
    settingsMenu.innerHTML = settingsMenuHtml;

    // "Nueva conversación" ahora vive en el menú de ajustes (no en el header).
    // Conservamos esta referencia para poder deshabilitarla mientras el bot responde.
    var newChatBtn = settingsMenu.querySelector('.afhub-settings-new-chat');

    settingsWrap.appendChild(settingsBtn);
    settingsWrap.appendChild(settingsMenu);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'afhub-close-btn';
    closeBtn.innerHTML = ICON_X;
    closeBtn.setAttribute('aria-label', 'Cerrar chat');
    closeBtn.setAttribute('type', 'button');

    var speakerMenuItem = voiceMenuAvailable
      ? settingsMenu.querySelector('.afhub-settings-speaker')
      : null;

    headerActions.appendChild(layoutBtn);
    headerActions.appendChild(expandBtn);
    headerActions.appendChild(settingsWrap);
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);
    chat.appendChild(header);

    var messages = document.createElement('div');
    messages.className = 'afhub-messages';
    chat.appendChild(messages);

    // Shortcuts collapsible section (above input area)
    var shortcutsBar = null;
    if (cfg.shortcuts && cfg.shortcuts.length > 0) {
      var shortcutsWrap = document.createElement('div');
      shortcutsWrap.className = 'afhub-shortcuts-wrap';

      var shortcutsToggle = document.createElement('button');
      shortcutsToggle.className = 'afhub-shortcuts-toggle';
      shortcutsToggle.type = 'button';
      shortcutsToggle.innerHTML =
        '<span class="afhub-shortcuts-toggle-label">Accesos rápidos</span>' +
        '<span class="afhub-shortcuts-toggle-chevron">‹</span>';

      shortcutsBar = document.createElement('div');
      shortcutsBar.className = 'afhub-shortcuts';

      cfg.shortcuts.forEach(function(sc) {
        var pill = document.createElement('button');
        pill.className = 'afhub-shortcut-pill';
        pill.type = 'button';
        var iconSpan = document.createElement('span');
        iconSpan.className = 'afhub-pill-icon';
        iconSpan.textContent = sc.emoji || '💬';
        var textSpan = document.createElement('span');
        textSpan.className = 'afhub-pill-text';
        var scText = shortcutDisplayText(sc);
        textSpan.textContent = scText;
        textSpan.title = scText;
        var arrowSpan = document.createElement('span');
        arrowSpan.className = 'afhub-pill-arrow';
        arrowSpan.textContent = '›';
        pill.appendChild(iconSpan);
        pill.appendChild(textSpan);
        pill.appendChild(arrowSpan);
        pill.addEventListener('click', function() {
          if (widgetDisabled) return;
          input.value = sc.message || sc.label || '';
          input.dispatchEvent(new Event('input'));
          send();
        });
        shortcutsBar.appendChild(pill);
      });

      var scOpen = false;
      shortcutsBar.style.display = 'none';
      shortcutsToggle.querySelector('.afhub-shortcuts-toggle-chevron').style.transform = 'rotate(90deg)';
      shortcutsToggle.addEventListener('click', function() {
        scOpen = !scOpen;
        shortcutsBar.style.display = scOpen ? 'flex' : 'none';
        shortcutsToggle.querySelector('.afhub-shortcuts-toggle-chevron').style.transform =
          scOpen ? 'rotate(0deg)' : 'rotate(90deg)';
      });

      shortcutsWrap.appendChild(shortcutsToggle);
      shortcutsWrap.appendChild(shortcutsBar);
      chat.appendChild(shortcutsWrap);
    }

    var inputArea = document.createElement('div');
    inputArea.className = 'afhub-input-area';

    var attachPreview = document.createElement('div');
    attachPreview.className = 'afhub-attach-preview';
    attachPreview.style.display = 'none';

    var attachBtn = null;
    var attachInput = null;
    if (cfg.imageUploadEnabled !== false) {
      attachInput = document.createElement('input');
      attachInput.type = 'file';
      // Imágenes para el asistente; además video/documentos cuando se habla con un agente.
      attachInput.accept = 'image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';
      attachInput.className = 'afhub-attach-input';
      attachInput.setAttribute('aria-hidden', 'true');
      attachInput.tabIndex = -1;
      inputArea.appendChild(attachInput);

      attachBtn = document.createElement('button');
      attachBtn.className = 'afhub-attach';
      attachBtn.innerHTML = ICON_ATTACH;
      attachBtn.type = 'button';
      attachBtn.setAttribute('aria-label', 'Adjuntar captura');
      attachBtn.setAttribute('title', 'Adjuntar captura');
      inputArea.appendChild(attachBtn);
    }

    var input = document.createElement('textarea');
    input.className = 'afhub-input';
    input.placeholder = 'Escribe un mensaje...';
    input.rows = 1;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'true');
    inputArea.appendChild(input);

    // Voice mic button (solo si el navegador soporta Web Speech API)
    var micBtn = null;
    var voiceBar = null;
    var hasSpeechAPI = typeof window !== 'undefined' &&
      (typeof window.SpeechRecognition !== 'undefined' || typeof window.webkitSpeechRecognition !== 'undefined');
    if (cfg.voiceEnabled !== false && hasSpeechAPI) {
      micBtn = document.createElement('button');
      micBtn.className = 'afhub-mic';
      micBtn.innerHTML = ICON_MIC;
      micBtn.setAttribute('aria-label', 'Activar voz');
      micBtn.setAttribute('type', 'button');
      inputArea.appendChild(micBtn);

      // Voice status bar (oculta por defecto) — insertar *después* de que inputArea sea hijo de chat
      voiceBar = document.createElement('div');
      voiceBar.className = 'afhub-voice-bar';
      voiceBar.innerHTML =
        '<span class="afhub-voice-dot"></span>' +
        '<span class="afhub-voice-label">Escuchando...</span>' +
        '<button class="afhub-voice-stop" type="button" aria-label="Detener voz">Detener</button>';
    }

    var sendBtn = document.createElement('button');
    sendBtn.className = 'afhub-send';
    sendBtn.innerHTML = ICON_SEND;
    sendBtn.disabled = true;
    sendBtn.setAttribute('aria-label', 'Enviar');
    inputArea.appendChild(sendBtn);
    chat.appendChild(attachPreview);
    chat.appendChild(inputArea);
    if (widgetDisabled) {
      input.disabled = true;
      input.placeholder = 'Chat desactivado';
      sendBtn.disabled = true;
      if (micBtn) micBtn.disabled = true;
      if (attachBtn) attachBtn.disabled = true;
      inputArea.classList.add('afhub-input-area--disabled');
    }
    if (voiceBar) {
      chat.insertBefore(voiceBar, inputArea);
    }

    // Barra de acciones compacta: "Hablar con una persona" (chip en una sola fila).
    var actionBar = document.createElement('div');
    actionBar.className = 'afhub-action-bar';
    var handoffBtn = document.createElement('button');
    handoffBtn.className = 'afhub-action-btn';
    handoffBtn.type = 'button';
    handoffBtn.textContent = 'Hablar con una persona';
    handoffBtn.setAttribute('aria-label', 'Solicitar atención humana');
    if (cfg.handoffEnabled !== false) {
      actionBar.appendChild(handoffBtn);
    }

    var handoffOverlay = document.createElement('div');
    handoffOverlay.className = 'afhub-handoff-overlay';
    handoffOverlay.innerHTML =
      '<div class="afhub-handoff-modal" role="dialog" aria-labelledby="afhub-handoff-title">' +
      '<h4 id="afhub-handoff-title">Atención personalizada</h4>' +
      '<p class="afhub-handoff-desc">Déjanos tus datos y te contactaremos lo antes posible.</p>' +
      '<label>Nombre<input class="afhub-handoff-input" name="name" type="text" placeholder="Tu nombre" autocomplete="name"></label>' +
      '<label>Email<input class="afhub-handoff-input" name="email" type="email" placeholder="correo@ejemplo.com" autocomplete="email"></label>' +
      '<label>Teléfono<input class="afhub-handoff-input" name="phone" type="tel" placeholder="+34 600 000 000" autocomplete="tel"></label>' +
      '<label>Mensaje (opcional)<textarea class="afhub-handoff-input afhub-handoff-textarea" name="message" rows="2" placeholder="¿En qué podemos ayudarte?"></textarea></label>' +
      '<p class="afhub-handoff-error" style="display:none"></p>' +
      '<div class="afhub-handoff-actions">' +
      '<button type="button" class="afhub-handoff-cancel">Cancelar</button>' +
      '<button type="button" class="afhub-handoff-submit">Enviar solicitud</button>' +
      '</div></div>';
    chat.appendChild(handoffOverlay);

    // ── Encuesta de satisfacción (inline dentro del chat, no popup) ──
    var feedbackCard = null;        // tarjeta de encuesta activa en el flujo de mensajes (o null)
    var feedbackOnDone = null;
    var feedbackOfferShown = false; // botón "Calificar" por intención de cierre (1 vez por sesión)
    var feedbackQs = (cfg.feedbackEnabled && Array.isArray(cfg.feedbackQuestions))
      ? cfg.feedbackQuestions.filter(function (q) { return q && q.enabled !== false && q.text; })
      : [];

    // Añadir la barra de acciones solo si tiene al menos un botón visible.
    if (actionBar.childNodes.length) {
      chat.appendChild(actionBar);
    }

    // ── Aviso de privacidad / política (footer, siempre visible si está activo) ──
    if (cfg.policyEnabled !== false && (cfg.policyText || cfg.policyLinkLabel)) {
      var policyBar = document.createElement('div');
      policyBar.className = 'afhub-policy';
      if (cfg.policyText) {
        policyBar.appendChild(document.createTextNode(cfg.policyText + (cfg.policyLinkLabel ? ' ' : '')));
      }
      if (cfg.policyLinkLabel) {
        var policyLinkEl;
        if (cfg.policyUrl) {
          policyLinkEl = document.createElement('a');
          policyLinkEl.href = cfg.policyUrl;          // ya saneado a http(s) en normalizeConfig
          policyLinkEl.target = '_blank';
          policyLinkEl.rel = 'noopener noreferrer';
        } else {
          policyLinkEl = document.createElement('span');
        }
        policyLinkEl.className = 'afhub-policy-link';
        policyLinkEl.textContent = cfg.policyLinkLabel;
        policyBar.appendChild(policyLinkEl);
      }
      chat.appendChild(policyBar);
    }

    var powered = document.createElement('div');
    powered.className = 'afhub-powered';
    powered.innerHTML = 'Powered by <a href="https://botiva.space" target="_blank" rel="noopener">BotIvA</a>';
    chat.appendChild(powered);

    root.appendChild(chat);
    var scrim = document.createElement('div');
    scrim.className = 'afhub-scrim';
    scrim.addEventListener('click', function() {
      sidebarSize = 'compact';
      syncChatPanelLayout();
    });
    document.body.appendChild(scrim);
    document.body.appendChild(root);

    function clearChatInlineLayout() {
      chat.style.position = '';
      chat.style.top = '';
      chat.style.bottom = '';
      chat.style.left = '';
      chat.style.right = '';
      chat.style.transform = '';
      chat.style.width = '';
      chat.style.maxWidth = '';
      chat.style.height = '';
      chat.style.maxHeight = '';
      chat.style.minHeight = '';
      chat.style.marginTop = '';
      chat.style.marginBottom = '';
      chat.style.zIndex = '';
      chat.style.borderRadius = '';
    }

    function syncChatPanelLayout() {
      root.classList.toggle('afhub-root--sidebar', chatLayout === 'sidebar');
      chat.classList.toggle('afhub-chat--sidebar', chatLayout === 'sidebar');

      if (chatLayout === 'floating') {
        clearChatInlineLayout();
        applyWidgetGeometry(root, chat, cfg);
        layoutBtn.innerHTML = ICON_SIDEBAR_DOCK;
        layoutBtn.setAttribute('aria-label', 'Anclar como barra lateral');
        layoutBtn.title = 'Anclar como barra lateral';
        expandBtn.style.display = 'none';
        expandBtn.innerHTML = ICON_SIDEBAR_WIDE;
        expandBtn.setAttribute('aria-label', 'Ampliar barra');
        expandBtn.title = 'Ampliar barra';
      } else {
        var dockLeft = launcherAlign(cfg) === 'left';
        var br = Number(cfg.borderRadius);
        if (!isFinite(br) || br < 0) br = 16;

        clearChatInlineLayout();
        chat.style.position = 'fixed';
        chat.style.top = '0';
        chat.style.bottom = '0';
        chat.style.marginTop = '0';
        chat.style.marginBottom = '0';
        chat.style.zIndex = '10';
        chat.style.maxHeight = 'none';
        var useDvh =
          typeof CSS !== 'undefined' && CSS.supports && CSS.supports('height', '100dvh');
        if (useDvh) {
          chat.style.height = '100dvh';
          chat.style.minHeight = '100dvh';
        } else {
          chat.style.height = '100vh';
          chat.style.minHeight = '100vh';
        }

        if (dockLeft) {
          chat.style.left = '0';
          chat.style.right = 'auto';
          chat.style.borderRadius = '0 ' + br + 'px ' + br + 'px 0';
        } else {
          chat.style.right = '0';
          chat.style.left = 'auto';
          chat.style.borderRadius = br + 'px 0 0 ' + br + 'px';
        }

        if (sidebarSize === 'compact') {
          chat.style.width = 'min(380px, 100vw)';
          chat.style.maxWidth = 'min(380px, 100vw)';
        } else if (sidebarSize === 'full') {
          chat.style.width = 'min(720px, calc(100vw - 16px))';
          chat.style.maxWidth = 'min(720px, calc(100vw - 16px))';
        } else {
          // fullscreen — cubre toda la pantalla
          chat.style.width = '100vw';
          chat.style.maxWidth = '100vw';
          chat.style.left = '0';
          chat.style.right = '0';
          chat.style.borderRadius = '0';
        }

        scrim.style.display = sidebarSize === 'fullscreen' ? 'block' : 'none';

        layoutBtn.innerHTML = ICON_POPOUT_CHAT;
        layoutBtn.setAttribute('aria-label', 'Volver a ventana flotante');
        layoutBtn.title = 'Volver a ventana flotante';
        expandBtn.style.display = '';
        if (sidebarSize === 'compact') {
          expandBtn.innerHTML = ICON_SIDEBAR_WIDE;
          expandBtn.setAttribute('aria-label', 'Ampliar barra');
          expandBtn.title = 'Ampliar barra';
        } else if (sidebarSize === 'full') {
          expandBtn.innerHTML = ICON_FULLSCREEN;
          expandBtn.setAttribute('aria-label', 'Pantalla completa');
          expandBtn.title = 'Pantalla completa';
        } else {
          expandBtn.innerHTML = ICON_SIDEBAR_NARROW;
          expandBtn.setAttribute('aria-label', 'Vista compacta');
          expandBtn.title = 'Vista compacta';
        }
      }

      if (chatLayout === 'floating') scrim.style.display = 'none';
    }

    function fabDragStorageKey() {
      var h = String(cfg.host || '')
        .replace(/^https?:\/\//i, '')
        .replace(/[^a-z0-9]+/gi, '_')
        .slice(0, 48);
      return 'afhub-fab-pos:' + h + ':' + String(cfg.agentId || 'na') + ':' + String(cfg.widgetId || id);
    }

    function launcherHiddenStorageKey() {
      return fabDragStorageKey().replace('afhub-fab-pos:', 'afhub-launcher-hidden:');
    }

    /** Elimina claves legacy de ocultar launcher (SDK antiguo; assist.js renombra afhub→biv en build). */
    function clearLegacyLauncherHiddenSessionKeys() {
      var fixed = ['afhub-launcher-menu-hidden'];
      var prefixes = ['afhub-launcher-hidden:'];
      try {
        for (var f = 0; f < fixed.length; f++) {
          sessionStorage.removeItem(fixed[f]);
        }
        for (var i = sessionStorage.length - 1; i >= 0; i--) {
          var key = sessionStorage.key(i);
          if (!key) continue;
          for (var p = 0; p < prefixes.length; p++) {
            if (key.indexOf(prefixes[p]) === 0) {
              sessionStorage.removeItem(key);
              break;
            }
          }
        }
        sessionStorage.removeItem(launcherHiddenStorageKey());
      } catch (_cl) { /* noop */ }
    }

    function syncLauncherMenuHiddenFlag(hidden) {
      // No persistir este estado en storage: solo notificar en memoria por evento.
      try {
        window.dispatchEvent(
          new CustomEvent('afhub:launcher-visibility', { detail: { hidden: hidden === true } })
        );
      } catch (_ev) { /* noop */ }
    }

    function hideLauncher(persist) {
      if (isOpen) close();
      root.classList.add('afhub-launcher-hidden');
      // No persistimos el cierre del launcher para que reaparezca en cada recarga.
      if (persist !== false) syncLauncherMenuHiddenFlag(true);
      emitEvent('launcher_hidden');
    }

    function showLauncher(persist) {
      root.classList.remove('afhub-launcher-hidden');
      if (persist !== false) {
        try {
          sessionStorage.removeItem(launcherHiddenStorageKey());
        } catch (_ls) { /* noop */ }
        syncLauncherMenuHiddenFlag(false);
      }
      emitEvent('launcher_shown');
    }

    function restoreLauncherHiddenFromSession() {
      clearLegacyLauncherHiddenSessionKeys();
      root.classList.remove('afhub-launcher-hidden');
      if (cfg.fabDismissible === false) return;
      syncLauncherMenuHiddenFlag(false);
    }

    function onShowLauncherRequest() {
      showLauncher(true);
    }
    window.addEventListener('afhub:show-launcher', onShowLauncherRequest);

    function restoreFabDragFromSession() {
      if (!cfg.fabDraggable) return;
      /** No pisar `position: "custom"` fijado por init() / embed. */
      if (cfg.position === 'custom') return;
      try {
        var raw = sessionStorage.getItem(fabDragStorageKey());
        if (!raw) return;
        var o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return;
        if (typeof o.r === 'number' && isFinite(o.r)) {
          cfg.offsetRight = Math.round(o.r);
          cfg.offsetLeft = null;
        } else if (typeof o.l === 'number' && isFinite(o.l)) {
          cfg.offsetLeft = Math.round(o.l);
          cfg.offsetRight = null;
        } else {
          return;
        }
        cfg.position = 'custom';
        if (typeof o.b === 'number' && isFinite(o.b)) {
          cfg.offsetBottom = Math.round(o.b);
          cfg.offsetTop = null;
        } else if (typeof o.t === 'number' && isFinite(o.t)) {
          cfg.offsetTop = Math.round(o.t);
          cfg.offsetBottom = null;
        } else {
          return;
        }
      } catch (_e) {
        /* noop */
      }
    }

    function persistFabDragToSession() {
      if (!cfg.fabDraggable || cfg.position !== 'custom') return;
      try {
        sessionStorage.setItem(
          fabDragStorageKey(),
          JSON.stringify({
            l: cfg.offsetLeft,
            r: cfg.offsetRight,
            b: cfg.offsetBottom,
            t: cfg.offsetTop
          })
        );
      } catch (_e) {
        /* noop */
      }
    }

    function clampCustomLauncherToViewport() {
      if (cfg.position !== 'custom') return;
      var pad = 8;
      var vw = window.innerWidth || 320;
      var vh = window.innerHeight || 568;
      var nw = Math.max(40, root.offsetWidth || 72);
      var nh = Math.max(40, root.offsetHeight || 72);
      if (cfg.offsetLeft != null && isFinite(cfg.offsetLeft)) {
        cfg.offsetLeft = clamp(Math.round(cfg.offsetLeft), pad, Math.max(pad, vw - nw - pad));
      }
      if (cfg.offsetRight != null && isFinite(cfg.offsetRight)) {
        cfg.offsetRight = clamp(Math.round(cfg.offsetRight), pad, Math.max(pad, vw - nw - pad));
      }
      if (cfg.offsetTop != null && isFinite(cfg.offsetTop)) {
        cfg.offsetTop = clamp(Math.round(cfg.offsetTop), pad, Math.max(pad, vh - nh - pad));
      }
      if (cfg.offsetBottom != null && isFinite(cfg.offsetBottom)) {
        cfg.offsetBottom = clamp(Math.round(cfg.offsetBottom), pad, Math.max(pad, vh - nh - pad));
      }
    }

    function finalizeFabDragToCfg() {
      var pad = 8;
      var r = root.getBoundingClientRect();
      var nw = Math.max(40, r.width || root.offsetWidth || 72);
      var nh = Math.max(40, r.height || root.offsetHeight || 72);
      var vw = window.innerWidth || 320;
      var vh = window.innerHeight || 568;
      var left = clamp(Math.round(r.left), pad, Math.max(pad, vw - nw - pad));
      var top = clamp(Math.round(r.top), pad, Math.max(pad, vh - nh - pad));
      var centerX = left + nw / 2;
      cfg.position = 'custom';
      root.style.transform = '';
      root.style.width = '';
      if (centerX > vw * 0.5) {
        cfg.offsetRight = Math.max(pad, Math.round(vw - left - nw));
        cfg.offsetLeft = null;
        root.style.right = cfg.offsetRight + 'px';
        root.style.left = '';
      } else {
        cfg.offsetLeft = left;
        cfg.offsetRight = null;
        root.style.left = left + 'px';
        root.style.right = '';
      }
      root.style.top = top + 'px';
      root.style.bottom = '';
      if (top + nh / 2 > vh * 0.42) {
        cfg.offsetBottom = Math.max(pad, Math.round(vh - top - nh));
        cfg.offsetTop = null;
        root.style.bottom = cfg.offsetBottom + 'px';
        root.style.top = '';
      } else {
        cfg.offsetTop = Math.max(pad, top);
        cfg.offsetBottom = null;
      }
    }

    restoreFabDragFromSession();
    restoreLauncherHiddenFromSession();
    clampCustomLauncherToViewport();
    syncChatPanelLayout();

    var fabResizeTimer = null;
    function scheduleFabResizeForFab() {
      clearTimeout(fabResizeTimer);
      fabResizeTimer = setTimeout(function () {
        if (cfg.position !== 'custom') return;
        clampCustomLauncherToViewport();
        syncChatPanelLayout();
      }, 140);
    }
    if (cfg.fabDraggable) {
      window.addEventListener('resize', scheduleFabResizeForFab);
    }

    function stripHandoffPrefix(raw) {
      return String(raw || '').replace(/^\[[^\]\n]+ → [^\]\n]+\]\s*/, '');
    }

    function multiAgentBadgeHtml(meta) {
      if (!meta || meta.enabled !== true) return '';
      if (meta.mode === 'parallel' && meta.synthesized) {
        return '<div class="afhub-multi-agent-tag" role="status">Respuesta del equipo</div>';
      }
      if (meta.handoff && meta.routedAgentName) {
        return '<div class="afhub-multi-agent-tag" role="status">Atendido por ' + escapeHtml(meta.routedAgentName) + '</div>';
      }
      return '';
    }

    function appendMultiAgentBadge(el, meta) {
      var html = multiAgentBadgeHtml(meta);
      if (!html || !el) return;
      var wrap = document.createElement('div');
      wrap.innerHTML = html;
      var tag = wrap.firstChild;
      if (tag) el.insertBefore(tag, el.firstChild);
    }

    function emitMultiAgentEvent(meta) {
      if (!meta || meta.enabled !== true) return;
      emitEvent('multi_agent_routed', {
        mode: meta.mode || 'triage',
        handoff: meta.handoff === true,
        synthesized: meta.synthesized === true,
        specialist: meta.routedAgentName || null,
        triageMethod: meta.triageMethod || null,
      });
    }

    /** Notas añadidas por el servidor (captura HubSpot automática); no deben verse en widget productivo. */
    function stripHubSpotProducerNotes(raw) {
      var t = String(raw || '');
      var re = /(?:\r?\n\s*)*\*\([^)]*HubSpot[^)]*\)\*\s*$/;
      while (re.test(t)) t = t.replace(re, '');
      return t.replace(/\s+$/, '');
    }

    function botReplyForDisplay(raw) {
      var t = stripHandoffPrefix(String(raw || ''));
      return cfg.showMcpUi ? t : stripHubSpotProducerNotes(t);
    }

    /** Elige la variante más larga entre tokens acumulados y campos del evento done. */
    function resolveStreamFinalRaw(doneEvt, accumulated) {
      var best = String(accumulated || '');
      if (!doneEvt || typeof doneEvt !== 'object') return best;
      var candidates = [
        best,
        doneEvt.reply,
        doneEvt.response,
        doneEvt.text,
        doneEvt.data && doneEvt.data.reply,
        doneEvt.data && doneEvt.data.response,
        doneEvt.data && doneEvt.data.text,
      ];
      for (var ri = 0; ri < candidates.length; ri++) {
        var s = String(candidates[ri] || '');
        if (s.length > best.length) best = s;
      }
      return best;
    }

    /** Texto plano visible en la burbuja (fuente fiable para TTS). */
    function ttsTextFromMessageBubble(bubble) {
      if (!bubble) return '';
      var textEl = bubble.querySelector('.afhub-msg-text');
      if (!textEl) return '';
      return String(textEl.innerText || textEl.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function shortMcpToolLabel(toolId) {
      var s = String(toolId || '');
      var mHub = /^mcp:[^:]+:(.+)$/.exec(s);
      if (mHub) return mHub[1];
      var mStd = /^std:[^:]+:(.+)$/.exec(s);
      if (mStd) return mStd[1];
      return s.replace(/^mcp:/, '');
    }

    function inferMcpTagFromToolIds(ids) {
      if (!ids || !ids.length) return '';
      var i;
      var list = [];
      for (i = 0; i < ids.length; i++) {
        if (typeof ids[i] === 'string' && ids[i].length) list.push(ids[i]);
      }
      if (!list.length) return '';
      function allStart(prefix) {
        for (i = 0; i < list.length; i++) {
          if (list[i].indexOf(prefix) !== 0) return false;
        }
        return true;
      }
      if (allStart('mcp:gmail:')) return 'Gmail (hub)';
      if (allStart('mcp:googleCalendar:')) return 'Google Calendar (hub)';
      if (allStart('mcp:hubspot:')) return 'HubSpot (hub)';
      var allStd = true;
      for (i = 0; i < list.length; i++) {
        if (list[i].indexOf('std:') !== 0) {
          allStd = false;
          break;
        }
      }
      if (allStd) return 'MCP remoto (conexión std)';
      var allMcp = true;
      for (i = 0; i < list.length; i++) {
        if (list[i].indexOf('mcp:') !== 0) {
          allMcp = false;
          break;
        }
      }
      if (allMcp) return 'MCP integración (hub)';
      var hasStd = false;
      var hasMcp = false;
      for (i = 0; i < list.length; i++) {
        if (list[i].indexOf('std:') === 0) hasStd = true;
        if (list[i].indexOf('mcp:') === 0) hasMcp = true;
      }
      if (hasStd && hasMcp) return 'MCP mixto (hub + remoto)';
      if (hasStd) return 'MCP remoto';
      return 'MCP';
    }

    /** Misma UI que addMessage(bot): chip MCP + pills de tools (p. ej. al cerrar SSE). */
    function appendMcpMetadataToBubble(bubbleEl, meta) {
      if (!bubbleEl) return;
      if (bubbleEl.querySelector('.afhub-tool-tags') || bubbleEl.querySelector('.afhub-mcp-source-tag')) {
        return;
      }
      var toolsUsed = meta && meta.toolsUsed;
      var mcpTag = meta && typeof meta.mcpTag === 'string' ? String(meta.mcpTag).trim() : '';
      if (!mcpTag && toolsUsed && toolsUsed.length) {
        mcpTag = inferMcpTagFromToolIds(toolsUsed);
      }
      if (mcpTag) {
        var routeChip = document.createElement('div');
        routeChip.className = 'afhub-mcp-source-tag';
        routeChip.setAttribute('aria-label', 'Origen MCP');
        routeChip.textContent = mcpTag;
        bubbleEl.appendChild(routeChip);
      }
      if (toolsUsed && toolsUsed.length) {
        var tagRow = document.createElement('div');
        tagRow.className = 'afhub-tool-tags';
        tagRow.setAttribute('aria-label', 'Herramientas usadas');
        for (var ti = 0; ti < toolsUsed.length; ti++) {
          var tspan = document.createElement('span');
          tspan.className = 'afhub-tool-tag';
          tspan.textContent = shortMcpToolLabel(toolsUsed[ti]);
          tagRow.appendChild(tspan);
        }
        bubbleEl.appendChild(tagRow);
      }
    }

    function appendFallbackTagToBubble(bubbleEl, modelId, isDebug) {
      if (!bubbleEl || !modelId) return;
      if (bubbleEl.querySelector('.afhub-fallback-tag')) return;
      var tag = document.createElement('div');
      tag.className = 'afhub-fallback-tag' + (isDebug ? ' afhub-fallback-tag--debug' : '');
      tag.setAttribute('aria-label', 'Modelo de respaldo usado');
      tag.setAttribute('title', 'Respuesta generada con modelo de respaldo: ' + modelId);
      tag.textContent = isDebug ? ('↩ fallback · ' + modelId) : '↩ fallback';
      bubbleEl.appendChild(tag);
    }

    function formatQuotaTagHtml(qh) {
      if (!qh || typeof qh !== 'object') return '';
      var pct = typeof qh.percentUsed === 'number' ? qh.percentUsed : 0;
      var pauseMax = qh.estimatedPauseSecMax != null ? qh.estimatedPauseSecMax : 60;
      var pauseExact = qh.estimatedPauseSec != null ? qh.estimatedPauseSec : pauseMax;
      var rem = qh.remaining;
      if (qh.atLimit === true || pct >= 100 || rem === 0) {
        return (
          '<div class="afhub-quota-tag afhub-quota-tag--limit" role="status">Has llegado al cupo de esta ventana (~100%). El siguiente mensaje puede requerir una espera de unos ' +
          pauseExact +
          ' s.</div>'
        );
      }
      if (pct >= 80) {
        return (
          '<div class="afhub-quota-tag afhub-quota-tag--warn" role="status">Vas cerca del límite (~' +
          pct +
          '%) del cupo de mensajes en esta ventana. Al llegar al 100%, la pausa puede ser de hasta ~' +
          pauseMax +
          ' s.</div>'
        );
      }
      return '';
    }

    function splitTextForReveal(text) {
      var raw = String(text || '');
      if (!raw || raw.length < 48) return raw ? [raw] : [];
      var parts = [];
      var tokens = raw.split(/(\s+)/);
      var buf = '';
      var wc = 0;
      for (var ti = 0; ti < tokens.length; ti++) {
        buf += tokens[ti];
        if (tokens[ti].trim()) wc++;
        if (wc >= 3 && buf.length >= 20) {
          parts.push(buf);
          buf = '';
          wc = 0;
        }
      }
      if (buf) parts.push(buf);
      return parts.length ? parts : [raw];
    }

    function revealDelayForParts(n) {
      if (n <= 1) return 0;
      return Math.min(32, Math.max(8, Math.floor(2800 / n)));
    }

    function updateStreamBubble(bubble, streamReply) {
      if (!bubble) return;
      var streamShown = botReplyForDisplay(streamReply);
      var textEl = bubble.querySelector('.afhub-msg-text');
      if (textEl) {
        textEl.innerHTML = formatBotHtml(streamShown);
      } else {
        var html = formatBotHtmlWrapped(streamShown);
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        var inner = wrap.firstChild;
        if (inner) bubble.insertBefore(inner, bubble.firstChild);
      }
      messages.scrollTop = messages.scrollHeight;
    }

    function revealBotReplyProgressively(fullText, finalizeFn) {
      var parts = splitTextForReveal(fullText);
      if (parts.length <= 1) {
        var single = addMessage('bot', fullText, finalizeFn && finalizeFn.opts);
        if (finalizeFn) finalizeFn(single, fullText);
        return;
      }
      var bubble = addMessage('bot', '', { streaming: true });
      var acc = '';
      var delay = revealDelayForParts(parts.length);
      var idx = 0;
      function step() {
        if (idx >= parts.length) {
          bubble.classList.remove('afhub-msg--streaming');
          if (finalizeFn) finalizeFn(bubble, fullText);
          speakBotReplyIfEnabled(fullText, bubble);
          return;
        }
        acc += parts[idx];
        idx++;
        updateStreamBubble(bubble, acc);
        setTimeout(step, delay);
      }
      step();
    }

    function addMessage(type, text, imgOpts) {
      if (imgOpts && imgOpts.error) {
        log(cfg, 'debug', 'addMessage error', { type, textLen: String(text).length, imgOpts: JSON.stringify(imgOpts) });
      }
      var el = document.createElement('div');
      el.className = 'afhub-msg ' + type;
      if (type === 'bot') {
        el.className += ' afhub-msg-rich';
        if (imgOpts && imgOpts.streaming) {
          el.classList.add('afhub-msg--streaming');
        }
        var displayBotText = botReplyForDisplay(text);
        var cooldownPrefix =
          imgOpts && imgOpts.cooldown
            ? '<div class="afhub-cooldown-pill" role="status">Agente en espera</div>'
            : '';
        var quotaPrefix = imgOpts && imgOpts.quotaHtml ? imgOpts.quotaHtml : '';
        el.innerHTML = cooldownPrefix + quotaPrefix + formatBotHtmlWrapped(displayBotText);
        if (imgOpts && imgOpts.images && imgOpts.images.length) {
          for (var j = 0; j < imgOpts.images.length; j++) {
            var item = imgOpts.images[j];
            var u = item && (item.dataUrl || item.url);
            if (typeof u === 'string' && (/^data:image\//i.test(u) || /^https?:\/\//i.test(u))) {
              var wrap = document.createElement('div');
              wrap.className = 'afhub-img-wrap';
              appendGeneratedImage(wrap, u, item, j);
              el.appendChild(wrap);
            }
          }
        }
        if (cfg.showMcpUi) {
          appendMcpMetadataToBubble(el, {
            mcpTag: imgOpts && imgOpts.mcpTag,
            toolsUsed: imgOpts && imgOpts.toolsUsed,
          });
        }
      } else {
        // Detectar y convertir URLs a links en mensajes de usuario
        var urlRegex = /https?:\/\/[^\s]+/gi;
        var hasUrls = urlRegex.test(text);
        if (hasUrls) {
          // Reset regex
          urlRegex = /https?:\/\/[^\s]+/gi;
          var parts = text.split(urlRegex);
          var urls = text.match(urlRegex) || [];
          for (var pi = 0; pi < parts.length; pi++) {
            if (parts[pi]) {
              el.appendChild(document.createTextNode(parts[pi]));
            }
            if (pi < urls.length) {
              var link = document.createElement('a');
              link.href = urls[pi];
              link.textContent = urls[pi];
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              link.style.color = 'var(--brand-primary, #0084ff)';
              link.style.textDecoration = 'underline';
              link.style.wordBreak = 'break-all';
              el.appendChild(link);
            }
          }
        } else {
          el.textContent = text;
        }
        if (imgOpts && imgOpts.userImages && imgOpts.userImages.length) {
          for (var ui = 0; ui < imgOpts.userImages.length; ui++) {
            var uItem = imgOpts.userImages[ui];
            var uUrl = uItem && (uItem.previewUrl || uItem.url);
            if (typeof uUrl === 'string' && (/^data:image\//i.test(uUrl) || /^https?:\/\//i.test(uUrl))) {
              var uWrap = document.createElement('div');
              uWrap.className = 'afhub-img-wrap afhub-img-wrap--user';
              appendGeneratedImage(uWrap, uUrl, uItem, ui);
              el.appendChild(uWrap);
            }
          }
        }
      }
      // Adjuntos genéricos (img/video/archivo) — p.ej. lo que el visitante envía al agente.
      if (imgOpts && Array.isArray(imgOpts.attachments) && imgOpts.attachments.length) {
        for (var ax = 0; ax < imgOpts.attachments.length; ax++) {
          appendHumanAttachment(el, imgOpts.attachments[ax]);
        }
      }
      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'afhub-feedback-btn afhub-msg-copy-btn';
      copyBtn.setAttribute('aria-label', 'Copiar mensaje');
      copyBtn.innerHTML = ICON_COPY;
      copyBtn.addEventListener('click', function () {
        var plain = type === 'bot' ? botReplyForDisplay(text) : String(text || '');
        if (!plain) return;
        var copied = false;
        try {
          if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(plain).then(function () { copied = true; }).catch(function () { /* noop */ });
          } else {
            var ta = document.createElement('textarea');
            ta.value = plain;
            ta.setAttribute('readonly', 'true');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try { copied = document.execCommand('copy'); } catch (_e) { /* noop */ }
            document.body.removeChild(ta);
          }
        } catch (_err) {
          /* noop */
        }
        copyBtn.classList.add('active');
        copyBtn.setAttribute('aria-label', 'Copiado');
        window.setTimeout(function () {
          copyBtn.classList.remove('active');
          copyBtn.setAttribute('aria-label', 'Copiar mensaje');
        }, 1200);
      });
      messages.appendChild(el);
      var hasBotImages = type === 'bot' && imgOpts && imgOpts.images && imgOpts.images.length;
      var showFeedback = !imgOpts || imgOpts.noFeedback !== true;
      var isError = imgOpts && imgOpts.error === true;
      if (imgOpts && imgOpts.error) {
        var textTrimmed = String(text || '').trim();
        var willCreateFbRow = type === 'bot' && (textTrimmed || hasBotImages) && showFeedback;
        console.log('[AFHUB-DEBUG] fbRow decision:', {
          type: type,
          hasBotImages: hasBotImages,
          textLength: String(text || '').length,
          textTrimmed: textTrimmed.substring(0, 50),
          showFeedback: showFeedback,
          isError: isError,
          willCreateFbRow: willCreateFbRow,
          noFeedback: imgOpts.noFeedback,
          imgOpts: imgOpts
        });
        log(cfg, 'debug', 'fbRow decision', { type, hasBotImages, textTrimmed, showFeedback, isError, willCreateFbRow });
      }
      if (type === 'bot' && (String(text || '').trim() || hasBotImages) && showFeedback) {
        var feedbackId = 'fb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        var fbRow = document.createElement('div');
        fbRow.className = 'afhub-feedback-row';
        fbRow.setAttribute('aria-label', 'Feedback del mensaje');
        var previewText = botReplyForDisplay(String(text || ''));

        function setFeedback(value) {
          var buttons = fbRow.querySelectorAll('.afhub-feedback-btn');
          for (var bi = 0; bi < buttons.length; bi++) {
            var b = buttons[bi];
            var active = b.getAttribute('data-value') === value;
            if (active) b.classList.add('active');
            else b.classList.remove('active');
          }
          emitEvent('message_feedback', {
            value: value,
            feedbackId: feedbackId,
            messagePreview: previewText.slice(0, 180),
            model: imgOpts && typeof imgOpts.model === 'string' ? imgOpts.model : undefined
          });
        }

        function makeFeedbackBtn(value, label, icon) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'afhub-feedback-btn';
          btn.setAttribute('aria-label', label);
          btn.setAttribute('data-value', value);
          btn.textContent = icon;
          btn.addEventListener('click', function () {
            setFeedback(value);
          });
          return btn;
        }

        // Contenedor izquierdo
        var leftContainer = document.createElement('div');
        leftContainer.style.display = 'flex';
        leftContainer.style.gap = '8px';
        leftContainer.style.alignItems = 'center';

        // Si es error con opción de WhatsApp, mostrar link de WhatsApp
        console.log('[AFHUB-DEBUG] Checking WhatsApp button:', {
          isError: isError,
          imgOptsExists: !!imgOpts,
          showWhatsApp: imgOpts && imgOpts.showWhatsApp,
          condition: isError && imgOpts && imgOpts.showWhatsApp
        });
        if (isError && imgOpts && imgOpts.showWhatsApp) {
          console.log('[AFHUB-DEBUG] ✅ CREATING WhatsApp link!');
          log(cfg, 'debug', 'Creating WhatsApp link', { phone: cfg.humanSupportPhone });
          var waPhone = String(cfg.humanSupportPhone || '').trim().replace(/\D/g, '');
          if (waPhone) {
            var waLink = document.createElement('a');
            waLink.className = 'afhub-persona-tag';
            waLink.href = 'https://wa.me/' + waPhone;
            waLink.target = '_blank';
            waLink.rel = 'noopener noreferrer';
            waLink.textContent = 'WhatsApp';
            waLink.title = 'Abrir WhatsApp';
            waLink.addEventListener('click', function () {
              notify('onWhatsAppClick', {
                reason: 'agent_error',
                timestamp: new Date().toISOString()
              });
              emitEvent('whatsapp_clicked', { reason: 'agent_error' });
            });
            leftContainer.appendChild(waLink);
          }
        } else {
          // Mostrar feedback buttons normales
          console.log('[AFHUB-DEBUG] ❌ NOT creating WhatsApp, showing normal buttons instead:', {
            isError: isError,
            imgOpts: imgOpts,
            showWhatsApp: imgOpts && imgOpts.showWhatsApp
          });
          log(cfg, 'debug', 'Creating normal feedback buttons', { isError, showWhatsApp: imgOpts && imgOpts.showWhatsApp });
          leftContainer.appendChild(makeFeedbackBtn('up', 'Me gusto esta respuesta', '👍'));
          leftContainer.appendChild(makeFeedbackBtn('down', 'No me gusto esta respuesta', '👎'));
          leftContainer.appendChild(copyBtn);
        }
        fbRow.appendChild(leftContainer);

        // Espaciador flexible
        var spacer = document.createElement('div');
        spacer.style.flex = '1';
        fbRow.appendChild(spacer);

        // Contenedor derecho: solo hora (no en saludos, no en errores)
        if (!isError && String(text || '').trim() && (!imgOpts || !imgOpts.wasGreeting)) {
          var timeSpan = document.createElement('span');
          timeSpan.className = 'afhub-msg-time';
          var now = new Date();
          var hours = String(now.getHours()).padStart(2, '0');
          var mins = String(now.getMinutes()).padStart(2, '0');
          timeSpan.textContent = hours + ':' + mins;
          fbRow.appendChild(timeSpan);
        }
        messages.appendChild(fbRow);
      }
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function thinkingCopyFromStatus(statusLabel, statusPhase) {
      var s = String(statusLabel || '').trim();
      var phase = String(statusPhase || '').trim();
      if (phase === 'prepare') return { title: 'Preparando…', sub: s || 'Organizando tu solicitud' };
      if (phase === 'enrich') return { title: 'Cargando contexto…', sub: s || 'Recuperando la conversación' };
      if (phase === 'vision') return { title: 'Analizando imagen…', sub: s || 'Procesando la captura' };
      if (phase === 'resolve') return { title: 'Identificando agente…', sub: s || 'Conectando con tu asistente' };
      if (phase === 'skills' || phase === 'skill') return { title: 'Aplicando habilidades…', sub: s || 'Configurando el agente' };
      if (phase === 'rag') return { title: 'Consultando documentos…', sub: s || 'Buscando en la base de conocimiento' };
      if (phase === 'mcp' || phase === 'tools') return { title: 'Usando integraciones…', sub: s || 'Ejecutando herramientas conectadas' };
      if (phase === 'model') return { title: 'Generando respuesta…', sub: s || 'El modelo está redactando' };
      if (phase === 'hub') return { title: 'Consultando al asistente…', sub: s || 'Procesando en el servidor' };
      if (phase === 'triage') return { title: 'Analizando tu consulta…', sub: s || 'Determinando el mejor enfoque' };
      if (phase === 'handoff') return { title: 'Derivando a especialista…', sub: s || 'Transfiriendo la consulta' };
      if (phase === 'parallel') return { title: 'Consultando especialistas…', sub: s || 'Varios agentes en paralelo' };
      if (phase === 'pipeline' || phase === 'content') return { title: 'Recopilando información…', sub: s || 'Pipeline multiagente' };
      if (phase === 'creative') return { title: 'Generando creativo…', sub: s || 'Agente creativo en acción' };
      if (phase === 'synthesize') return { title: 'Unificando respuesta…', sub: s || 'Sintetizando resultados' };
      if (!s) return { title: 'Pensando…', sub: 'Preparando tu respuesta' };
      var lower = s.toLowerCase();
      if (lower.indexOf('subiendo') >= 0) return { title: 'Subiendo archivo…', sub: s };
      if (lower.indexOf('captura') >= 0 || lower.indexOf('analizando captura') >= 0) return { title: 'Analizando imagen…', sub: s };
      if (lower.indexOf('habilidad') >= 0 || lower.indexOf('skills') >= 0) return { title: 'Aplicando habilidades…', sub: s };
      if (lower.indexOf('documentos') >= 0 || lower.indexOf('indexados') >= 0) return { title: 'Consultando documentos…', sub: s };
      if (lower.indexOf('integraciones') >= 0 || lower.indexOf('herramienta') >= 0) return { title: 'Usando integraciones…', sub: s };
      if (lower.indexOf('especialist') >= 0 || lower.indexOf('paralelo') >= 0) return { title: 'Consultando especialistas…', sub: s };
      if (lower.indexOf('recopil') >= 0) return { title: 'Recopilando información…', sub: s };
      if (lower.indexOf('consultando al asistente') >= 0) return { title: 'Consultando al asistente…', sub: s };
      if (lower.indexOf('analizando tu consulta') >= 0) return { title: 'Analizando tu consulta…', sub: s };
      if (lower.indexOf('derivando') >= 0 || lower.indexOf('conectando con') >= 0) return { title: 'Derivando a especialista…', sub: s };
      if (lower.indexOf('unificada') >= 0 || lower.indexOf('síntesis') >= 0 || lower.indexOf('sintesis') >= 0) return { title: 'Redactando respuesta…', sub: s };
      if (lower.indexOf('preparando') >= 0) return { title: 'Preparando…', sub: s };
      if (lower.indexOf('contexto') >= 0) return { title: 'Cargando contexto…', sub: s };
      if (lower.indexOf('generando') >= 0) return { title: 'Generando respuesta…', sub: s };
      return { title: 'Pensando…', sub: s };
    }

    function clearTypingTimer() {
      if (typingTimerHandle) {
        clearInterval(typingTimerHandle);
        typingTimerHandle = null;
      }
    }

    function startTypingTimer() {
      clearTypingTimer();
      typingStartedAt = Date.now();
      typingTimerHandle = setInterval(function () {
        var el = document.getElementById(typingId);
        if (!el) {
          clearTypingTimer();
          return;
        }
        var elapsedEl = el.querySelector('.afhub-thinking-elapsed');
        if (!elapsedEl) return;
        var sec = Math.floor((Date.now() - typingStartedAt) / 1000);
        if (sec < 3) {
          elapsedEl.textContent = '';
          return;
        }
        elapsedEl.textContent = sec + ' s';
        if (sec >= 20) {
          var subEl = el.querySelector('.afhub-thinking-sub');
          if (subEl && subEl.getAttribute('data-slow') !== '1') {
            subEl.setAttribute('data-slow', '1');
            subEl.textContent = 'Está tardando más de lo habitual. Seguimos trabajando en tu respuesta…';
          }
        }
      }, 1000);
    }

    function renderThinkingCard(el, statusLabel, statusPhase) {
      var copy = thinkingCopyFromStatus(statusLabel, statusPhase);
      el.innerHTML =
        '<div class="afhub-thinking-head">' +
          '<span class="afhub-thinking-pulse" aria-hidden="true"></span>' +
          '<div class="afhub-thinking-titles">' +
            '<span class="afhub-thinking-sub">' + escapeHtml(copy.sub) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="afhub-thinking-meta">' +
          '<span class="afhub-thinking-elapsed"></span>' +
          '<span class="afhub-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>' +
        '</div>';
    }

    function showTyping(statusLabel, statusPhase) {
      hideTyping();
      var el = document.createElement('div');
      el.className = 'afhub-msg bot afhub-thinking-card';
      el.id = typingId;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-busy', 'true');
      if (statusPhase) el.setAttribute('data-phase', String(statusPhase));
      renderThinkingCard(el, statusLabel, statusPhase);
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      startTypingTimer();
    }

    function updateTypingStatus(statusLabel, statusPhase) {
      var el = document.getElementById(typingId);
      if (!el) {
        showTyping(statusLabel, statusPhase);
        return;
      }
      var subEl = el.querySelector('.afhub-thinking-sub');
      if (subEl && subEl.getAttribute('data-slow') === '1') return;
      if (statusPhase) el.setAttribute('data-phase', String(statusPhase));
      var copy = thinkingCopyFromStatus(statusLabel, statusPhase);
      var titleEl = el.querySelector('.afhub-thinking-title');
      if (titleEl) titleEl.textContent = copy.title;
      if (subEl) {
        subEl.removeAttribute('data-slow');
        subEl.textContent = copy.sub;
      }
      messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() {
      clearTypingTimer();
      var el = document.getElementById(typingId);
      if (el) el.remove();
    }

    function notify(name, payload) {
      var fn = cfg[name];
      if (typeof fn === 'function') {
        try { fn(payload); } catch (e) { log(cfg, 'warn', 'Callback error for ' + name, e); }
      }
    }

    function emitEvent(eventName, details) {
      if (!cfg.trackEvents || !cfg.agentId) return;
      var endpoint = cfg.host.replace(/\/$/, '') + '/api/widget/events';
      var payload = {
        event: eventName,
        agentId: cfg.agentId,
        instanceId: id,
        sessionId: chatSessionId,
        timestamp: new Date().toISOString(),
        details: details || {}
      };
      // Include widget token if available so the server can validate the event source
      if (cfg.token) payload.token = cfg.token;
      try {
        if (navigator && typeof navigator.sendBeacon === 'function') {
          var blob = new Blob([JSON.stringify(payload)], { type: 'text/plain; charset=UTF-8' });
          navigator.sendBeacon(endpoint, blob);
          return;
        }
      } catch (_err) {
        // ignore and fallback to fetch
      }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () { /* noop */ });
    }

    function resolveWidgetIdForHandoff() {
      return String(cfg.widgetId || '').trim();
    }

    function openHandoffModal() {
      if (cfg.handoffEnabled === false) return;
      if (widgetDisabled) return;
      handoffOverlay.classList.add('visible');
      var errEl = handoffOverlay.querySelector('.afhub-handoff-error');
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    }

    function closeHandoffModal() {
      handoffOverlay.classList.remove('visible');
    }

    function submitHandoffRequest() {
      if (cfg.handoffEnabled === false) return;
      var wid = resolveWidgetIdForHandoff();
      if (!wid) {
        addMessage('bot', 'No se pudo enviar la solicitud. Recarga la página e inténtalo de nuevo.');
        return;
      }
      if (!cfg.token || !String(cfg.token).trim()) {
        addMessage('bot', 'Configuración incompleta (token). Contacta al administrador del sitio.');
        return;
      }
      var nameEl = handoffOverlay.querySelector('[name="name"]');
      var emailEl = handoffOverlay.querySelector('[name="email"]');
      var phoneEl = handoffOverlay.querySelector('[name="phone"]');
      var msgEl = handoffOverlay.querySelector('[name="message"]');
      var errEl = handoffOverlay.querySelector('.afhub-handoff-error');
      var submitBtn = handoffOverlay.querySelector('.afhub-handoff-submit');
      var contactInfo = {
        name: nameEl && nameEl.value ? String(nameEl.value).trim() : '',
        email: emailEl && emailEl.value ? String(emailEl.value).trim() : '',
        phone: phoneEl && phoneEl.value ? String(phoneEl.value).trim() : ''
      };
      var userMessage = msgEl && msgEl.value ? String(msgEl.value).trim() : '';
      if (!userMessage && lastSessionImageUrls.length) {
        userMessage = 'Captura adjunta: ' + lastSessionImageUrls.join(', ');
      }
      if (!contactInfo.name && !contactInfo.email && !contactInfo.phone) {
        if (errEl) {
          errEl.textContent = 'Indica al menos nombre, email o teléfono.';
          errEl.style.display = 'block';
        }
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      var endpoint = cfg.host.replace(/\/$/, '') + '/api/widgets/' + encodeURIComponent(wid) + '/handoff';
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Token': String(cfg.token).trim()
        },
        body: JSON.stringify({
          sessionId: chatSessionId,
          agentId: cfg.agentId || '',
          visitorId: getOrCreateVisitorId(cfg),
          userMessage: userMessage,
          contactInfo: contactInfo,
          token: String(cfg.token).trim(),
          ...(lastSessionImageUrls.length
            ? { imageUrls: lastSessionImageUrls }
            : {}),
        })
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (submitBtn) submitBtn.disabled = false;
          if (!result.ok) {
            if (errEl) {
              errEl.textContent = (result.data && result.data.error) ? result.data.error : 'Error al enviar.';
              errEl.style.display = 'block';
            }
            return;
          }
          closeHandoffModal();
          addMessage('bot', '⏳ Conectando con un agente… Te respondemos aquí mismo en este chat.');
          activateHumanMode();
          try {
            emitEvent('conversation_handoff', {
              reason: 'form_submit',
              channel: 'inbox',
              contactInfo: contactInfo
            });
          } catch (_ev) { /* noop */ }
        })
        .catch(function () {
          if (submitBtn) submitBtn.disabled = false;
          if (errEl) {
            errEl.textContent = 'Error de red. Intenta de nuevo.';
            errEl.style.display = 'block';
          }
        });
    }

    // ── MODO HUMANO: polling + timeout + badge "Agente" ──────────────────────
    var humanModeActive = false;
    var humanModeTimer = null;
    var humanPollTimer = null;
    var humanLastPoll = new Date().toISOString();
    var humanTimeoutOffered = false;
    var humanPollCount = 0;
    var HUMAN_POLL_MAX = 1200; // ~1h a 3s/poll: tope de seguridad.

    // IDs de mensajes del agente ya mostrados (evita duplicados en polling).
    var humanShownIds = {};
    // IDs de mensajes del agente ocultados por el cliente en su propia vista.
    function playInboxBell() {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        var ctx = new Ctx();
        var t = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(660, t + 0.07);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
        window.setTimeout(function () {
          try { ctx.close(); } catch (_e) { /* noop */ }
        }, 280);
      } catch (_bell) { /* noop */ }
    }

    var unreadHintWrap = null;
    var unreadFabBadge = null;

    function ensureUnreadNoticeUi() {
      if (!unreadHintWrap) {
        unreadHintWrap = document.createElement('div');
        unreadHintWrap.className = 'afhub-unread-hint-wrap';
        var unreadHint = document.createElement('div');
        unreadHint.className = 'afhub-unread-hint';
        unreadHint.setAttribute('role', 'status');
        unreadHint.textContent = 'Tienes un mensaje';
        unreadHintWrap.appendChild(unreadHint);
        unreadHintWrap.addEventListener('click', function () {
          clearUnreadHumanNotice();
          open();
        });
        launcher.insertBefore(unreadHintWrap, fabWrap);
        unreadHintWrap.style.display = 'none';
      }
      if (!unreadFabBadge) {
        unreadFabBadge = document.createElement('span');
        unreadFabBadge.className = 'afhub-unread-badge';
        unreadFabBadge.setAttribute('aria-hidden', 'true');
        fabWrap.appendChild(unreadFabBadge);
        unreadFabBadge.style.display = 'none';
      }
    }

    function showUnreadHumanNotice() {
      ensureUnreadNoticeUi();
      unreadHintWrap.style.display = '';
      unreadFabBadge.style.display = 'block';
    }

    function clearUnreadHumanNotice() {
      if (unreadHintWrap) unreadHintWrap.style.display = 'none';
      if (unreadFabBadge) unreadFabBadge.style.display = 'none';
    }

    function onHumanMessageArrived() {
      if (isOpen) {
        playInboxBell();
      } else {
        showUnreadHumanNotice();
      }
    }

    function isHumanMsgHidden(id) {
      if (!id) return false;
      try { return sessionStorage.getItem('biv-hide-msg:' + id) === '1'; } catch (e) { return false; }
    }
    function removeHumanMessageById(id) {
      if (!id) return;
      delete humanShownIds[id];
      var node = messages.querySelector('[data-mid="' + id + '"]');
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }
    function humanBytesLabel(n) {
      if (!n || n <= 0) return '';
      if (n < 1024) return n + ' B';
      if (n < 1048576) return Math.round(n / 1024) + ' KB';
      return (n / 1048576).toFixed(1) + ' MB';
    }
    // Fuerza descarga en assets de Cloudinary (Content-Disposition: attachment).
    function cloudinaryDownloadUrl(url) {
      if (typeof url === 'string' && /res\.cloudinary\.com/.test(url) && url.indexOf('/upload/') !== -1) {
        return url.replace('/upload/', '/upload/fl_attachment/');
      }
      return url;
    }
    // Renderiza un adjunto del agente en la burbuja: imagen, video o archivo descargable.
    function appendHumanAttachment(container, att) {
      if (!att || typeof att.url !== 'string' || !/^https?:\/\//i.test(att.url)) return;
      var box = document.createElement('div');
      box.style.cssText = 'margin-top:6px;';
      if (att.type === 'image') {
        var a = document.createElement('a');
        a.href = att.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.setAttribute('download', att.name || '');
        var img = document.createElement('img');
        img.src = att.url; img.alt = att.name || 'imagen';
        img.style.cssText = 'max-width:100%;border-radius:8px;display:block;';
        a.appendChild(img);
        box.appendChild(a);
      } else if (att.type === 'video') {
        var v = document.createElement('video');
        v.src = att.url; v.controls = true;
        v.style.cssText = 'max-width:100%;border-radius:8px;display:block;';
        box.appendChild(v);
      } else {
        // archivo: tarjeta descargable (fl_attachment fuerza la descarga)
        var link = document.createElement('a');
        link.href = cloudinaryDownloadUrl(att.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('download', att.name || '');
        link.style.cssText = 'display:flex;align-items:center;gap:8px;text-decoration:none;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,0.06);color:inherit;max-width:240px;';
        var ico = document.createElement('span');
        ico.textContent = '📄'; ico.style.cssText = 'font-size:18px;flex-shrink:0;';
        var meta = document.createElement('span');
        meta.style.cssText = 'flex:1;min-width:0;';
        var nm = document.createElement('span');
        nm.textContent = att.name || 'archivo';
        nm.style.cssText = 'display:block;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        meta.appendChild(nm);
        var bl = humanBytesLabel(att.bytes);
        if (bl) {
          var sz = document.createElement('span');
          sz.textContent = bl; sz.style.cssText = 'display:block;font-size:10px;opacity:0.7;';
          meta.appendChild(sz);
        }
        var dl = document.createElement('span');
        dl.textContent = '⬇'; dl.style.cssText = 'flex-shrink:0;opacity:0.7;';
        link.appendChild(ico); link.appendChild(meta); link.appendChild(dl);
        box.appendChild(link);
      }
      container.appendChild(box);
    }
    // ── Acuses de "visto": el widget avisa al servidor cuando muestra mensajes humanos ──
    var humanReadAcked = {};
    var humanReadPending = {};
    var humanReadTimer = null;
    function ackHumanRead(mid) {
      if (!mid || humanReadAcked[mid]) return;
      // "Visto" = el panel del chat está abierto y la pestaña visible.
      if (!isOpen) return;
      if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') return;
      humanReadPending[mid] = true;
      if (humanReadTimer) return;
      humanReadTimer = setTimeout(flushHumanRead, 600);
    }
    function flushHumanRead() {
      humanReadTimer = null;
      var ids = Object.keys(humanReadPending);
      humanReadPending = {};
      if (!ids.length || !chatSessionId || !cfg.token) return;
      ids.forEach(function (id) { humanReadAcked[id] = true; });
      try {
        fetch(cfg.host.replace(/\/$/, '') + '/api/widget/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: String(cfg.token).trim(), sessionId: chatSessionId, ids: ids }),
          keepalive: true,
        }).catch(function () {});
      } catch (e) { /* */ }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          Object.keys(humanShownIds).forEach(function (id) { ackHumanRead(id); });
        }
      });
    }

    function addHumanMessage(m, opts) {
      opts = opts || {};
      // Compatibilidad: acepta string (texto) u objeto { id, content, attachments }.
      var text = (m && typeof m === 'object') ? (m.content || '') : String(m || '');
      var mid = (m && typeof m === 'object' && m.id) ? String(m.id) : '';
      var atts = (m && typeof m === 'object' && Array.isArray(m.attachments)) ? m.attachments : [];
      if (mid && (humanShownIds[mid] || isHumanMsgHidden(mid))) return;
      if (!text && (!atts || !atts.length)) return;
      if (mid) humanShownIds[mid] = true;

      var wrap = document.createElement('div');
      wrap.className = 'afhub-human-wrap';
      if (mid) wrap.setAttribute('data-mid', mid);

      var head = document.createElement('div');
      head.className = 'afhub-human-meta';
      var badge = document.createElement('span');
      badge.className = 'afhub-human-badge';
      // Icono de persona + etiqueta: deja claro que responde un humano real.
      badge.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span>Atención personal</span>';
      head.appendChild(badge);
      wrap.appendChild(head);

      var bubble = document.createElement('div');
      bubble.className = 'afhub-msg bot afhub-human-bubble';
      if (text) {
        var tx = document.createElement('div');
        tx.className = 'afhub-msg-text';
        tx.textContent = text;
        bubble.appendChild(tx);
      }
      for (var i = 0; i < atts.length; i++) appendHumanAttachment(bubble, atts[i]);
      wrap.appendChild(bubble);

      messages.appendChild(wrap);
      messages.scrollTop = messages.scrollHeight;
      if (mid) ackHumanRead(mid); // visto si el chat está visible
      if (!opts.silent) onHumanMessageArrived();
    }

    function deactivateHumanMode(msg) {
      humanModeActive = false;
      if (humanPollTimer) { clearInterval(humanPollTimer); humanPollTimer = null; }
      if (humanModeTimer) { clearTimeout(humanModeTimer); humanModeTimer = null; }
      // Descartar adjuntos del visitante que quedaran sin enviar.
      if (pendingHumanAttachments.length) { pendingHumanAttachments = []; renderHumanAttachPreviews(); }
      if (msg) addMessage('bot', msg);
      // Reactiva el input de chat (si lo habíamos desactivado).
      var inp = chat.querySelector('.afhub-input, .afhub-chat-input, textarea');
      if (inp) inp.disabled = false;
    }

    function pollHumanMessages() {
      if (!humanModeActive || !chatSessionId || !cfg.token) return;
      // Tope de seguridad: evita polling infinito si nunca se resuelve.
      humanPollCount += 1;
      if (humanPollCount > HUMAN_POLL_MAX) {
        deactivateHumanMode();
        return;
      }
      var pollUrl = cfg.host.replace(/\/$/, '') + '/api/widget/messages'
        + '?sessionId=' + encodeURIComponent(chatSessionId)
        + '&since=' + encodeURIComponent(humanLastPoll)
        + '&token=' + encodeURIComponent(String(cfg.token).trim());
      fetch(pollUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!humanModeActive) return;
          // Avanzar el cursor con la HORA DEL SERVIDOR (evita drift de reloj del cliente).
          if (data && typeof data.now === 'string') humanLastPoll = data.now;
          // Mensajes nuevos del agente humano (texto y/o adjuntos).
          if (Array.isArray(data.messages) && data.messages.length) {
            data.messages.forEach(function (m) {
              addHumanMessage(m);
            });
            // Cancelar el timeout de fallback: ya hubo respuesta.
            if (humanModeTimer) { clearTimeout(humanModeTimer); humanModeTimer = null; }
            humanTimeoutOffered = false;
          }
          // Mensajes retirados por el agente: eliminarlos de la vista del cliente.
          if (Array.isArray(data.deletedIds) && data.deletedIds.length) {
            data.deletedIds.forEach(function (id) { removeHumanMessageById(id); });
          }
          // Sesión resuelta por el agente.
          if (data.resolved === true) {
            if (feedbackQs.length && !feedbackAlreadyDone()) {
              // Cerrar modo humano y ofrecer la encuesta final.
              deactivateHumanMode();
              addMessage('bot', 'La conversación con el agente ha finalizado. Antes de irte, ¿nos dejas tu opinión?');
              openFeedbackSurvey(null);
            } else {
              deactivateHumanMode('La conversación con el agente ha finalizado. ¿Puedo ayudarte en algo más?');
            }
          }
        })
        .catch(function () { /* silencioso: reintenta en el próximo tick */ });
    }

    // Verifica al abrir el widget (o al cargar) si la sesión sigue en modo humano.
    function checkHumanModeOnOpen(opts) {
      opts = opts || {};
      if (humanModeActive || !chatSessionId || !cfg.token) return;
      var url = cfg.host.replace(/\/$/, '') + '/api/widget/messages'
        + '?sessionId=' + encodeURIComponent(chatSessionId)
        + '&since=' + encodeURIComponent(new Date(0).toISOString())
        + '&token=' + encodeURIComponent(String(cfg.token).trim());
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.humanMode === true && data.resolved !== true) {
            var pending = Array.isArray(data.messages) ? data.messages : [];
            activateHumanMode(data.now);
            if (pending.length) {
              pending.forEach(function (m) { addHumanMessage(m, { silent: true }); });
              if (!isOpen) showUnreadHumanNotice();
            }
            if (!opts.skipReconnectBanner) {
              addMessage('bot', 'Sigues conectado con un agente. Escríbele aquí y te responderá en este chat.');
            }
          }
        })
        .catch(function () { /* silencioso */ });
    }

    function activateHumanMode(initialCursor) {
      if (humanModeActive) return;
      humanModeActive = true;
      humanLastPoll = initialCursor || new Date().toISOString();
      humanTimeoutOffered = false;
      humanPollCount = 0;
      // Iniciar polling cada 3s.
      humanPollTimer = setInterval(pollHumanMessages, 3000);
      // Timeout de fallback: si handoffTimeout > 0 y no hay respuesta, ofrecer WhatsApp.
      var timeoutMin = typeof cfg.handoffTimeout === 'number' ? cfg.handoffTimeout : 5;
      if (timeoutMin > 0) {
        humanModeTimer = setTimeout(function () {
          if (!humanModeActive || humanTimeoutOffered) return;
          humanTimeoutOffered = true;
          var waDigits = humanWaDigits();
          var waMsg = 'Nuestro equipo tardará un poco más en responder.';
          if (cfg.humanSupportEnabled !== false && waDigits.length >= 8) {
            waMsg += ' ¿Prefieres continuar por WhatsApp mientras esperas?';
            addMessage('bot', waMsg);
            appendHumanSupportOfferInChat('persona');
          } else {
            addMessage('bot', waMsg + ' Por favor, espera unos minutos más.');
          }
        }, timeoutMin * 60 * 1000);
      }
    }
    // ── FIN MODO HUMANO ───────────────────────────────────────────────────────

    handoffBtn.addEventListener('click', openHandoffModal);
    handoffOverlay.querySelector('.afhub-handoff-cancel').addEventListener('click', closeHandoffModal);
    handoffOverlay.querySelector('.afhub-handoff-submit').addEventListener('click', submitHandoffRequest);
    handoffOverlay.addEventListener('click', function (e) {
      if (e.target === handoffOverlay) closeHandoffModal();
    });

    // ── Encuesta de satisfacción: render dinámico + envío ─────────────────────
    function fbEsc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function feedbackAlreadyDone() {
      try { return sessionStorage.getItem('afhub-fb-done:' + chatSessionId) === '1'; } catch (e) { return false; }
    }
    function touchActivity() {
      try { sessionStorage.setItem('afhub-last-activity:' + chatSessionId, String(Date.now())); } catch (e) { /* */ }
    }
    function lastActivityAge() {
      try {
        var v = parseInt(sessionStorage.getItem('afhub-last-activity:' + chatSessionId) || '0', 10);
        return v ? (Date.now() - v) : 0;
      } catch (e) { return 0; }
    }
    // Disparador #3: al reabrir tras inactividad, finalizar y ofrecer encuesta antes de otra conversación.
    function checkIdleFeedback() {
      if (!feedbackQs.length || feedbackAlreadyDone()) return;
      if (typeof humanModeActive !== 'undefined' && humanModeActive) return;
      var mins = typeof cfg.conversationIdleTimeout === 'number' ? cfg.conversationIdleTimeout : 15;
      if (mins <= 0 || countUserTurnsInHistory(history) <= 0) return;
      var age = lastActivityAge();
      if (age > 0 && age > mins * 60 * 1000) {
        addMessage('bot', 'Esta conversación se finalizó por inactividad. Antes de empezar otra, ¿nos dejas tu opinión?');
        openFeedbackSurvey(function () { startNewConversation(); });
      }
    }
    // Disparador #4: detectar intención de cierre (agradecimiento corto / "no" tras "¿algo más?").
    function detectClosingIntent(userText) {
      if (!feedbackQs.length || feedbackAlreadyDone() || feedbackOfferShown) return false;
      var t = String(userText || '').trim().toLowerCase();
      if (!t || t.indexOf('?') !== -1) return false;
      if (t.length <= 30 && /\bgracias\b/.test(t) && !/(pero|otra|tambi[eé]n|adem[aá]s|c[oó]mo|cu[aá]l|cu[aá]ndo|d[oó]nde|por qu[eé])/.test(t)) {
        return true;
      }
      var lastBot = '';
      for (var i = history.length - 1; i >= 0; i--) {
        var role = history[i] && history[i].role;
        if (role === 'model' || role === 'assistant' || role === 'bot') { lastBot = String(history[i].content || '').toLowerCase(); break; }
      }
      var botAskedMore = /algo m[aá]s|puedo ayudar(te)? en algo|necesitas? algo|otra (cosa|duda|pregunta|consulta)|algo en lo que/.test(lastBot);
      var userSaidNo = /^(no\b|no,? gracias|eso es todo|nada m[aá]s|ya est[aá]|as[ií] est[aá] bien|todo bien|listo|est[aá] bien as[ií])/.test(t);
      return botAskedMore && userSaidNo && t.length <= 40;
    }
    function offerFeedbackButton() {
      if (feedbackOfferShown || feedbackAlreadyDone() || !feedbackQs.length) return;
      feedbackOfferShown = true;
      var wrap = document.createElement('div');
      wrap.className = 'afhub-msg bot afhub-fb-offer';
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-start;margin-bottom:8px';
      var p = document.createElement('div');
      p.style.cssText = 'font-size:13px;line-height:1.5';
      p.textContent = '¡Con gusto! 🙌 Antes de irte, ¿nos dejas tu opinión?';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Calificar';
      btn.style.cssText = 'background:' + cfg.color + ';color:#fff;border:none;border-radius:10px;padding:7px 18px;font-size:12px;font-weight:700;cursor:pointer';
      btn.addEventListener('click', function () { openFeedbackSurvey(null); });
      wrap.appendChild(p);
      wrap.appendChild(btn);
      messages.appendChild(wrap);
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function buildFeedbackHtml() {
      var h = '<div class="afhub-fb-inner">';
      h += '<div class="afhub-fb-title">' + fbEsc(cfg.feedbackTitle) + '</div>';
      for (var i = 0; i < feedbackQs.length; i++) {
        var q = feedbackQs[i];
        var qid = q.id || ('q' + i);
        h += '<div class="afhub-fb-q" data-qid="' + fbEsc(qid) + '" data-type="' + fbEsc(q.type) + '" data-required="' + (q.required ? '1' : '0') + '" style="margin-bottom:10px">';
        h += '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:#3c4043">' + fbEsc(q.text) + (q.required ? ' *' : '') + '</label>';
        if (q.type === 'rating') {
          h += '<div class="afhub-fb-stars" data-value="0" style="display:flex;gap:5px">';
          for (var s = 1; s <= 5; s++) h += '<button type="button" class="afhub-fb-star" data-star="' + s + '" style="background:none;border:none;cursor:pointer;font-size:24px;line-height:1;color:#ccc;padding:0">★</button>';
          h += '</div>';
        } else if (q.type === 'yesno') {
          h += '<div style="display:flex;gap:14px;font-size:12px">';
          h += '<label style="cursor:pointer"><input type="radio" name="fb_' + fbEsc(qid) + '" value="Sí"> Sí</label>';
          h += '<label style="cursor:pointer"><input type="radio" name="fb_' + fbEsc(qid) + '" value="No"> No</label>';
          h += '</div>';
        } else if (q.type === 'choice') {
          h += '<div style="display:flex;flex-direction:column;gap:6px;font-size:12px">';
          var opts = Array.isArray(q.options) ? q.options : [];
          for (var o = 0; o < opts.length; o++) h += '<label style="cursor:pointer"><input type="radio" name="fb_' + fbEsc(qid) + '" value="' + fbEsc(opts[o]) + '"> ' + fbEsc(opts[o]) + '</label>';
          h += '</div>';
        } else {
          h += '<textarea class="afhub-fb-text" rows="2" placeholder="Tu comentario…" style="width:100%;box-sizing:border-box;border:1px solid #e2e4e8;border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;resize:vertical"></textarea>';
        }
        h += '</div>';
      }
      h += '<p class="afhub-fb-error" style="display:none;color:#d93025;font-size:11px;margin:2px 0 6px"></p>';
      h += '<div style="display:flex;align-items:center;gap:8px;margin-top:2px">';
      h += '<button type="button" class="afhub-fb-submit" style="flex:1;background:' + cfg.color + ';color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer">Enviar</button>';
      h += '<button type="button" class="afhub-fb-skip" style="background:none;border:none;color:#80868b;font-size:12px;cursor:pointer;padding:7px 4px">Ahora no</button>';
      h += '</div></div>';
      return h;
    }
    function collectFeedbackAnswers() {
      var answers = [];
      if (!feedbackCard) return { answers: answers };
      var qEls = feedbackCard.querySelectorAll('.afhub-fb-q');
      for (var i = 0; i < qEls.length; i++) {
        var el = qEls[i];
        var qid = el.getAttribute('data-qid');
        var type = el.getAttribute('data-type');
        var required = el.getAttribute('data-required') === '1';
        var value = null;
        if (type === 'rating') {
          var v = parseInt(el.querySelector('.afhub-fb-stars').getAttribute('data-value'), 10);
          if (v > 0) value = v;
        } else if (type === 'choice' || type === 'yesno') {
          var checked = el.querySelector('input[type=radio]:checked');
          if (checked) value = checked.value;
        } else {
          var ta = el.querySelector('.afhub-fb-text');
          var t = ta && ta.value ? ta.value.trim() : '';
          if (t) value = t;
        }
        if (value === null || value === '') {
          if (required) return { error: 'Por favor responde las preguntas marcadas con *.' };
          continue;
        }
        answers.push({ questionId: qid, value: value });
      }
      return { answers: answers };
    }
    function removeFeedbackCard() {
      if (feedbackCard && feedbackCard.parentNode) feedbackCard.parentNode.removeChild(feedbackCard);
      feedbackCard = null;
    }
    // "Ahora no": quita la encuesta y continúa con la acción pendiente (cerrar, nueva conv., etc.)
    function dismissFeedback() {
      removeFeedbackCard();
      var cb = feedbackOnDone; feedbackOnDone = null;
      if (typeof cb === 'function') cb();
    }
    function submitFeedback() {
      var res = collectFeedbackAnswers();
      var errEl = feedbackCard && feedbackCard.querySelector('.afhub-fb-error');
      if (res.error) { if (errEl) { errEl.textContent = res.error; errEl.style.display = 'block'; } return; }
      if (!res.answers.length) { dismissFeedback(); return; }
      var wid = resolveWidgetIdForHandoff();
      if (wid && cfg.token) {
        try {
          fetch(cfg.host.replace(/\/$/, '') + '/api/widgets/' + encodeURIComponent(wid) + '/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Widget-Token': String(cfg.token).trim() },
            body: JSON.stringify({
              sessionId: chatSessionId,
              visitorId: getOrCreateVisitorId(cfg),
              agentId: cfg.agentId || '',
              answers: res.answers,
              token: String(cfg.token).trim(),
            }),
          });
        } catch (e) { /* fire-and-forget */ }
      }
      try { sessionStorage.setItem('afhub-fb-done:' + chatSessionId, '1'); } catch (e) { /* */ }
      try { emitEvent('survey_submitted', { count: res.answers.length }); } catch (e) { /* */ }
      // Reemplazar la encuesta por el agradecimiento, en línea (sin popup).
      if (feedbackCard) {
        feedbackCard.innerHTML = '<div class="afhub-fb-inner afhub-fb-thanks"><span class="afhub-fb-check">✓</span><span>' + fbEsc(cfg.feedbackThanks) + '</span></div>';
        feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      feedbackCard = null; // ya no hay encuesta activa (el agradecimiento queda en el chat)
      var cb = feedbackOnDone; feedbackOnDone = null;
      if (typeof cb === 'function') setTimeout(cb, 1600);
    }
    function openFeedbackSurvey(onDone) {
      if (!feedbackQs.length) { if (typeof onDone === 'function') onDone(); return; }
      if (feedbackCard) return; // ya hay una encuesta abierta en el chat
      feedbackOnDone = onDone || null;
      feedbackCard = document.createElement('div');
      feedbackCard.className = 'afhub-msg bot afhub-fb-card';
      feedbackCard.innerHTML = buildFeedbackHtml();
      messages.appendChild(feedbackCard);
      var groups = feedbackCard.querySelectorAll('.afhub-fb-stars');
      for (var g = 0; g < groups.length; g++) {
        (function (group) {
          var stars = group.querySelectorAll('.afhub-fb-star');
          for (var k = 0; k < stars.length; k++) {
            stars[k].addEventListener('click', function () {
              var val = parseInt(this.getAttribute('data-star'), 10);
              group.setAttribute('data-value', String(val));
              for (var m = 0; m < stars.length; m++) {
                var bv = parseInt(stars[m].getAttribute('data-star'), 10);
                stars[m].style.color = bv <= val ? '#f5b301' : '#ccc';
              }
            });
          }
        })(groups[g]);
      }
      feedbackCard.querySelector('.afhub-fb-submit').addEventListener('click', submitFeedback);
      feedbackCard.querySelector('.afhub-fb-skip').addEventListener('click', dismissFeedback);
      feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (widgetDisabled) {
      handoffBtn.disabled = true;
      handoffBtn.classList.add('afhub-action-btn--disabled');
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      clearUnreadHumanNotice();
      root.classList.add('afhub-open');
      chat.classList.add('visible');
      fab.classList.add('open');
      fab.classList.remove('afhub-fab--avatar');
      fab.innerHTML = ICON_X;
      fab.setAttribute('aria-label', 'Cerrar chat');
      syncChatPanelLayout();
      renderHistoryToDom();
      checkHumanModeOnOpen();
      checkIdleFeedback();
      // Al abrir el panel: marca como "visto" los mensajes humanos ya mostrados.
      Object.keys(humanShownIds).forEach(function (id) { ackHumanRead(id); });
      if (!widgetDisabled) input.focus();
      notify('onOpen');
      emitEvent('widget_opened');
    }

    function close() {
      if (!isOpen) return;
      // Encuesta al cerrar: si hay preguntas, hubo conversación y no se respondió aún.
      if (feedbackQs.length && !feedbackAlreadyDone()
          && countUserTurnsInHistory(history) > 0
          && !feedbackCard
          && typeof humanModeActive !== 'undefined' && !humanModeActive) {
        openFeedbackSurvey(function () { closeImpl(); });
        return;
      }
      closeImpl();
    }
    function closeImpl() {
      if (!isOpen) return;
      isOpen = false;
      chatLayout = 'floating';
      sidebarSize = 'compact';
      syncChatPanelLayout();
      root.classList.remove('afhub-open');
      chat.classList.remove('visible');
      fab.classList.remove('open');
      fab.innerHTML = orbHtmlForCfg(cfg);
      syncFabAvatarMode(fab, cfg);
      fab.setAttribute('aria-label', 'Abrir chat');
      notify('onClose');
      emitEvent('widget_closed');
    }

    function startNewConversation() {
      if (isLoading) return;
      emitEvent('widget_closed');
      clearPersistedChatState(cfg);
      try {
        sessionStorage.removeItem(chatSessionStorageKey(cfg) + ':long-warn');
      } catch (_e) {
        /* noop */
      }
      chatSessionId = rotateChatSessionId(cfg);
      history = [];
      feedbackOfferShown = false; // nueva conversación → puede volver a ofrecer la encuesta
      touchActivity();
      lastGeneratedImageDataUrl = '';
      lastSessionImageUrls = [];
      clearPendingAttachment();
      lastSessionImageUrls = [];
      clearPendingAttachment();
      historyDomReady = false;
      hideTyping();
      messages.innerHTML = '';
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;
      addMessage('bot', cfg.welcome);
      historyDomReady = true;
      saveChatToSession();
      emitEvent('widget_opened');
      if (isOpen) input.focus();
    }

    function toggle() {
      if (isOpen) close(); else open();
    }

    function destroy() {
      if (cfg.fabDraggable) {
        window.removeEventListener('resize', scheduleFabResizeForFab);
        clearTimeout(fabResizeTimer);
      }
      window.removeEventListener('afhub:show-launcher', onShowLauncherRequest);
      root.remove();
      delete INSTANCES[id];
    }

    function isImageModificationIntent(text) {
      var t = text.toLowerCase();
      var kw = [
        'mejora','mejorar','mejórala','mejóralo','mejorala','mejoralo',
        'modifica','modificar','modifícala','modifícalo','modificala','modificalo',
        'cambia','cambiar','cámbiala','cámbialo','cambiala','cambialo',
        'ajusta','ajustar','ajústala','ajústalo','ajustala','ajustalo',
        'refina','refinar','transforma','transformar',
        'modify','improve','edit the image','change the image','update the image',
        'hazla','hazlo','ponla','ponlo'
      ];
      for (var ki = 0; ki < kw.length; ki++) {
        if (t.indexOf(kw[ki]) !== -1) return true;
      }
      return false;
    }

    function resizeImageForI2IAsync(srcUrl, maxPx) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            if (!w || !h) { resolve(null); return; }
            var scale = Math.min(maxPx / w, maxPx / h, 1);
            var tw = Math.max(1, Math.round(w * scale));
            var th = Math.max(1, Math.round(h * scale));
            var canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            var ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0, tw, th);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = srcUrl;
      });
    }

    function resizeImageForUploadAsync(srcUrl, maxPx) {
      return resizeImageForI2IAsync(srcUrl, maxPx || 1600).then(function (dataUrl) {
        if (!dataUrl) return null;
        if (dataUrl.length > 1200000) {
          return resizeImageForI2IAsync(srcUrl, 1024);
        }
        return dataUrl;
      });
    }

    function syncSendButtonState() {
      var canSend = (!!input.value.trim() || !!pendingAttachment || pendingHumanAttachments.length > 0) && !isLoading;
      sendBtn.disabled = !canSend;
    }

    function clearPendingAttachment() {
      pendingAttachment = null;
      pendingHumanAttachments = [];
      attachPreview.style.display = 'none';
      attachPreview.innerHTML = '';
      if (attachInput) attachInput.value = '';
      syncSendButtonState();
    }

    // ── Adjuntos del visitante hacia el agente (modo humano): img/video/documento ──
    function renderHumanAttachPreviews() {
      if (!pendingHumanAttachments.length) {
        attachPreview.style.display = 'none';
        attachPreview.innerHTML = '';
        syncSendButtonState();
        return;
      }
      attachPreview.innerHTML = '';
      var row = document.createElement('div');
      row.className = 'afhub-attach-preview-inner';
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      for (var i = 0; i < pendingHumanAttachments.length; i++) {
        (function (att, idx) {
          var chip = document.createElement('div');
          chip.style.cssText = 'position:relative;display:flex;align-items:center;gap:6px;padding:' + (att.type === 'image' ? '0' : '5px 9px 5px 7px') + ';border:1px solid rgba(0,0,0,.12);border-radius:8px;background:#fff;max-width:160px;';
          if (att.type === 'image') {
            var im = document.createElement('img');
            im.src = att.url; im.alt = att.name || 'imagen';
            im.style.cssText = 'width:48px;height:48px;object-fit:cover;border-radius:8px;display:block;';
            chip.appendChild(im);
          } else {
            var ic = document.createElement('span');
            ic.textContent = att.type === 'video' ? '🎬' : '📄';
            ic.style.cssText = 'font-size:15px;flex-shrink:0;';
            var nm = document.createElement('span');
            nm.textContent = att.name || (att.type === 'video' ? 'video' : 'archivo');
            nm.style.cssText = 'font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            chip.appendChild(ic); chip.appendChild(nm);
          }
          var rm = document.createElement('button');
          rm.type = 'button'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Quitar');
          rm.style.cssText = 'position:absolute;top:-7px;right:-7px;width:18px;height:18px;border-radius:999px;border:none;background:#ef4444;color:#fff;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;';
          rm.addEventListener('click', function () {
            pendingHumanAttachments.splice(idx, 1);
            renderHumanAttachPreviews();
          });
          chip.appendChild(rm);
          row.appendChild(chip);
        })(pendingHumanAttachments[i], i);
      }
      attachPreview.appendChild(row);
      attachPreview.style.display = 'block';
      syncSendButtonState();
    }

    function humanAttachLimitBytes(mime) {
      if (/^image\//i.test(mime)) return 10 * 1024 * 1024;
      if (/^video\//i.test(mime)) return 100 * 1024 * 1024;
      return 25 * 1024 * 1024;
    }

    async function uploadVisitorAttachment(file) {
      var endpoint = cfg.host.replace(/\/$/, '') + '/api/widget/upload-attachment';
      var fd = new FormData();
      fd.append('file', file);
      if (cfg.token) fd.append('token', String(cfg.token).trim());
      if (cfg.widgetId && String(cfg.widgetId).trim()) fd.append('widgetId', String(cfg.widgetId).trim());
      if (chatSessionId) fd.append('sessionId', chatSessionId);
      var headers = {};
      if (cfg.token) headers['X-Widget-Token'] = String(cfg.token).trim();
      var res = await fetch(endpoint, { method: 'POST', headers: headers, body: fd });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.attachment) {
        throw new Error((json && json.error) ? json.error : 'No se pudo subir el archivo.');
      }
      return json.attachment;
    }

    function renderAttachPreview() {
      if (!pendingAttachment || !pendingAttachment.previewUrl) {
        clearPendingAttachment();
        return;
      }
      attachPreview.innerHTML =
        '<div class="afhub-attach-preview-inner">' +
        '<img class="afhub-attach-preview-img" src="' + pendingAttachment.previewUrl + '" alt="Captura adjunta">' +
        '<span class="afhub-attach-preview-label">Captura lista para enviar</span>' +
        '<button type="button" class="afhub-attach-preview-remove" aria-label="Quitar captura">×</button>' +
        '</div>';
      attachPreview.style.display = 'block';
      var rm = attachPreview.querySelector('.afhub-attach-preview-remove');
      if (rm) {
        rm.addEventListener('click', function () { clearPendingAttachment(); });
      }
      syncSendButtonState();
    }

    async function handleAttachFile(file) {
      if (!file) return;
      var mime = file.type || '';

      // ── MODO HUMANO: cualquier archivo (img/video/doc) se envía al agente (inbox) ──
      if (typeof humanModeActive !== 'undefined' && humanModeActive) {
        if (file.size > humanAttachLimitBytes(mime)) {
          addMessage('bot', 'El archivo es demasiado grande para enviarlo.');
          if (attachInput) attachInput.value = '';
          return;
        }
        if (pendingHumanAttachments.length >= 10) {
          if (attachInput) attachInput.value = '';
          return;
        }
        var placeholder = { type: /^image\//i.test(mime) ? 'image' : /^video\//i.test(mime) ? 'video' : 'file', name: file.name || 'archivo', url: '' };
        try {
          var uploaded = await uploadVisitorAttachment(file);
          pendingHumanAttachments.push(uploaded);
          renderHumanAttachPreviews();
        } catch (e) {
          addMessage('bot', (e && e.message) ? e.message : 'No se pudo subir el archivo.');
        }
        if (attachInput) attachInput.value = '';
        void placeholder;
        return;
      }

      // ── MODO AI: solo imágenes (visión) ──
      if (!/^image\//i.test(mime)) {
        addMessage('bot', 'Con el asistente solo puedes adjuntar imágenes. Para enviar videos o documentos, pulsa «Hablar con una persona».');
        if (attachInput) attachInput.value = '';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        addMessage('bot', 'La imagen es demasiado grande. Usa una captura de menos de 8 MB.');
        return;
      }
      var reader = new FileReader();
      var dataUrl = await new Promise(function (resolve, reject) {
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }).catch(function () { return ''; });
      if (!dataUrl) return;
      var resized = await resizeImageForUploadAsync(dataUrl, 1600);
      pendingAttachment = {
        previewUrl: resized || dataUrl,
        dataUrl: resized || dataUrl,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name || 'captura.jpg',
      };
      renderAttachPreview();
    }

    async function uploadPendingAttachment() {
      if (!pendingAttachment || !pendingAttachment.dataUrl) return [];
      var uploadEndpoint = cfg.host.replace(/\/$/, '') + '/api/widget/upload-image';
      var upHeaders = { 'Content-Type': 'application/json' };
      if (cfg.token) upHeaders['X-Widget-Token'] = String(cfg.token).trim();
      var upRes = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: upHeaders,
        body: JSON.stringify({
          dataUrl: pendingAttachment.dataUrl,
          sessionId: chatSessionId,
          widgetId: cfg.widgetId && String(cfg.widgetId).trim() ? String(cfg.widgetId).trim() : undefined,
          agentId: cfg.agentId || '',
          token: cfg.token && String(cfg.token).trim() ? String(cfg.token).trim() : undefined,
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs || 120000),
      });
      var upJson = await upRes.json().catch(function () { return {}; });
      if (!upRes.ok || !upJson.url) {
        throw new Error((upJson && upJson.error) ? upJson.error : 'No se pudo subir la captura.');
      }
      return [{ url: upJson.url, publicId: upJson.publicId || '', mimeType: pendingAttachment.mimeType }];
    }

    // Detectar si un mensaje es un saludo trivial (simplificado para el widget)
    function isWidgetGreeting(msg) {
      var greetings = /^(hola|ola|hey|hi|buenas|buenos|buenos dias|buenas tardes|buenas noches|saludos|saludo|gracias|thanks|ok|okey|vale|dale|listo|chao|chau|adios|bye|hasta|luego|jaja|lol)$/i;
      var trimmed = String(msg || '').trim().toLowerCase();
      return greetings.test(trimmed) && trimmed.length < 30;
    }

    async function send(textArg) {
      if (widgetDisabled) return;
      var text = typeof textArg === 'string' ? textArg.trim() : input.value.trim();
      var humanActive = (typeof humanModeActive !== 'undefined' && humanModeActive);
      var hasAttach = !!(pendingAttachment && pendingAttachment.dataUrl);
      var hasHumanAttach = humanActive && pendingHumanAttachments.length > 0;
      if ((!text && !hasAttach && !hasHumanAttach) || isLoading) return;
      if (!cfg.agentId) {
        var errNoAgent = { message: 'Configura agentId para usar el widget.', code: 'MISSING_AGENT_ID' };
        notify('onError', errNoAgent);
        addMessage('bot', errNoAgent.message);
        return;
      }

      var attachPreviewForMsg = null;
      if (hasAttach) {
        attachPreviewForMsg = {
          previewUrl: pendingAttachment.previewUrl,
          url: pendingAttachment.previewUrl,
          mimeType: pendingAttachment.mimeType,
        };
      }

      var displayText = text || (hasHumanAttach ? '' : 'Analiza esta captura y ayúdame a resolver el problema.');

      var humanAttachForMsg = hasHumanAttach ? pendingHumanAttachments.slice() : null;
      var userMsgOpts = attachPreviewForMsg
        ? { userImages: [attachPreviewForMsg] }
        : (humanAttachForMsg ? { attachments: humanAttachForMsg } : undefined);
      var wasLastUserMsgTrivial = isWidgetGreeting(displayText);
      addMessage('user', displayText, userMsgOpts);
      appendHumanSupportOfferInChat(displayText);
      history.push({ role: 'user', content: displayText });
      saveChatToSession();
      touchActivity();
      // Disparador #4: intención de cierre → ofrecer botón "Calificar" (suave, tras la respuesta del bot).
      if ((typeof humanModeActive === 'undefined' || !humanModeActive) && detectClosingIntent(displayText)) {
        setTimeout(offerFeedbackButton, 1500);
      }
      notify('onMessageSent', displayText);
      emitEvent('message_sent', { length: displayText.length, hasImage: hasAttach });
      input.value = '';
      input.style.height = 'auto';

      // ── MODO HUMANO: el mensaje va al agente (inbox), el AI NO responde ──────
      if (typeof humanModeActive !== 'undefined' && humanModeActive) {
        try {
          fetch(cfg.host.replace(/\/$/, '') + '/api/widget/user-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Widget-Token': String(cfg.token || '').trim() },
            body: JSON.stringify({
              sessionId: chatSessionId,
              content: displayText,
              attachments: humanAttachForMsg || [],
              token: String(cfg.token || '').trim(),
            }),
          });
        } catch (_hm) { /* el agente igual verá el mensaje en el siguiente refresh */ }
        clearPendingAttachment();
        syncSendButtonState();
        return; // No llamar al AI mientras un humano atiende.
      }

      sendBtn.disabled = true;
      newChatBtn.disabled = true;
      isLoading = true;

      var userImagesPayload = [];
      if (hasAttach) {
        showTyping('Subiendo captura…');
        try {
          userImagesPayload = await uploadPendingAttachment();
          lastSessionImageUrls = userImagesPayload.map(function (x) { return x.url; });
          clearPendingAttachment();
        } catch (upErr) {
          hideTyping();
          isLoading = false;
          newChatBtn.disabled = false;
          syncSendButtonState();
          var upMsg = upErr && upErr.message ? upErr.message : 'Error al subir la captura.';
          addMessage('bot', upMsg);
          notify('onError', { message: upMsg, code: 'IMAGE_UPLOAD_FAILED' });
          return;
        }
      }
      var baseHost = cfg.host.replace(/\/$/, '');
      var endpoint = baseHost + '/api/widget/chat';
      var streamEndpoint = baseHost + '/api/widget/chat/stream';
      maybeWarnLongConversation(cfg, countUserTurnsInHistory(history));

      var payload = {
        agentId: cfg.agentId,
        message: displayText,
        history: history.slice(0, -1),
        sessionId: chatSessionId,
        visitorId: getOrCreateVisitorId(cfg),
      };
      if (userImagesPayload.length) {
        payload.userImages = userImagesPayload;
      }
      if (cfg.widgetId && String(cfg.widgetId).trim()) {
        payload.widgetId = String(cfg.widgetId).trim();
      }
      if (cfg.token && String(cfg.token).trim()) {
        payload.token = String(cfg.token).trim();
      }

      // ── Image-to-image: attach resized thumbnail when user asks to modify previous image ──
      if (lastGeneratedImageDataUrl && isImageModificationIntent(displayText)) {
        try {
          var resizedI2I = await resizeImageForI2IAsync(lastGeneratedImageDataUrl, 128);
          if (resizedI2I) payload.previousImageDataUrl = resizedI2I;
        } catch (e) {
          log(cfg, 'warn', 'Could not resize previous image for i2i', e);
        }
      }

      var initialTyping =
        userImagesPayload.length
          ? 'Analizando captura…'
          : cfg.multiAgentEnabled && cfg.multiAgentMode === 'pipeline'
            ? 'Recopilando información…'
            : cfg.multiAgentEnabled && cfg.multiAgentMode === 'parallel'
              ? 'Consultando especialistas…'
              : cfg.multiAgentEnabled
                ? 'Analizando tu consulta…'
                : '';
      showTyping(initialTyping || 'Generando respuesta…');

      // ── SSE Streaming (cuando el servidor lo soporta) ──────────────────────
      var useStream = cfg.stream !== false && typeof window.ReadableStream !== 'undefined';

      if (useStream) {
        try {
          var streamHeaders = { 'Content-Type': 'application/json' };
          if (cfg.token) streamHeaders['X-Widget-Token'] = String(cfg.token).trim();
          var streamRes = await fetch(streamEndpoint, {
            method: 'POST',
            headers: streamHeaders,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(cfg.timeoutMs || 120000),
          });
          if (!streamRes.ok || !streamRes.body) throw new Error('stream_unavailable');

          var streamReader = streamRes.body.getReader();
          var streamDecoder = new TextDecoder();
          var streamBuf = '';
          var streamReply = '';
          var streamBubble = null;
          var streamDoneEvt = null;
          var streamErrorEvt = null;

          while (!streamErrorEvt) {
            var chunk = await streamReader.read();
            if (chunk.done) break;
            streamBuf += streamDecoder.decode(chunk.value, { stream: true });
            var lines = streamBuf.split('\n\n');
            streamBuf = lines.pop() || '';
            for (var li = 0; li < lines.length; li++) {
              var line = lines[li].trim();
              if (!line.startsWith('data:')) continue;
              var rawJson = line.slice(5).trim();
              var evt;
              try { evt = JSON.parse(rawJson); } catch { continue; }
              if (evt.type === 'status' && typeof evt.message === 'string') {
                var stPhase = typeof evt.phase === 'string' ? evt.phase : '';
                if (!document.getElementById(typingId)) showTyping(evt.message, stPhase);
                else updateTypingStatus(evt.message, stPhase);
                continue;
              }
              if (evt.type === 'token') {
                hideTyping();
                streamReply += typeof evt.text === 'string' ? evt.text : '';
                if (!streamBubble) {
                  streamBubble = addMessage('bot', botReplyForDisplay(streamReply), { streaming: true });
                } else {
                  updateStreamBubble(streamBubble, streamReply);
                }
              } else if (evt.type === 'done') {
                streamDoneEvt = evt;
                hideTyping();
              } else if (evt.type === 'error') {
                streamErrorEvt = evt;
                hideTyping();
                var errMsg = evt.message || 'Error del agente.';
                if (evt.code === 'SESSION_TURN_LIMIT') {
                  errMsg = 'Esta conversación llegó al límite de mensajes. Pulsa «Nueva conversación» para empezar de cero.';
                }
                var streamErrorOpts = (evt.code === 'HUB_CHAT_PROXY_FAILED' || evt.code === 'AGENT_ERROR') ? { error: true, showWhatsApp: evt.code === 'HUB_CHAT_PROXY_FAILED' } : undefined;
                addMessage('bot', errMsg, streamErrorOpts);
                notify('onError', { message: errMsg, code: evt.code });
              }
            }
          }

          if (streamDoneEvt) {
            var doneEvt = streamDoneEvt;
            var finalRaw = resolveStreamFinalRaw(doneEvt, streamReply);
            var finalReply = botReplyForDisplay(finalRaw);
            var stTools = doneEvt.toolsUsed;
            if ((!stTools || !stTools.length) && doneEvt.data && doneEvt.data.toolsUsed && doneEvt.data.toolsUsed.length) {
              stTools = doneEvt.data.toolsUsed;
            }
            var stMcpTag = typeof doneEvt.mcpTag === 'string' ? doneEvt.mcpTag.trim() : '';
            if (!stMcpTag && doneEvt.data && typeof doneEvt.data.mcpTag === 'string') {
              stMcpTag = doneEvt.data.mcpTag.trim();
            }
            var stUsedModel = typeof doneEvt.usedModel === 'string' ? doneEvt.usedModel.trim() : '';
            if (!stUsedModel && doneEvt.data && typeof doneEvt.data.usedModel === 'string') {
              stUsedModel = doneEvt.data.usedModel.trim();
            }
            if (!streamBubble && finalReply) {
              streamBubble = addMessage('bot', finalReply, { streaming: true });
            }
            if (streamBubble) {
              var te2 = streamBubble.querySelector('.afhub-msg-text');
              if (te2) te2.innerHTML = formatBotHtml(finalReply);
              streamBubble.classList.remove('afhub-msg--streaming');
              appendMultiAgentBadge(streamBubble, doneEvt.multiAgent);
              if (cfg.showMcpUi) {
                appendMcpMetadataToBubble(streamBubble, { toolsUsed: stTools, mcpTag: stMcpTag });
              }
              if (stUsedModel) appendFallbackTagToBubble(streamBubble, stUsedModel, cfg.debug);
              if (doneEvt.images && doneEvt.images.length) {
                var firstEvtImg = doneEvt.images[0];
                var firstEvtUrl = firstEvtImg && (firstEvtImg.dataUrl || firstEvtImg.url);
                if (typeof firstEvtUrl === 'string' && /^data:image\//i.test(firstEvtUrl)) {
                  lastGeneratedImageDataUrl = firstEvtUrl;
                }
                for (var si = 0; si < doneEvt.images.length; si++) {
                  var sItem = doneEvt.images[si];
                  var sUrl = sItem && (sItem.dataUrl || sItem.url);
                  if (typeof sUrl === 'string' && (/^data:image\//i.test(sUrl) || /^https?:\/\//i.test(sUrl))) {
                    var sWrap = document.createElement('div');
                    sWrap.className = 'afhub-img-wrap';
                    appendGeneratedImage(sWrap, sUrl, sItem, si);
                    streamBubble.appendChild(sWrap);
                  }
                }
              }
            }
            resolvedAgentId = doneEvt.agentId || resolvedAgentId;
            history.push({ role: 'model', content: finalReply });
            saveChatToSession();
            notify('onMessageReceived', finalReply);
            emitMultiAgentEvent(doneEvt.multiAgent);
            var stTagInf = stMcpTag;
            if (!stTagInf && stTools && stTools.length) stTagInf = inferMcpTagFromToolIds(stTools);
            emitEvent('message_received', {
              length: finalReply.length,
              streaming: true,
              mcpTag: stTagInf || null,
              toolsUsed: stTools && stTools.length ? stTools : null,
            });
            log(cfg, 'debug', '[TTS] Stream complete', {
              streamReplyLen: streamReply.length,
              finalRawLen: finalRaw.length,
              finalReplyLen: finalReply.length,
            });
            speakBotReplyIfEnabled(finalReply, streamBubble);
          }
          isLoading = false;
          sendBtn.disabled = false;
          syncSendButtonState();
          newChatBtn.disabled = false;
          return;
        } catch (streamErr) {
          log(cfg, 'warn', 'Stream failed, falling back to standard', streamErr);
          // Fall through to standard fetch
        }
      }

      // ── Standard (non-streaming) fallback ─────────────────────────────────
      try {
      var data = await fetchJsonWithRetry(endpoint, payload, cfg);
        hideTyping();
        var replyRaw = data.reply || data.response || data.text || 'Sin respuesta';
        var reply = botReplyForDisplay(replyRaw);
        resolvedAgentId = data.agentId || resolvedAgentId;
        var imgs = data.images;
        if ((!imgs || !imgs.length) && data.data && data.data.images && data.data.images.length) {
          imgs = data.data.images;
        }
        if (imgs && imgs.length) {
          var firstImg = imgs[0];
          var firstImgUrl = firstImg && (firstImg.dataUrl || firstImg.url);
          if (typeof firstImgUrl === 'string' && /^data:image\//i.test(firstImgUrl)) {
            lastGeneratedImageDataUrl = firstImgUrl;
          }
        }
        var toolsUsed = data.toolsUsed;
        if ((!toolsUsed || !toolsUsed.length) && data.data && data.data.toolsUsed && data.data.toolsUsed.length) {
          toolsUsed = data.data.toolsUsed;
        }
        var mcpTag = typeof data.mcpTag === 'string' ? data.mcpTag.trim() : '';
        if (!mcpTag && data.data && typeof data.data.mcpTag === 'string') {
          mcpTag = data.data.mcpTag.trim();
        }
        if (!mcpTag && toolsUsed && toolsUsed.length) {
          mcpTag = inferMcpTagFromToolIds(toolsUsed);
        }
        var usedModel = typeof data.usedModel === 'string' ? data.usedModel.trim() : '';
        if (!usedModel && data.data && typeof data.data.usedModel === 'string') {
          usedModel = data.data.usedModel.trim();
        }
        var cooldown = data.code === 'AGENT_COOLDOWN' || data.cooldown === true;
        var botOpts = undefined;
        var showTools = cfg.showMcpUi && toolsUsed && toolsUsed.length;
        var showMcpChip = cfg.showMcpUi && mcpTag;
        if ((imgs && imgs.length) || showTools || showMcpChip || cooldown) {
          botOpts = {};
          if (imgs && imgs.length) botOpts.images = imgs;
          if (showTools) botOpts.toolsUsed = toolsUsed;
          if (showMcpChip) botOpts.mcpTag = mcpTag;
          if (cooldown) botOpts.cooldown = true;
        }
        var qh = data.quotaHint;
        if (qh && !cooldown) {
          var qHtml = formatQuotaTagHtml(qh);
          if (qHtml) {
            botOpts = botOpts || {};
            botOpts.quotaHtml = qHtml;
          }
        }
        function finalizeStandardBubble(botBubble, finalReply) {
          appendMultiAgentBadge(botBubble, data.multiAgent);
          if (usedModel) appendFallbackTagToBubble(botBubble, usedModel, cfg.debug);
          history.push({ role: 'model', content: finalReply });
          saveChatToSession();
          notify('onMessageReceived', finalReply);
          emitMultiAgentEvent(data.multiAgent);
          emitEvent('message_received', {
            length: String(finalReply || '').length,
            model: data.model || null,
            mcpTag: mcpTag || null,
            toolsUsed: toolsUsed && toolsUsed.length ? toolsUsed : null
          });
        }
        // Detectar si fue respuesta a saludo trivial
        var qHtmlForReveal = qh && !cooldown ? formatQuotaTagHtml(qh) : '';
        var useReveal = reply.length >= 48 && !(imgs && imgs.length) && !cooldown && !qHtmlForReveal;
        if (wasLastUserMsgTrivial) {
          if (botOpts === undefined) botOpts = {};
          botOpts.noFeedback = true;
          botOpts.wasGreeting = true;
        }

        if (useReveal) {
          revealBotReplyProgressively(reply, function (botBubble, finalReply) {
            finalizeStandardBubble(botBubble, finalReply);
          });
        } else {
          var botBubble = addMessage('bot', reply, botOpts);
          finalizeStandardBubble(botBubble, reply);
        }
      } catch (e) {
        hideTyping();
        var isHubError = e && e.code === 'HUB_CHAT_PROXY_FAILED';
        var msg = isHubError && e && e.message
          ? e.message
          : 'El agente no puede responder ahora. Espera unos segundos e inténtalo de nuevo o si prefieres atención inmediata, puedes escribirnos a ';
        var botOpts = { error: true, showWhatsApp: true };
        log(cfg, 'debug', 'Chat error - showing WhatsApp button', { isHubError, msgLength: msg.length, botOpts });
        console.log('[AgentFlowhub Widget] Error caught - WhatsApp button should appear:', { isHubError, code: e && e.code, msgLength: msg.length });
        addMessage('bot', msg, botOpts);
        notify('onError', { message: msg, code: 'REQUEST_ERROR' });
        emitEvent('widget_error', { message: msg });
        log(cfg, 'error', 'Request failed', e);
      } finally {
        isLoading = false;
        sendBtn.disabled = false;
        syncSendButtonState();
        newChatBtn.disabled = false;
      }
    }

    // ── Voice Mode ─────────────────────────────────────────────────────────────
    var voiceActive = false;
    var ttsMode = false; // TTS independiente (leer respuestas sin mic)
    var voiceState = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'
    var recognitionRef = null;
    var voiceShouldBeActive = false;
    var ttsAudio = null;
    var ttsUtterance = null;
    var ttsSessionId = 0;

    function ttsCleanText(text) {
      return String(text || '')
        .replace(/<[^>]*>/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, function(m) { return m.slice(1, -1); })
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#+\s/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\n+/g, '. ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
    }

    /** Chrome trunca utterances largos; partir en trozos cortos y encolarlos. */
    function ttsSplitIntoChunks(text, maxLen) {
      maxLen = maxLen || 180;
      if (!text) return [];
      if (text.length <= maxLen) return [text];
      var chunks = [];
      var rest = text;
      while (rest.length > 0) {
        if (rest.length <= maxLen) {
          chunks.push(rest);
          break;
        }
        var slice = rest.slice(0, maxLen);
        var breakAt = Math.max(
          slice.lastIndexOf('. '),
          slice.lastIndexOf('! '),
          slice.lastIndexOf('? '),
          slice.lastIndexOf('… '),
          slice.lastIndexOf(', ')
        );
        if (breakAt < Math.floor(maxLen * 0.35)) {
          breakAt = slice.lastIndexOf(' ');
        }
        if (breakAt < Math.floor(maxLen * 0.25)) {
          chunks.push(rest.slice(0, maxLen));
          rest = rest.slice(maxLen).trim();
        } else {
          chunks.push(rest.slice(0, breakAt + 1).trim());
          rest = rest.slice(breakAt + 1).trim();
        }
      }
      return chunks.filter(function(c) { return c.length > 0; });
    }

    function setVoiceState(state) {
      voiceState = state;
      if (!voiceBar) return;
      var dot = voiceBar.querySelector('.afhub-voice-dot');
      var label = voiceBar.querySelector('.afhub-voice-label');
      if (!dot || !label) return;
      dot.className = 'afhub-voice-dot afhub-voice-dot--' + state;
      var labels = { listening: 'Escuchando...', thinking: 'Pensando...', speaking: 'Hablando...' };
      label.textContent = labels[state] || 'Escuchando...';
    }

    function ttsBestVoice(lang) {
      var voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      // Si hay una voz configurada por nombre, úsala directamente
      if (cfg.voiceName) {
        var named = voices.find(function(v) { return v.name === cfg.voiceName; });
        if (named) return named;
      }
      // Preferencia: idioma exacto con nombres de alta calidad (Neural, Premium, Google, Microsoft)
      var preferred = ['neural', 'premium', 'google', 'microsoft', 'enhanced'];
      var base = lang.split('-')[0];
      var byLang = voices.filter(function(v) { return v.lang === lang || v.lang.startsWith(base); });
      if (!byLang.length) byLang = voices.filter(function(v) { return v.lang.startsWith('es'); });
      for (var p = 0; p < preferred.length; p++) {
        var hit = byLang.find(function(v) { return v.name.toLowerCase().indexOf(preferred[p]) !== -1; });
        if (hit) return hit;
      }
      return byLang[0] || null;
    }

    function ttsSpeak(text, onEnd) {
      var cleaned = ttsCleanText(text);
      if (!cleaned) { if (onEnd) onEnd(); return; }

      if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }

      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.cancel();

      var lang = cfg.voiceLang || navigator.language || 'es-ES';
      var chunks = ttsSplitIntoChunks(cleaned, 180);
      var session = ++ttsSessionId;
      var idx = 0;

      log(cfg, 'debug', '[TTS] Speaking', { chars: cleaned.length, chunks: chunks.length });

      function speakNext() {
        if (session !== ttsSessionId) return;
        if (idx >= chunks.length) {
          ttsUtterance = null;
          if (onEnd) onEnd();
          return;
        }
        var chunk = chunks[idx++];
        var utt = new SpeechSynthesisUtterance(chunk);
        utt.lang = lang;
        utt.rate = 1.05;
        utt.pitch = 1.0;
        var voice = ttsBestVoice(lang);
        if (voice) utt.voice = voice;

        utt.onend = function() {
          if (session !== ttsSessionId) return;
          // Chrome a veces pausa la cola entre chunks
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
          speakNext();
        };
        utt.onerror = function() {
          if (session !== ttsSessionId) return;
          speakNext();
        };
        ttsUtterance = utt;
        window.speechSynthesis.speak(utt);
      }

      function start() { speakNext(); }

      var voices = window.speechSynthesis.getVoices();
      if (!voices.length) {
        var done = false;
        window.speechSynthesis.addEventListener('voiceschanged', function onVC() {
          window.speechSynthesis.removeEventListener('voiceschanged', onVC);
          if (!done && session === ttsSessionId) { done = true; start(); }
        });
        setTimeout(function() { if (!done && session === ttsSessionId) { done = true; start(); } }, 500);
      } else {
        start();
      }
    }

    function ttsStop() {
      ttsSessionId++;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (ttsAudio) { ttsAudio.pause(); ttsAudio = null; }
      ttsUtterance = null;
    }

    function speakBotReplyIfEnabled(text, bubble) {
      if (!(voiceActive || ttsMode)) return;
      var ttsText = String(text || '').trim();
      if (bubble) {
        var domText = ttsTextFromMessageBubble(bubble);
        if (domText.length > ttsText.length) ttsText = domText;
      }
      if (!ttsText) return;
      if (voiceActive) setVoiceState('speaking');
      log(cfg, 'debug', '[TTS] Speaking reply', { length: ttsText.length, preview: ttsText.substring(0, 120) });
      ttsSpeak(ttsText, function() {
        if (voiceActive && voiceShouldBeActive) {
          setTimeout(startListening, 300);
          setVoiceState('listening');
        }
      });
    }

    function _doStartRecognition() {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (recognitionRef) { try { recognitionRef.abort(); } catch(_) {} }
      voiceShouldBeActive = true;
      setVoiceState('listening');

      var rec = new SR();
      rec.lang = cfg.voiceLang || navigator.language || 'es-ES';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = true;

      rec.onresult = function(event) {
        var interim = '';
        var final = '';
        for (var i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
          else interim += event.results[i][0].transcript;
        }
        if (interim) input.value = interim;
        if (final) {
          final = final.trim();
          input.value = final;
          if (final) {
            setVoiceState('thinking');
            sendBtn.disabled = false;
            send(final);
          } else if (voiceShouldBeActive) {
            setTimeout(startListening, 200);
          }
        }
      };

      rec.onerror = function(event) {
        log(cfg, 'warn', 'Voice STT error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          // Permiso denegado — detener todo
          stopVoice();
          if (voiceBar) {
            var label = voiceBar.querySelector('.afhub-voice-label');
            if (label) label.textContent = 'Permiso de micrófono denegado';
          }
        } else if (event.error === 'no-speech' || event.error === 'aborted') {
          if (voiceShouldBeActive) setTimeout(startListening, 300);
        } else {
          if (voiceShouldBeActive) setTimeout(startListening, 500);
        }
      };

      rec.onend = function() {
        if (voiceShouldBeActive && voiceState === 'listening') {
          setTimeout(startListening, 150);
        }
      };

      recognitionRef = rec;
      try {
        rec.start();
      } catch(e) {
        log(cfg, 'warn', 'rec.start() threw:', e && e.message);
        stopVoice();
      }
    }

    function startListening() {
      if (!hasSpeechAPI) return;
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      // Pide permiso de micrófono explícitamente para que el navegador muestre el diálogo
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(function(stream) {
            // Libera el stream de getUserMedia — SpeechRecognition lo manejará
            stream.getTracks().forEach(function(t) { t.stop(); });
            _doStartRecognition();
          })
          .catch(function(err) {
            log(cfg, 'warn', 'Microphone permission denied:', err && err.message);
            stopVoice();
            if (voiceBar) {
              var label = voiceBar.querySelector('.afhub-voice-label');
              if (label) label.textContent = 'Permiso de micrófono denegado';
            }
          });
      } else {
        _doStartRecognition();
      }
    }

    function stopVoice() {
      voiceShouldBeActive = false;
      voiceActive = false;
      voiceState = 'idle';
      if (recognitionRef) { try { recognitionRef.abort(); } catch(_) {} recognitionRef = null; }
      ttsStop();
      if (voiceBar) voiceBar.classList.remove('afhub-voice-bar--active');
      if (micBtn) { micBtn.innerHTML = ICON_MIC; micBtn.classList.remove('afhub-mic--active'); }
    }

    function toggleVoice() {
      if (voiceActive) {
        stopVoice();
      } else {
        voiceActive = true;
        if (voiceBar) voiceBar.classList.add('afhub-voice-bar--active');
        if (micBtn) { micBtn.innerHTML = ICON_MIC_OFF; micBtn.classList.add('afhub-mic--active'); }
        if (!isOpen) open();
        startListening();
      }
    }

    // Intercepta la respuesta del bot para TTS en modo voz o ttsMode
    var _origAddMessage = addMessage;
    function addMessageWithTTS(type, text, imgOpts) {
      var el = _origAddMessage(type, text, imgOpts);
      // En streaming el texto llega por tokens; el TTS se dispara al recibir "done".
      if (type === 'bot' && (voiceActive || ttsMode) && !(imgOpts && imgOpts.streaming)) {
        var ttsText = String(text || '');
        log(cfg, 'debug', '[TTS] Text received', { length: ttsText.length, preview: ttsText.substring(0, 100) });
        speakBotReplyIfEnabled(ttsText, el);
      }
      return el;
    }
    addMessage = addMessageWithTTS;

    function syncSpeakerMenuItem() {
      if (!speakerMenuItem) return;
      speakerMenuItem.innerHTML =
        (ttsMode ? ICON_VOLUME_ON : ICON_VOLUME_OFF) +
        '<span>' +
        (ttsMode ? 'Desactivar lectura en voz alta' : 'Lectura en voz alta') +
        '</span>';
      speakerMenuItem.classList.toggle('afhub-settings-speaker--active', ttsMode);
    }

    // Menú ⋮ — toggle TTS
    if (speakerMenuItem) {
      speakerMenuItem.addEventListener('click', function () {
        ttsMode = !ttsMode;
        syncSpeakerMenuItem();
        if (!ttsMode) ttsStop();
      });
    }

    // Event listener para el botón stop en la barra de voz
    if (voiceBar) {
      var stopBtn = voiceBar.querySelector('.afhub-voice-stop');
      if (stopBtn) stopBtn.addEventListener('click', stopVoice);
    }
    if (micBtn) micBtn.addEventListener('click', toggleVoice);

    // Detener voz al cerrar el widget
    var _origClose = close;
    close = function() {
      if (voiceActive) stopVoice();
      _origClose();
    };
    // ── Fin Voice Mode ─────────────────────────────────────────────────────────

    if (launcherDismiss) {
      launcherDismiss.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
      });
      launcherDismiss.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        hideLauncher(true);
      });
    }

    fab.addEventListener('click', function (e) {
      if (suppressFabClick) {
        suppressFabClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      toggle();
    });
    if (cfg.fabDraggable) {
      fab.style.touchAction = 'none';
      fab.style.cursor = 'grab';
      fab.addEventListener('pointerdown', function (e) {
        if (chatLayout === 'sidebar') return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        var rect = root.getBoundingClientRect();
        fabDrag = {
          pid: e.pointerId,
          ox: e.clientX - rect.left,
          oy: e.clientY - rect.top,
          sx: e.clientX,
          sy: e.clientY,
          moved: false
        };
        try {
          fab.setPointerCapture(e.pointerId);
        } catch (_err) {
          /* noop */
        }
      });
      fab.addEventListener('pointermove', function (e) {
        if (!fabDrag || e.pointerId !== fabDrag.pid) return;
        var pad = 8;
        var vw = window.innerWidth || 320;
        var vh = window.innerHeight || 568;
        var nw = root.offsetWidth || 72;
        var nh = root.offsetHeight || 72;
        if (!fabDrag.moved) {
          if (Math.abs(e.clientX - fabDrag.sx) < 6 && Math.abs(e.clientY - fabDrag.sy) < 6) return;
          fabDrag.moved = true;
          fab.classList.add('afhub-fab--dragging');
        }
        var nl = clamp(e.clientX - fabDrag.ox, pad, Math.max(pad, vw - nw - pad));
        var nt = clamp(e.clientY - fabDrag.oy, pad, Math.max(pad, vh - nh - pad));
        root.style.left = nl + 'px';
        root.style.top = nt + 'px';
        root.style.right = '';
        root.style.bottom = '';
        root.style.transform = '';
        root.style.width = '';
      });
      function endFabPointerDrag(e) {
        if (!fabDrag) return;
        if (e && e.pointerId != null && e.pointerId !== fabDrag.pid) return;
        try {
          fab.releasePointerCapture(fabDrag.pid);
        } catch (_er) {
          /* noop */
        }
        fab.classList.remove('afhub-fab--dragging');
        if (fabDrag.moved) {
          finalizeFabDragToCfg();
          clampCustomLauncherToViewport();
          persistFabDragToSession();
          syncChatPanelLayout();
          suppressFabClick = true;
        }
        fabDrag = null;
      }
      fab.addEventListener('pointerup', endFabPointerDrag);
      fab.addEventListener('pointercancel', endFabPointerDrag);
    }
    layoutBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (chatLayout === 'floating') {
        chatLayout = 'sidebar';
      } else {
        chatLayout = 'floating';
        sidebarSize = 'compact';
      }
      syncChatPanelLayout();
    });
    expandBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (chatLayout !== 'sidebar') return;
      if (sidebarSize === 'compact') sidebarSize = 'full';
      else if (sidebarSize === 'full') sidebarSize = 'fullscreen';
      else sidebarSize = 'compact';
      syncChatPanelLayout();
    });
    closeBtn.addEventListener('click', close);

    /** Menú Ajustes — abrir/cerrar y manejar opciones */
    settingsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = settingsMenu.style.display !== 'none';
      settingsMenu.style.display = isOpen ? 'none' : 'block';
    });
    /** Cerrar el menú al click fuera */
    document.addEventListener('click', function (e) {
      if (!settingsWrap.contains(e.target)) settingsMenu.style.display = 'none';
    });
    var newChatMenuItem = settingsMenu.querySelector('.afhub-settings-new-chat');
    if (newChatMenuItem) {
      newChatMenuItem.addEventListener('click', function () {
        settingsMenu.style.display = 'none';
        startNewConversation();
      });
    }
    /** Opción Borrar conversación */
    var clearBtnEl = settingsMenu.querySelector('.afhub-settings-clear');
    if (clearBtnEl) {
      clearBtnEl.addEventListener('click', function () {
        settingsMenu.style.display = 'none';
        var ok = window.confirm('¿Borrar toda la conversación? Esta acción no se puede deshacer.');
        if (ok) startNewConversation();
      });
    }
    sendBtn.addEventListener('click', function () { send(); });
    if (attachBtn && attachInput) {
      attachBtn.addEventListener('click', function () {
        if (!isLoading) attachInput.click();
      });
      attachInput.addEventListener('change', function () {
        var f = attachInput.files && attachInput.files[0];
        if (f) void handleAttachFile(f);
      });
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    input.addEventListener('input', function () {
      syncSendButtonState();
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 88) + 'px';
    });

    if (cfg.autoOpen) setTimeout(open, 80);
    else setTimeout(function () { checkHumanModeOnOpen({ skipReconnectBanner: true }); }, 400);
    emitEvent('widget_loaded');

    var api = {
      id: id,
      open: open,
      close: close,
      toggle: toggle,
      send: send,
      newConversation: startNewConversation,
      showLauncher: function () { showLauncher(true); },
      hideLauncher: function () { hideLauncher(true); },
      destroy: destroy,
      getState: function () {
        return {
          isOpen: isOpen,
          isLoading: isLoading,
          launcherHidden: root.classList.contains('afhub-launcher-hidden'),
          agentId: cfg.agentId,
          resolvedAgentId: resolvedAgentId,
          sessionId: chatSessionId
        };
      }
    };

    return { api: api };
  }

  async function fetchJsonWithRetry(url, payload, cfg) {
    var lastError = null;
    for (var i = 0; i <= cfg.retries; i++) {
      try {
        return await fetchJson(url, payload, cfg.timeoutMs, cfg.token);
      } catch (e) {
        lastError = e;
        if (i < cfg.retries) await delay(250 + i * 350);
      }
    }
    throw lastError || new Error('Error de red');
  }

  async function fetchJson(url, payload, timeoutMs, token) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: assign(
          { 'Content-Type': 'application/json' },
          token ? { 'X-Widget-Token': String(token) } : {}
        ),
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        var SERVICE_ERROR = 'No podemos procesar tu solicitud en este momento. Comunícate con soporte.';
        var serverMsg = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : '';
        if (data.code === 'QUOTA_EXCEEDED' || data.code === 'SUBAGENT_LIMIT_EXCEEDED' || data.code === 'WIDGET_PROVIDER_SUBSCRIPTION_REQUIRED' || data.code === 'WIDGET_DISABLED') {
          throw new Error(SERVICE_ERROR);
        }
        if (res.status === 429) {
          throw new Error('Demasiadas solicitudes. Intenta de nuevo en un momento.');
        }
        // 502 HUB_CHAT_PROXY_FAILED u otros JSON con `error` del backend / proxy
        if (serverMsg && (res.status === 502 || res.status === 503 || data.code === 'HUB_CHAT_PROXY_FAILED' || data.code === 'LANDING_SECRET_MISSING')) {
          var err = new Error(serverMsg);
          err.code = data.code;
          throw err;
        }
        throw new Error(serverMsg || SERVICE_ERROR);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function autoInitFromScript() {
    var script = document.currentScript || findScriptTag();
    if (!script) return;
    var hasAgentId = script.getAttribute('data-agent-id');
    var hasToken   = script.getAttribute('data-token');
    if (!hasAgentId && !hasToken) return;
    var config = {
      agentId: attr(script, 'data-agent-id', ''),
      token: attr(script, 'data-token', ''),
      host: attr(script, 'data-host', getOriginFromScript(script)),
      color: attr(script, 'data-color', DEFAULTS.color),
      title: attr(script, 'data-title', DEFAULTS.title),
      subtitle: attr(script, 'data-subtitle', DEFAULTS.subtitle),
      welcome: attr(script, 'data-welcome', DEFAULTS.welcome),
      position: attr(script, 'data-position', DEFAULTS.position),
      avatar: attr(script, 'data-avatar', DEFAULTS.avatar),
      borderRadius: attr(script, 'data-border-radius', String(DEFAULTS.borderRadius)),
      autoOpen: attr(script, 'data-auto-open', 'false') === 'true',
      debug: attr(script, 'data-debug', 'false') === 'true',
      theme: attr(script, 'data-theme', DEFAULTS.theme),
      voiceEnabled: attr(script, 'data-voice-enabled', 'true') !== 'false',
      voiceLang: attr(script, 'data-voice-lang', ''),
      voiceName: attr(script, 'data-voice-name', ''),
      humanSupportPhone: attr(script, 'data-human-support-phone', ''),
      showMcpUi:
        script.getAttribute('data-afhub-widget-preview') === '1' ||
        attr(script, 'data-show-mcp-ui', 'false') === 'true',
      fabDraggable: attr(script, 'data-fab-draggable', 'true') !== 'false',
      fabDismissible: attr(script, 'data-fab-dismissible', 'true') !== 'false',
      policyEnabled: attr(script, 'data-policy-enabled', 'true') !== 'false',
      policyText: attr(script, 'data-policy-text', DEFAULTS.policyText),
      policyLinkLabel: attr(script, 'data-policy-link-label', DEFAULTS.policyLinkLabel),
      policyUrl: attr(script, 'data-policy-url', DEFAULTS.policyUrl)
    };
    try {
      init(config);
    } catch (e) {
      console.error('[AgentFlowhub Widget]', e);
    }
  }

  function findScriptTag() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('widget.js') !== -1) return scripts[i];
    }
    return null;
  }

  function getScriptOrigin() {
    var script = findScriptTag();
    return getOriginFromScript(script);
  }

  function getOriginFromScript(script) {
    if (!script || !script.src) return '';
    try { return new URL(script.src).origin; } catch (_e) { return ''; }
  }

  function attr(script, name, fallback) {
    var value = script ? script.getAttribute(name) : null;
    return value == null || value === '' ? fallback : value;
  }

  function hexToRgbOrb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length !== 6) return null;
    var n = parseInt(h, 16);
    if (!isFinite(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHexOrb(r, g, b) {
    function p2(x) {
      var s = Math.round(clamp(x, 0, 255)).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + p2(r) + p2(g) + p2(b);
  }

  function rgbToHslOrb(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hue2rgbOrb(p, q, t) {
    var u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  }

  function hslToRgbOrb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    if (s === 0) {
      var v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return {
      r: Math.round(hue2rgbOrb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgbOrb(p, q, h) * 255),
      b: Math.round(hue2rgbOrb(p, q, h - 1 / 3) * 255)
    };
  }

  /** Degradado tricolor nítido (marca + 2 tonos HSL) para orbe y cabecera */
  function orbGradientBase(hex) {
    if (!isHexColor(hex)) return hex;
    var rgb = hexToRgbOrb(hex);
    if (!rgb) return hex;
    var hsl = rgbToHslOrb(rgb.r, rgb.g, rgb.b);
    var h = hsl.h;
    var s = hsl.s;
    var l = hsl.l;
    var light = hslToRgbOrb(h + 10, clamp(s + 8, 0, 100), clamp(l + 15, 10, 94));
    var deep = hslToRgbOrb(h - 12, clamp(s - 3, 12, 100), clamp(l - 20, 8, 88));
    var c1 = rgbToHexOrb(light.r, light.g, light.b);
    var c2 = hex;
    var c3 = rgbToHexOrb(deep.r, deep.g, deep.b);
    return 'linear-gradient(148deg,' + c1 + ' 0%,' + c2 + ' 46%,' + c3 + ' 100%)';
  }

  /** Usa orbLight + orbDeep del config si ambos son HEX válidos; si no, tonos automáticos desde color */
  function orbGradientFromCfg(cfg) {
    var ol = cfg.orbLight;
    var od = cfg.orbDeep;
    if (ol && od && isHexColor(ol) && isHexColor(od)) {
      return 'linear-gradient(148deg,' + ol + ' 0%,' + cfg.color + ' 46%,' + od + ' 100%)';
    }
    return orbGradientBase(cfg.color);
  }

  /** Iridiscencia tipo gel/holográfica (sin patrón radial de abanico). */
  function orbIridescentStack(cfg) {
    var hex = cfg.color;
    if (!isHexColor(hex)) hex = '#6366f1';
    var rgb = hexToRgbOrb(hex);
    var hsl = rgb ? rgbToHslOrb(rgb.r, rgb.g, rgb.b) : null;
    var h0 = hsl ? hsl.h : 250;
    var from = Math.round((h0 * 1.38) % 360);
    var swirlX = 51;
    var swirlY = 53;
    var c1 = h0 + 12;
    var c2 = h0 + 138;
    var c3 = h0 + 274;
    return (
      'radial-gradient(ellipse 108% 86% at 18% 12%,rgba(255,255,255,.95) 0%,rgba(255,255,255,.3) 20%,rgba(255,255,255,.08) 36%,transparent 58%),' +
      'radial-gradient(circle at 76% 78%,hsla(' + c1 + ',92%,67%,.24) 0%,hsla(' + c1 + ',92%,67%,.06) 28%,transparent 52%),' +
      'radial-gradient(circle at 10% 72%,hsla(' + c2 + ',90%,64%,.26) 0%,hsla(' + c2 + ',90%,64%,.07) 24%,transparent 48%),' +
      'radial-gradient(circle at 84% 16%,hsla(' + c3 + ',88%,66%,.2) 0%,transparent 44%),' +
      'radial-gradient(130% 92% at ' +
      swirlX +
      '% ' +
      swirlY +
      '%,rgba(255,255,255,0) 28%,rgba(255,255,255,.2) 44%,rgba(255,255,255,.02) 59%,rgba(0,0,0,.16) 78%,rgba(0,0,0,.02) 100%),' +
      'conic-gradient(from ' +
      from +
      'deg at ' +
      swirlX +
      '% ' +
      swirlY +
      '%,' +
      'hsla(' +
      c1 +
      ',95%,74%,.82) 0%,' +
      'hsla(' +
      c2 +
      ',92%,66%,.78) 33%,' +
      'hsla(' +
      c3 +
      ',90%,62%,.76) 66%,' +
      'hsla(' +
      c1 +
      ',95%,74%,.82) 100%),' +
      'linear-gradient(156deg,rgba(4,6,20,.46) 0%,rgba(4,6,20,.15) 26%,transparent 62%)'
    );
  }

  function cssForRoot(rootId, cfg) {
    var dark =
      cfg.theme === 'dark'
        ? '#' + rootId + ' .afhub-chat { background:#13131a; box-shadow:0 8px 40px rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.06); }' +
          '#' + rootId + ' .afhub-messages { background:linear-gradient(180deg,#16161e 0%,#13131a 100%); }' +
          '#' + rootId + ' .afhub-msg.bot { background:linear-gradient(145deg,#252530,#1e1e28); color:#ececf1; border:1px solid rgba(255,255,255,.06); }' +
          '#' + rootId + ' .afhub-msg.user { color:#fff; }' +
          '#' + rootId + ' .afhub-persona-offer { border-color:rgba(255,255,255,.1); background:rgba(255,255,255,.05); }' +
          '#' + rootId + ' .afhub-persona-offer-hint { color:#b8b8c8; }' +
          '#' + rootId + ' .afhub-persona-tag { border-color:rgba(255,255,255,.12); background:rgba(255,255,255,.06); }' +
          '#' + rootId + ' .afhub-msg-copy-btn { border:none; color:#a9b0bd; }' +
          '#' + rootId + ' .afhub-msg-copy-btn:hover { background:rgba(255,255,255,.08); color:#eef2ff; }' +
          '#' + rootId + ' .afhub-img-download-btn { background:rgba(15,23,42,.72); border-color:rgba(255,255,255,.25); color:#f8fafc; }' +
          '#' + rootId + ' .afhub-img-download-btn:hover { background:rgba(15,23,42,.88); border-color:rgba(255,255,255,.45); }' +
          '#' + rootId + ' .afhub-feedback-btn { color:#a9b0bd; }' +
          '#' + rootId + ' .afhub-feedback-btn.active { background:rgba(255,255,255,.08); }' +
          '#' + rootId + ' .afhub-msg-rich .afhub-pre { background:#1a1a24; color:#e8e8ef; border-color:rgba(255,255,255,.08); }' +
          '#' + rootId + ' .afhub-msg-rich .afhub-code { background:#2a2a36; color:#e0e0ea; }' +
          '#' + rootId + ' .afhub-cooldown-pill { color:rgba(255,255,255,.48); background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); }' +
          '#' + rootId + ' .afhub-quota-tag--warn { color:#fcd34d !important; background:rgba(251,191,36,.12) !important; border-color:rgba(251,191,36,.35) !important; }' +
          '#' + rootId + ' .afhub-quota-tag--limit { color:#fca5a5 !important; background:rgba(248,113,113,.12) !important; border-color:rgba(248,113,113,.35) !important; }' +
          '#' + rootId + ' .afhub-input-area { border-top-color:#2a2a34; background:#16161d; }' +
          '#' + rootId + ' .afhub-input { border-color:transparent; background:#1e1e28; color:#f1f5f9 !important; -webkit-text-fill-color:#f1f5f9; caret-color:' + cfg.color + '; box-shadow:inset 0 0 0 1px #3d3d4a; overflow-y:hidden; scrollbar-width:none; }' +
          '#' + rootId + ' .afhub-input::-webkit-scrollbar { display:none; width:0; height:0; }' +
          '#' + rootId + ' .afhub-input::placeholder { color:#94a3b8; opacity:1; }' +
          '#' + rootId + ' .afhub-powered { color:#6b6b78; }' +
          '#' + rootId + ' .afhub-powered a { color:#9a9aaa; }' +
          '#' + rootId + ' .afhub-dot { background:#777; }' +
          '#' + rootId + ' .afhub-thinking-card { background:transparent; border:none; }' +
          '#' + rootId + ' .afhub-thinking-title { display:none; }' +
          '#' + rootId + ' .afhub-thinking-sub { color:#9ca3af; display:block; }' +
          '#' + rootId + ' .afhub-thinking-elapsed { color:#6b7280; }' +
          '#' + rootId + ' .afhub-skel-line { display:none; }' +
          '#' + rootId + ' .afhub-thinking-dots span { background:#6b7280; }' +
          '#' + rootId + ' .afhub-msg-time { color:#6b7280; }' +
          '#' + rootId + ' .afhub-fab-hint { background:#252530; color:#ececf1; border-color:rgba(255,255,255,.06); }' +
          '#' + rootId + ' .afhub-fab-hint::after { border-top-color:#252530 !important; }' +
          '#' + rootId + ' .afhub-unread-hint { background:#252530; color:#ececf1; border-color:rgba(255,255,255,.08); }' +
          '#' + rootId + ' .afhub-unread-hint::after { border-top-color:#252530 !important; }' +
          '#' + rootId + ' .afhub-human-bubble { background:linear-gradient(180deg,' + cfg.color + '26,' + cfg.color + '14) !important; border-color:' + cfg.color + '4d !important; border-left:3px solid ' + cfg.color + ' !important; color:#ececf1 !important; }' +
          '#' + rootId + ' .afhub-handoff-modal { background:#1e1e28; color:#ececf1; }' +
          '#' + rootId + ' .afhub-handoff-modal h4 { color:#f1f5f9; }' +
          '#' + rootId + ' .afhub-handoff-desc { color:#94a3b8; }' +
          '#' + rootId + ' .afhub-handoff-modal label { color:#cbd5e1; }' +
          '#' + rootId + ' .afhub-handoff-input { background:#13131a !important; color:#f1f5f9 !important; -webkit-text-fill-color:#f1f5f9; border-color:#3d3d4a !important; }' +
          '#' + rootId + ' .afhub-handoff-input::placeholder { color:#64748b; }' +
          '#' + rootId + ' .afhub-handoff-cancel { background:#252530 !important; color:#e2e8f0 !important; border-color:#3d3d4a !important; }' +
          '#' + rootId + ' .afhub-handoff-cancel:hover { background:#2f2f3a !important; color:#fff !important; }' +
          '#' + rootId + ' .afhub-action-bar { background:#16161d; border-top-color:#2a2a34; }' +
          '#' + rootId + ' .afhub-policy { color:#7a7a86; }' +
          '#' + rootId + ' .afhub-tool-tag { background:rgba(255,255,255,.08); color:#a8a8b8; border-color:rgba(255,255,255,.12); }' +
          '#' + rootId + ' .afhub-mcp-source-tag { background:rgba(255,255,255,.08); color:#c8c8d8; border-color:rgba(255,255,255,.12); }' +
          '#' + rootId + ' .afhub-fallback-tag { color:rgba(255,255,255,.28) !important; border-color:rgba(255,255,255,.1) !important; background:rgba(255,255,255,.04) !important; }' +
          '#' + rootId + ' .afhub-fallback-tag--debug { color:#fbbf24 !important; background:rgba(251,191,36,.1) !important; border-color:rgba(251,191,36,.3) !important; }'
        : '';
    return '' +
      '#' + rootId + ',#' + rootId + ' *,#' + rootId + ' *::before,#' + rootId + ' *::after {' +
        'font-family:' + AFHUB_FONT_STACK + ' !important;' +
        '-webkit-font-smoothing:antialiased;' +
        '-moz-osx-font-smoothing:grayscale;' +
        'text-size-adjust:100%;' +
        '-webkit-text-size-adjust:100%;' +
      '}' +
      '#' + rootId + ' * { box-sizing:border-box; margin:0; padding:0; }' +
      '#' + rootId + ' .afhub-msg,#' + rootId + ' .afhub-msg-rich .afhub-p,#' + rootId + ' .afhub-msg-text { font-weight:400; letter-spacing:.01em; color:inherit; }' +
      '#' + rootId + ' .afhub-msg.user { font-weight:500; }' +
      '#' + rootId + ' .afhub-msg-rich strong,#' + rootId + ' .afhub-header-info h3 { font-weight:600; }' +
      '#' + rootId + '.afhub-launcher-hidden { display:none !important; visibility:hidden !important; pointer-events:none !important; }' +
      '#' + rootId + ' .afhub-fab-wrap { position:relative; display:inline-flex; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-launcher-dismiss { width:20px; height:20px; padding:0; border-radius:50%; border:1px solid rgba(0,0,0,.14); background:#fff; color:#64748b; font-size:14px; line-height:1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.14); transition:background .15s,color .15s; }' +
      '#' + rootId + ' .afhub-launcher-dismiss:hover { background:#f8fafc; color:#0f172a; }' +
      '#' + rootId + ' .afhub-launcher-dismiss--orb { position:absolute; top:-3px; right:-3px; z-index:6; }' +
      '#' + rootId + ' .afhub-launcher { display:flex; flex-direction:column; gap:12px; width:max-content; max-width:min(260px,calc(100vw - 40px)); }' +
      '#' + rootId + '[data-afhub-h="right"] .afhub-launcher { align-items:flex-end; }' +
      '#' + rootId + '[data-afhub-h="left"] .afhub-launcher { align-items:flex-start; }' +
      '#' + rootId + '[data-afhub-h="center"] .afhub-launcher { align-items:center; }' +
      '#' + rootId + ' .afhub-fab-hint-wrap { position:relative; transition:opacity .2s ease,max-height .3s ease; }' +
      '#' + rootId + ' .afhub-fab-hint-float { animation:afhub-hint-float-y 4.2s ease-in-out 2.45s infinite; }' +
      '#' + rootId + ' .afhub-fab-hint { position:relative; font-size:13px; line-height:1.38; padding:10px 14px 12px; border-radius:16px; background:#fff; color:#1a1a2e; max-width:240px; text-align:left; border:1px solid rgba(0,0,0,.05); box-shadow:0 1px 2px rgba(0,0,0,.04),0 0 0 1px rgba(0,0,0,.03); opacity:0; transform:scale(0.1) translateY(48px); filter:blur(14px); animation:afhub-genie-hint 0.95s cubic-bezier(0.22,1.25,0.36,1.15) 1.5s forwards; }' +
      '#' + rootId + ' .afhub-fab-hint::after { content:""; position:absolute; bottom:-7px; width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-top:8px solid #fff; filter:drop-shadow(0 1px 0 rgba(0,0,0,.03)); }' +
      '#' + rootId + '[data-afhub-h="right"] .afhub-fab-hint::after { left:auto; right:16px; transform:none; }' +
      '#' + rootId + '[data-afhub-h="left"] .afhub-fab-hint::after { left:16px; right:auto; transform:none; }' +
      '#' + rootId + '[data-afhub-h="center"] .afhub-fab-hint::after { left:50%; margin-left:-7px; }' +
      '@media (prefers-reduced-motion:reduce){ #' +
        rootId +
        ' .afhub-fab-hint { animation:none !important; opacity:1 !important; transform:none !important; filter:none !important; } #' +
        rootId +
        ' .afhub-thinking-card { animation:none !important; } #' +
        rootId +
        ' .afhub-thinking-pulse,#' + rootId + ' .afhub-skel-line,#' + rootId + ' .afhub-thinking-dots span { animation:none !important; } #' +
        rootId +
        ' .afhub-msg--streaming .afhub-msg-text::after { animation:none !important; opacity:0 !important; } #' +
        rootId +
        ' .afhub-fab-hint-float { animation:none !important; } #' +
        rootId +
        ' .afhub-fab::after { transition:none !important; transform:none !important; } #' +
        rootId +
        ' .afhub-fab:hover::after { transform:none !important; } #' +
        rootId +
        ' .afhub-fab:hover { transform:none !important; } #' +
        rootId +
        ' .afhub-orb-avatar-halo { animation:none !important; opacity:.75 !important; } }' +
      '#' + rootId + '.afhub-open .afhub-fab { width:48px; height:48px; opacity:.78; }' +
      '#' + rootId + '.afhub-open .afhub-fab-hint-wrap { opacity:0; max-height:0; margin:0; padding:0; overflow:hidden; pointer-events:none; }' +
      '#' + rootId + ' .afhub-fab { width:60px; height:60px; border-radius:50%; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; background:linear-gradient(155deg,rgba(255,255,255,.22) 0%,transparent 42%),' +
      orbIridescentStack(cfg) +
      ',' +
      orbGradientFromCfg(cfg) +
      '; background-blend-mode:screen,color-dodge,soft-light,soft-light,hard-light,saturation,multiply,normal,normal; filter:saturate(1.28) contrast(1.08) brightness(1.05); color:#fff; box-shadow:0 6px 26px rgba(0,0,0,.2),0 0 0 1px rgba(255,255,255,.18) inset,0 -2px 12px rgba(0,0,0,.12) inset; transition:transform .22s,box-shadow .22s; outline:none; position:relative; overflow:hidden; }' +
      '#' + rootId + ' .afhub-fab::before { content:""; position:absolute; inset:0; border-radius:50%; background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.5),transparent 48%); pointer-events:none; opacity:.95; z-index:0; }' +
      '#' +
        rootId +
        ' .afhub-fab::after { content:""; position:absolute; inset:-24%; border-radius:50%; pointer-events:none; z-index:0; opacity:.48; mix-blend-mode:soft-light; background:conic-gradient(from 18deg at 50% 50%,hsla(310,88%,62%,.42),hsla(185,92%,58%,.38),hsla(52,95%,68%,.4),hsla(275,82%,58%,.36),hsla(310,88%,62%,.42)); transition:transform .52s cubic-bezier(.22,1,.36,1); }' +
      '#' + rootId + ' .afhub-fab:hover { transform:scale(1.07); box-shadow:0 8px 32px rgba(0,0,0,.26),0 0 0 1px rgba(255,255,255,.22) inset; }' +
      '#' + rootId + ' .afhub-fab:hover::after { transform:none; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--dragging { cursor:grabbing !important; transform:scale(1.05); user-select:none; -webkit-user-select:none; }' +
      '#' + rootId + ' .afhub-fab svg { width:26px; height:26px; transition:transform .3s; }' +
      '#' + rootId + ' .afhub-fab-inner { position:relative; z-index:2; width:36px; height:36px; display:flex; align-items:center; justify-content:center; }' +
      '#' + rootId + ' .afhub-orb { position:relative; width:32px; height:32px; display:flex; align-items:center; justify-content:center; }' +
      '#' + rootId + ' .afhub-orb-core { position:relative; z-index:2; width:12px; height:12px; border-radius:50%; background:radial-gradient(circle at 50% 48%,#fff,rgba(255,255,255,.92)); box-shadow:0 0 14px rgba(255,255,255,.85),inset 0 1px 2px rgba(255,255,255,.5); }' +
      '#' + rootId + ' .afhub-orb-wave { pointer-events:none; position:absolute; left:50%; top:50%; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; border:2px solid rgba(255,255,255,.42); animation:afhub-wave 2.5s cubic-bezier(.22,1,.36,1) infinite; }' +
      '#' + rootId + ' .afhub-orb-wave-b { animation-delay:1.2s; border-width:1px; border-color:rgba(255,255,255,.28); }' +
      '#' + rootId + ' .afhub-orb--avatar { width:36px; height:36px; display:flex; align-items:center; justify-content:center; position:relative; border-radius:50%; }' +
      '#' + rootId + ' .afhub-orb-avatar-halo { position:absolute; inset:-22%; border-radius:50%; pointer-events:none; z-index:0; background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.55) 0%,rgba(212,175,55,.22) 42%,transparent 72%); filter:blur(11px); opacity:.9; animation:afhub-avatar-halo 5.2s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-orb-avatar-img { width:36px; height:36px; border-radius:50%; object-fit:cover; object-position:center 18%; position:relative; z-index:2; display:block; border:2px solid rgba(255,255,255,.94); box-shadow:inset 0 2px 10px rgba(0,0,0,.16),inset 0 -1px 0 rgba(255,255,255,.28),0 4px 14px rgba(0,0,0,.18); filter:contrast(1.06) saturate(1.08); -webkit-backface-visibility:hidden; backface-visibility:hidden; transform:translateZ(0); }' +
      '#' + rootId + ' .afhub-orb-avatar-shine { position:absolute; inset:0; border-radius:50%; pointer-events:none; z-index:3; background:linear-gradient(145deg,rgba(255,255,255,.48) 0%,rgba(255,255,255,.12) 34%,transparent 56%,rgba(255,255,255,.06) 100%); mix-blend-mode:soft-light; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar { width:66px; height:66px; background:transparent; background-blend-mode:normal; filter:none; padding:0; overflow:visible; box-shadow:none; transition:transform .34s cubic-bezier(.22,1,.36,1),filter .34s ease; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar::before,#' + rootId + ' .afhub-fab.afhub-fab--avatar::after { display:none; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar .afhub-fab-inner { width:100%; height:100%; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar .afhub-orb--avatar { width:100%; height:100%; padding:3px; background:linear-gradient(148deg,rgba(255,255,255,.98) 0%,rgba(236,220,178,.96) 18%,rgba(201,162,39,.92) 38%,rgba(255,251,240,.97) 58%,rgba(232,213,163,.94) 78%,rgba(255,255,255,.98) 100%); box-shadow:0 1px 0 rgba(255,255,255,.85) inset,0 14px 34px rgba(0,0,0,.24),0 4px 12px rgba(0,0,0,.12),0 0 0 1px rgba(255,255,255,.28); }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar .afhub-orb-avatar-img { width:100%; height:100%; border-radius:50%; object-fit:cover; object-position:center 18%; box-shadow:inset 0 2px 12px rgba(0,0,0,.18),inset 0 -1px 0 rgba(255,255,255,.3),0 2px 8px rgba(0,0,0,.12); display:block; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar .afhub-orb-avatar-shine { inset:3px; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar:hover { transform:scale(1.06); filter:drop-shadow(0 16px 32px rgba(0,0,0,.28)) drop-shadow(0 0 20px rgba(212,175,55,.24)); }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar:hover .afhub-orb--avatar { box-shadow:0 1px 0 rgba(255,255,255,.92) inset,0 18px 40px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.42); }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar:active { transform:scale(1.02); }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar.afhub-fab--dragging { filter:drop-shadow(0 12px 24px rgba(0,0,0,.26)); }' +
      '@media (prefers-reduced-motion:reduce){ #' + rootId + ' .afhub-orb-wave { animation:none; opacity:.35; transform:scale(1.15); } }' +
      '#' + rootId + ' .afhub-chat { position:absolute; width:380px; max-width:calc(100vw - 40px); height:520px; max-height:calc(100vh - 120px); background:#fff; border-radius:' + cfg.borderRadius + 'px; box-shadow:0 12px 48px rgba(0,0,0,.16),0 0 0 1px rgba(0,0,0,.04); display:flex; flex-direction:column; overflow:hidden; transform:scale(.88) translateY(16px); opacity:0; pointer-events:none; transition:transform .28s cubic-bezier(.34,1.2,.64,1),opacity .28s; }' +
      '#' + rootId + ' .afhub-chat.visible { transform:scale(1) translateY(0); opacity:1; pointer-events:auto; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--sidebar { transition:transform .28s cubic-bezier(.34,1.2,.64,1),opacity .28s,width .22s ease,max-width .22s ease; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--sidebar.visible { transform:none !important; }' +
      '#' + rootId + '-scrim,.afhub-scrim { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9; backdrop-filter:blur(2px); transition:opacity .25s; }' +
      '#' +
        rootId +
        ' .afhub-header { padding:16px 18px; color:#fff; display:flex; align-items:center; gap:12px; flex-shrink:0; background:linear-gradient(135deg,' +
      cfg.color +
      ' 0%,' +
      cfg.color +
      'dd 100%); position:relative; }' +
      '#' + rootId + ' .afhub-header::after { display:none; }' +
      '#' + rootId + ' .afhub-header > * { position:relative; z-index:1; }' +
      '#' + rootId + ' .afhub-avatar { width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.22); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; box-shadow:0 0 0 2px rgba(255,255,255,.2); }' +
      '#' + rootId + ' .afhub-avatar img { width:100%; height:100%; object-fit:cover; }' +
      '#' + rootId + ' .afhub-avatar svg { width:22px; height:22px; }' +
      '#' + rootId + ' .afhub-header-info { flex:1; min-width:0; }' +
      '#' + rootId + ' .afhub-header-info h3 { font-size:15px; font-weight:600; letter-spacing:.01em; }' +
      '#' + rootId + ' .afhub-header-info p { font-size:11px; text-transform:uppercase; letter-spacing:.08em; opacity:.88; margin-top:3px; font-weight:500; }' +
      '#' + rootId + ' .afhub-status-bullet { display:inline; margin:0 5px; opacity:.72; }' +
      '#' + rootId + ' .afhub-header-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; margin-left:auto; }' +
      '#' + rootId + ' .afhub-header-icon-btn { flex-shrink:0; background:rgba(255,255,255,.14); border:none; color:#fff; cursor:pointer; padding:6px; border-radius:8px; opacity:.92; display:inline-flex; align-items:center; justify-content:center; line-height:0; }' +
      '#' + rootId + ' .afhub-header-icon-btn:hover { opacity:1; background:rgba(255,255,255,.26); }' +
      '#' + rootId + ' .afhub-header-icon-btn:disabled { opacity:.45; cursor:default; pointer-events:none; }' +
      '#' + rootId + ' .afhub-header-icon-btn svg { width:18px; height:18px; }' +
      '#' + rootId + ' .afhub-settings-wrap { position:relative; flex-shrink:0; display:inline-flex; }' +
      '#' + rootId + ' .afhub-settings-menu { position:absolute; top:calc(100% + 6px); right:0; min-width:200px; background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.16); padding:6px; z-index:10000; }' +
      '#' + rootId + ' .afhub-settings-item { display:flex; align-items:center; gap:8px; width:100%; padding:9px 10px; background:transparent; border:none; border-radius:7px; color:#1a1a2e; font-size:13px; font-weight:500; cursor:pointer; text-align:left; min-height:44px; font-family:inherit; }' +
      '#' + rootId + ' .afhub-settings-item:hover { background:rgba(0,0,0,.05); }' +
      '#' + rootId + ' .afhub-settings-item svg { width:16px; height:16px; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-settings-clear { color:#dc2626; }' +
      '#' + rootId + ' .afhub-settings-clear:hover { background:rgba(220,38,38,.08); }' +
      '#' + rootId + ' .afhub-settings-speaker--active { color:#059669; font-weight:600; }' +
      '#' + rootId + ' .afhub-settings-speaker--active:hover { background:rgba(5,150,105,.08); }' +
      '#' + rootId + ' .afhub-close-btn { flex-shrink:0; margin-left:0; background:rgba(255,255,255,.18); border:none; color:#fff; cursor:pointer; padding:7px; border-radius:8px; opacity:.88; display:inline-flex; align-items:center; justify-content:center; line-height:0; transition:background .15s,opacity .15s; }' +
      '#' + rootId + ' .afhub-close-btn:hover { opacity:1; background:rgba(255,255,255,.32); }' +
      '#' + rootId + ' .afhub-messages { flex:1 1 0; min-height:0; overflow-y:auto; padding:12px 14px; display:flex; flex-direction:column; gap:8px; scroll-behavior:smooth; background:linear-gradient(180deg,#fafbfc 0%,#f4f6f8 100%); font-size:14px; line-height:1.45; scrollbar-width:none; }' +
      '#' + rootId + ' .afhub-messages::-webkit-scrollbar { display:none; width:0; height:0; }' +
      '#' + rootId + ' .afhub-msg { max-width:88%; padding:9px 13px; border-radius:16px; font-size:14px; line-height:1.45; word-wrap:break-word; animation:afhub-msg-fade-in .35s ease-out; }' +
      '#' + rootId + ' .afhub-msg.user { white-space:pre-wrap; background:' + cfg.color + '; color:#fff; align-self:flex-end; border-bottom-right-radius:5px; box-shadow:0 2px 10px rgba(0,0,0,.14); }' +
      '#' + rootId + ' .afhub-msg-rich { white-space:normal; }' +
      '#' + rootId + ' .afhub-msg--streaming .afhub-msg-text::after { content:""; display:inline-block; width:2px; height:.95em; margin-left:2px; vertical-align:text-bottom; background:currentColor; opacity:.55; animation:afhub-stream-cursor .85s step-end infinite; }' +
      '#' + rootId + ' .afhub-msg.bot { background:linear-gradient(180deg,#fff,#f0f2f5); color:#141428; align-self:flex-start; border-bottom-left-radius:5px; border:1px solid rgba(0,0,0,.06); box-shadow:0 1px 2px rgba(0,0,0,.04); }' +
      '#' + rootId + ' .afhub-human-wrap { align-self:flex-start; max-width:88%; width:100%; display:flex; flex-direction:column; gap:4px; }' +
      '#' + rootId + ' .afhub-human-meta { display:flex; align-items:center; gap:6px; padding:0 2px; }' +
      '#' + rootId + ' .afhub-human-badge { display:inline-flex; align-items:center; gap:5px; padding:2px 9px 2px 7px; border-radius:999px; background:' + cfg.color + '14; color:' + cfg.color + '; font-size:10px; font-weight:700; letter-spacing:.02em; }' +
      '#' + rootId + ' .afhub-human-badge svg { width:11px; height:11px; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-human-bubble { width:100%; max-width:100%; box-sizing:border-box; white-space:pre-wrap; background:linear-gradient(180deg,' + cfg.color + '0f,' + cfg.color + '08) !important; border:1px solid ' + cfg.color + '2b !important; border-left:3px solid ' + cfg.color + ' !important; color:#141428 !important; }' +
      '#' + rootId + ' .afhub-unread-hint-wrap { display:none; cursor:pointer; animation:afhub-unread-pop .35s cubic-bezier(.34,1.2,.64,1); }' +
      '#' + rootId + ' .afhub-unread-hint { position:relative; font-size:12px; line-height:1.35; font-weight:600; padding:9px 13px; border-radius:14px; background:#fff; color:#141428; max-width:220px; text-align:left; border:1px solid rgba(0,0,0,.06); box-shadow:0 4px 18px rgba(0,0,0,.12); }' +
      '#' + rootId + ' .afhub-unread-hint::after { content:""; position:absolute; bottom:-6px; width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:7px solid #fff; }' +
      '#' + rootId + '[data-afhub-h="right"] .afhub-unread-hint::after { right:18px; left:auto; }' +
      '#' + rootId + '[data-afhub-h="left"] .afhub-unread-hint::after { left:18px; right:auto; }' +
      '#' + rootId + '[data-afhub-h="center"] .afhub-unread-hint::after { left:50%; margin-left:-6px; }' +
      '#' + rootId + ' .afhub-unread-badge { position:absolute; top:0; right:0; width:10px; height:10px; border-radius:50%; background:#ef4444; border:2px solid #fff; display:none; z-index:6; pointer-events:none; box-shadow:0 1px 4px rgba(0,0,0,.2); }' +
      '#' + rootId + '.afhub-open .afhub-unread-hint-wrap { display:none !important; }' +
      '@keyframes afhub-unread-pop { from { opacity:0; transform:translateY(8px) scale(.94); } to { opacity:1; transform:translateY(0) scale(1); } }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-p { margin:0 0 .55em; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-p:last-child { margin-bottom:0; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-ul { margin:.35em 0 .55em; padding-left:1.15em; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-ul li { margin:.2em 0; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-pre { margin:.5em 0; padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.45; overflow-x:auto; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:rgba(0,0,0,.06); border:1px solid rgba(0,0,0,.06); }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-code { font-size:.9em; padding:2px 6px; border-radius:5px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:rgba(0,0,0,.07); }' +
      '#' + rootId + ' .afhub-msg-rich strong { font-weight:600; }' +
      '#' + rootId + ' .afhub-msg-rich em { font-style:italic; opacity:.95; }' +
      '#' + rootId + ' .afhub-msg-copy-btn { width:24px; height:24px; opacity:1; }' +
      '#' + rootId + ' .afhub-msg-copy-btn svg { width:13px; height:13px; }' +
      '#' + rootId + ' .afhub-msg-copy-btn.active { border:none; color:' + cfg.color + '; background:' + cfg.color + '14; }' +
      '#' + rootId + ' .afhub-img-frame { position:relative; border-radius:12px; overflow:hidden; border:1px solid rgba(0,0,0,.08); }' +
      '#' + rootId + ' .afhub-img-download-btn { position:absolute; top:8px; right:8px; z-index:2; opacity:.92; background:rgba(255,255,255,.92); border-color:rgba(0,0,0,.12); color:#374151; box-shadow:0 1px 4px rgba(0,0,0,.12); }' +
      '#' + rootId + ' .afhub-img-download-btn:hover { opacity:1; background:#fff; }' +
      '#' + rootId + ' .afhub-cooldown-pill { display:block; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:rgba(0,0,0,.42); margin:0 0 10px; padding:4px 10px; border-radius:999px; background:rgba(0,0,0,.05); border:1px solid rgba(0,0,0,.08); width:fit-content; }' +
      '#' + rootId + ' .afhub-quota-tag { display:block; font-size:12px; font-weight:500; line-height:1.45; margin:0 0 10px; padding:8px 11px; border-radius:10px; border:1px solid rgba(0,0,0,.1); width:100%; max-width:100%; box-sizing:border-box; }' +
      '#' + rootId + ' .afhub-quota-tag--warn { color:#92400e; background:rgba(251,191,36,.14); border-color:rgba(217,119,6,.28); }' +
      '#' + rootId + ' .afhub-quota-tag--limit { color:#991b1b; background:rgba(248,113,113,.12); border-color:rgba(220,38,38,.28); }' +
      '#' + rootId + ' .afhub-mcp-source-tag { margin-top:8px; display:inline-block; font-size:10px; font-weight:600; letter-spacing:.04em; padding:3px 8px; border-radius:6px; color:' +
        cfg.color +
        '; background:rgba(0,0,0,.04); border:1px solid rgba(0,0,0,.1); }' +
      '#' + rootId + ' .afhub-tool-tags { margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; align-items:center; }' +
      '#' + rootId + ' .afhub-msg-rich:has(.afhub-mcp-source-tag) .afhub-tool-tags { margin-top:6px; }' +
      '#' + rootId + ' .afhub-fallback-tag { margin-top:6px; display:inline-block; font-size:9px; font-weight:500; letter-spacing:.03em; padding:2px 6px; border-radius:4px; color:rgba(0,0,0,.28); background:rgba(0,0,0,.03); border:1px solid rgba(0,0,0,.07); }' +
      '#' + rootId + ' .afhub-fallback-tag--debug { font-size:10px; font-weight:700; color:#92400e; background:rgba(251,191,36,.12); border-color:rgba(217,119,6,.3); }' +
      '#' + rootId + ' .afhub-tool-tag { font-size:10px; line-height:1.25; letter-spacing:.02em; padding:2px 6px; border-radius:6px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:rgba(0,0,0,.06); color:#5a5a6e; border:1px solid rgba(0,0,0,.08); }' +
      '#' + rootId + ' .afhub-img-wrap { margin-top:10px; max-width:100%; display:flex; flex-direction:column; gap:8px; }' +
      '#' + rootId + ' .afhub-widget-img { display:block; width:100%; max-width:100%; height:auto; vertical-align:middle; }' +
      '#' + rootId + ' .afhub-thinking-card { display:flex; flex-direction:column; gap:8px; padding:8px 10px; max-width:88%; align-self:flex-start; border-radius:14px; border:none; background:transparent; animation:afhub-thinking-in .28s ease-out; }' +
      '#' + rootId + ' .afhub-thinking-head { display:flex; align-items:flex-start; gap:10px; }' +
      '#' + rootId + ' .afhub-thinking-pulse { flex-shrink:0; width:10px; height:10px; margin-top:4px; border-radius:50%; background:' + cfg.color + '; box-shadow:0 0 0 0 ' + cfg.color + '55; animation:afhub-thinking-pulse 1.6s ease-out infinite; }' +
      '#' + rootId + ' .afhub-thinking-titles { display:flex; flex-direction:column; gap:2px; min-width:0; }' +
      '#' + rootId + ' .afhub-thinking-title { display:none; }' +
      '#' + rootId + ' .afhub-thinking-sub { font-size:12px; line-height:1.4; color:#6b7280; font-weight:500; display:block; }' +
      '#' + rootId + ' .afhub-thinking-skeleton { display:none; }' +
      '#' + rootId + ' .afhub-skel-line { display:none; }' +
      '#' + rootId + ' .afhub-skel-line--lg { display:none; }' +
      '#' + rootId + ' .afhub-skel-line--md { display:none; }' +
      '#' + rootId + ' .afhub-skel-line--sm { display:none; }' +
      '#' + rootId + ' .afhub-thinking-meta { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:14px; }' +
      '#' + rootId + ' .afhub-thinking-elapsed { font-size:10px; font-weight:600; letter-spacing:.03em; color:#9ca3af; font-variant-numeric:tabular-nums; }' +
      '#' + rootId + ' .afhub-thinking-dots { display:inline-flex; gap:3px; align-items:center; margin-left:auto; }' +
      '#' + rootId + ' .afhub-thinking-dots span { width:5px; height:5px; border-radius:50%; background:#9ca3af; animation:afhub-thinking-dot 1.5s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-thinking-dots span:nth-child(2) { animation-delay:.25s; }' +
      '#' + rootId + ' .afhub-thinking-dots span:nth-child(3) { animation-delay:.5s; }' +
      '#' + rootId + ' .afhub-multi-agent-tag { display:inline-flex; align-items:center; margin-bottom:8px; font-size:10px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; padding:3px 8px; border-radius:999px; color:' + cfg.color + '; background:' + cfg.color + '14; border:1px solid ' + cfg.color + '33; }' +
      '#' + rootId + ' .afhub-feedback-row { align-self:flex-start; display:flex; gap:0; margin:2px 0 2px 2px; align-items:center; width:100%; }' +
      '#' + rootId + ' .afhub-feedback-btn { width:24px; height:24px; border-radius:999px; border:none; background:transparent; color:#6b7280; font-size:12px; line-height:1; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:background .12s ease,color .12s ease; padding:0; }' +
      '#' + rootId + ' .afhub-feedback-btn:hover { background:rgba(0,0,0,.06); color:#111827; }' +
      '#' + rootId + ' .afhub-feedback-btn[data-value="up"].active { color:#16a34a; background:rgba(34,197,94,.12); }' +
      '#' + rootId + ' .afhub-feedback-btn[data-value="down"].active { color:#dc2626; background:rgba(239,68,68,.12); }' +
      '#' + rootId + ' .afhub-msg-time { font-size:11px; color:#9ca3af; font-weight:500; line-height:1; white-space:nowrap; }' +
      '#' + rootId + ' .afhub-dot { width:8px; height:8px; background:#aaa; border-radius:50%; animation:afhub-bounce .6s infinite alternate; }' +
      '#' + rootId + ' .afhub-dot:nth-child(2) { animation-delay:.2s; }' +
      '#' + rootId + ' .afhub-dot:nth-child(3) { animation-delay:.4s; }' +
      '#' + rootId + ' .afhub-powered { text-align:center; font-size:8px; letter-spacing:.03em; text-transform:uppercase; color:#ccc; padding:3px 0 3px; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-powered a { color:#888; text-decoration:none; }' +
      '#' + rootId + ' .afhub-powered a:hover { text-decoration:underline; }' +
      '#' + rootId + ' .afhub-persona-offer { align-self:flex-start; max-width:92%; padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.08); background:rgba(0,0,0,.03); font-size:13px; line-height:1.45; }' +
      '#' + rootId + ' .afhub-persona-offer-inner { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }' +
      '#' + rootId + ' .afhub-persona-offer-hint { color:#5a5a6e; font-size:13px; }' +
      '#' + rootId + ' .afhub-persona-tag { display:inline-flex; align-items:center; justify-content:center; padding:4px 11px; border-radius:999px; font-size:11px; font-weight:700; letter-spacing:.03em; text-decoration:none; border:1px solid rgba(0,0,0,.1); background:rgba(0,0,0,.03); color:' + cfg.color + '; cursor:pointer; font-family:inherit; transition:background .15s; }' +
      '#' + rootId + ' .afhub-persona-tag:hover { background:rgba(0,0,0,.07); }' +
      '#' + rootId + ' .afhub-handoff-bar { flex-shrink:0; padding:6px 12px 4px; border-top:1px solid #e8eaed; background:#fff; }' +
      '#' + rootId + ' .afhub-handoff-bar--disabled { opacity:.5; pointer-events:none; }' +
      '#' + rootId + ' .afhub-handoff-btn { width:100%; padding:8px 12px; border-radius:10px; border:1px solid ' + cfg.color + '44; background:' + cfg.color + '0c; color:' + cfg.color + '; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }' +
      '#' + rootId + ' .afhub-handoff-btn:hover { background:' + cfg.color + '18; }' +
      '#' + rootId + ' .afhub-handoff-btn:disabled { cursor:not-allowed; opacity:.6; }' +
      // Barra de acciones compacta (chips) — "Hablar con una persona"
      '#' + rootId + ' .afhub-action-bar { flex-shrink:0; display:flex; gap:6px; padding:4px 10px 6px; border-top:1px solid #eef0f2; background:#f8fafc; }' +
      '#' + rootId + ' .afhub-action-btn { flex:1; min-width:0; padding:5px 8px; border-radius:999px; border:1px solid ' + cfg.color + '33 !important; background:transparent !important; color:' + cfg.color + ' !important; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:background .15s,border-color .15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; appearance:none; -webkit-appearance:none; }' +
      '#' + rootId + ' .afhub-action-btn:hover { background:' + cfg.color + '12 !important; }' +
      '#' + rootId + ' .afhub-action-btn--ghost { border-color:#e2e4e8; color:#80868b; }' +
      '#' + rootId + ' .afhub-action-btn--ghost:hover { background:#f5f6f7; color:#5f6368; }' +
      '#' + rootId + ' .afhub-action-btn--disabled { cursor:not-allowed; opacity:.5; pointer-events:none; }' +
      // Encuesta inline (tarjeta dentro del flujo de mensajes, no popup)
      '#' + rootId + ' .afhub-msg.afhub-fb-card { align-self:stretch; max-width:100%; width:100%; box-sizing:border-box; background:#f7f8fa; border:1px solid #e8eaed; border-radius:14px; padding:12px 14px; box-shadow:none; }' +
      '#' + rootId + ' .afhub-fb-title { font-size:13px; font-weight:700; color:#202124; margin-bottom:10px; }' +
      '#' + rootId + ' .afhub-fb-thanks { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#202124; }' +
      '#' + rootId + ' .afhub-fb-check { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:999px; background:#22c55e; color:#fff; font-size:12px; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-handoff-overlay { display:none; position:absolute; inset:0; z-index:30; background:rgba(0,0,0,.45); align-items:center; justify-content:center; padding:16px; box-sizing:border-box; }' +
      '#' + rootId + ' .afhub-handoff-overlay.visible { display:flex; }' +
      '#' + rootId + ' .afhub-handoff-modal { width:100%; max-width:320px; background:#fff; border-radius:14px; padding:18px 16px; box-shadow:0 12px 40px rgba(0,0,0,.18); font-family:inherit; color:#111827; }' +
      '#' + rootId + ' .afhub-handoff-modal h4 { margin:0 0 6px; font-size:15px; font-weight:800; color:#111827; }' +
      '#' + rootId + ' .afhub-handoff-desc { margin:0 0 12px; font-size:12px; color:#6b7280; line-height:1.4; }' +
      '#' + rootId + ' .afhub-handoff-modal label { display:block; margin-bottom:8px; font-size:11px; font-weight:600; color:#374151; }' +
      '#' + rootId + ' .afhub-handoff-input { display:block; width:100%; margin-top:4px; padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; font-size:13px; font-family:inherit; box-sizing:border-box; color:#111827 !important; background:#fff !important; -webkit-text-fill-color:#111827; caret-color:' + cfg.color + '; }' +
      '#' + rootId + ' .afhub-handoff-input::placeholder { color:#9ca3af; opacity:1; }' +
      '#' + rootId + ' .afhub-handoff-textarea { resize:vertical; min-height:52px; }' +
      '#' + rootId + ' .afhub-handoff-error { margin:0 0 8px; font-size:11px; color:#dc2626; font-weight:600; }' +
      '#' + rootId + ' .afhub-handoff-actions { display:flex; gap:8px; margin-top:4px; }' +
      '#' + rootId + ' .afhub-handoff-cancel { flex:1; padding:9px; border-radius:8px; border:1px solid #d1d5db !important; background:#fff !important; color:#374151 !important; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; appearance:none; -webkit-appearance:none; }' +
      '#' + rootId + ' .afhub-handoff-cancel:hover { background:#f3f4f6 !important; color:#111827 !important; border-color:#9ca3af !important; }' +
      '#' + rootId + ' .afhub-handoff-submit { flex:1; padding:9px; border-radius:8px; border:none !important; background:' + cfg.color + ' !important; color:#fff !important; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; appearance:none; -webkit-appearance:none; }' +
      '#' + rootId + ' .afhub-handoff-submit:hover { filter:brightness(0.95); }' +
      '#' + rootId + ' .afhub-handoff-submit:disabled { opacity:.6; cursor:wait; }' +
      '#' + rootId + ' .afhub-shortcuts-wrap { flex-shrink:0; border-top:1px solid #e8eaed; }' +
      '#' + rootId + ' .afhub-shortcuts-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; padding:7px 14px; background:transparent; border:none; cursor:pointer; font-family:inherit; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-shortcuts-toggle:hover { background:' + cfg.color + '0a; }' +
      '#' + rootId + ' .afhub-shortcuts-toggle-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:' + cfg.color + '; }' +
      '#' + rootId + ' .afhub-shortcuts-toggle-chevron { font-size:18px; color:' + cfg.color + '; transition:transform .2s; line-height:1; }' +
      '#' + rootId + ' .afhub-shortcuts { display:flex; flex-direction:column; gap:6px; padding:0 10px 8px; flex-shrink:0; max-height:112px; overflow-y:auto; scrollbar-width:none; }' +
      '#' + rootId + ' .afhub-shortcuts::-webkit-scrollbar { display:none; }' +
      '#' + rootId + ' .afhub-shortcut-pill { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid ' + cfg.color + '28; background:' + cfg.color + '0a; color:var(--afhub-fg,#1e293b); font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; transition:background .15s,border-color .15s; text-align:left; width:100%; box-sizing:border-box; }' +
      '#' + rootId + ' .afhub-shortcut-pill:hover { background:' + cfg.color + '18; border-color:' + cfg.color + '55; }' +
      '#' + rootId + ' .afhub-pill-icon { font-size:15px; flex-shrink:0; width:22px; text-align:center; }' +
      '#' + rootId + ' .afhub-pill-text { flex:1; line-height:1.4; white-space:normal; overflow-wrap:break-word; word-break:break-word; min-width:0; }' +
      '#' + rootId + ' .afhub-pill-arrow { font-size:18px; color:' + cfg.color + '; flex-shrink:0; font-weight:400; line-height:1; }' +
      // Aviso de privacidad / política (footer del chat)
      '#' + rootId + ' .afhub-policy { text-align:center; font-size:10px; line-height:1.45; color:#9aa0ac; padding:6px 14px 2px; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-policy-link { color:' + cfg.color + '; text-decoration:underline; }' +
      '#' + rootId + ' a.afhub-policy-link { cursor:pointer; }' +
      '#' + rootId + ' a.afhub-policy-link:hover { filter:brightness(0.9); }' +
      '#' + rootId + ' .afhub-input-area { padding:5px 10px; border-top:1px solid #eef0f2; display:flex; gap:6px; flex-shrink:0; background:#f8fafc; align-items:center; }' +
      '#' + rootId + ' .afhub-attach-input { position:absolute; width:0; height:0; opacity:0; pointer-events:none; overflow:hidden; }' +
      '#' + rootId + ' .afhub-attach { width:32px; height:32px; border-radius:10px; border:none; cursor:pointer; background:transparent; color:#64748b; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .18s,color .18s; padding:0; }' +
      '#' + rootId + ' .afhub-attach:hover { background:rgba(15,23,42,.06); color:' + cfg.color + '; }' +
      '#' + rootId + ' .afhub-attach svg { width:17px; height:17px; }' +
      '#' + rootId + ' .afhub-attach-preview { flex-shrink:0; padding:6px 10px 0; background:#f8fafc; border-top:1px solid #eef0f2; }' +
      '#' + rootId + ' .afhub-attach-preview-inner { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:10px; background:#fff; border:1px solid #e2e8f0; }' +
      '#' + rootId + ' .afhub-attach-preview-img { width:40px; height:40px; object-fit:cover; border-radius:8px; border:1px solid #e2e8f0; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-attach-preview-label { flex:1; font-size:12px; color:#64748b; font-weight:500; }' +
      '#' + rootId + ' .afhub-attach-preview-remove { width:26px; height:26px; border-radius:50%; border:none; background:#fee2e2; color:#dc2626; font-size:18px; line-height:1; cursor:pointer; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-img-wrap--user { margin-top:8px; }' +
      '#' + rootId + ' .afhub-input { flex:1; min-width:0; border:none; border-radius:18px; padding:7px 14px; font-size:15px; font-weight:400; outline:none; resize:none; min-height:34px; max-height:88px; line-height:1.3; letter-spacing:-0.01em; font-family:inherit !important; color:#0f172a !important; -webkit-text-fill-color:#0f172a; caret-color:' + cfg.color + '; background:#fff; box-shadow:inset 0 0 0 1px #dbe1ea; overflow-y:hidden; scrollbar-width:none; transition:box-shadow .15s ease; }' +
      '#' + rootId + ' .afhub-input::-webkit-scrollbar { display:none; width:0; height:0; }' +
      '#' + rootId + ' .afhub-input::placeholder { color:#94a3b8; opacity:1; font-weight:400; }' +
      '#' + rootId + ' .afhub-input:focus { box-shadow:inset 0 0 0 2px ' + cfg.color + '66, 0 0 0 3px ' + cfg.color + '1a; }' +
      '#' + rootId + ' .afhub-send { width:36px; height:36px; border-radius:12px; border:none; cursor:pointer; background:' + cfg.color + '; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity .15s,transform .12s ease; box-shadow:0 2px 8px rgba(15,23,42,.12); }' +
      '#' + rootId + ' .afhub-send:not(:disabled):hover { transform:scale(1.04); }' +
      '#' + rootId + ' .afhub-send:disabled { opacity:.35; cursor:default; box-shadow:none; }' +
      '#' + rootId + ' .afhub-send svg { width:17px; height:17px; }' +
      '#' + rootId + ' .afhub-mic { width:32px; height:32px; border-radius:10px; border:none; cursor:pointer; background:transparent; color:#64748b; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .18s,color .18s; padding:0; }' +
      '#' + rootId + ' .afhub-mic:hover { background:rgba(15,23,42,.06); color:' + cfg.color + '; }' +
      '#' + rootId + ' .afhub-mic--active { background:rgba(239,68,68,.1) !important; color:#ef4444 !important; animation:afhub-mic-pulse 1.5s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-mic svg { width:18px; height:18px; }' +
      '#' + rootId + ' .afhub-voice-bar { display:none; align-items:center; gap:10px; padding:8px 16px; background:rgba(99,102,241,.06); border-top:1px solid rgba(99,102,241,.12); flex-shrink:0; }' +
      '#' + rootId + ' .afhub-voice-bar--active { display:flex; }' +
      '#' + rootId + ' .afhub-voice-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-voice-dot--listening { background:#ef4444; animation:afhub-dot-pulse 1s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-voice-dot--thinking { background:#f59e0b; animation:afhub-dot-pulse .6s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-voice-dot--speaking { background:#22c55e; animation:afhub-dot-pulse .8s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-voice-label { font-size:12px; color:#6366f1; font-weight:600; flex:1; letter-spacing:.02em; }' +
      '#' + rootId + ' .afhub-voice-stop { background:none; border:1px solid rgba(239,68,68,.3); color:#ef4444; font-size:11px; padding:3px 10px; border-radius:20px; cursor:pointer; font-weight:600; transition:background .15s; }' +
      '#' + rootId + ' .afhub-voice-stop:hover { background:rgba(239,68,68,.08); }' +
      '@keyframes afhub-bounce { to { transform:translateY(-6px); opacity:.4; } }' +
      '@keyframes afhub-thinking-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }' +
      '@keyframes afhub-msg-fade-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }' +
      '@keyframes afhub-status-pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }' +
      '@keyframes afhub-thinking-pulse { 0% { box-shadow:0 0 0 0 ' + cfg.color + '66; transform:scale(.92); } 70% { box-shadow:0 0 0 8px ' + cfg.color + '00; transform:scale(1); } 100% { box-shadow:0 0 0 0 ' + cfg.color + '00; transform:scale(.92); } }' +
      '@keyframes afhub-skel-shimmer { 0% { background-position:100% 0; } 100% { background-position:-100% 0; } }' +
      '@keyframes afhub-thinking-dot { 0%,80%,100% { opacity:.35; transform:translateY(0); } 40% { opacity:1; transform:translateY(-2px); } }' +
      '@keyframes afhub-stream-cursor { 0%,100% { opacity:0; } 50% { opacity:.8; } }' +
      '@keyframes afhub-wave { 0% { transform:scale(.68); opacity:.72; } 100% { transform:scale(1.55); opacity:0; } }' +
      '@keyframes afhub-genie-hint { 0% { opacity:0; transform:scale(0.1) translateY(52px); filter:blur(16px); } 50% { opacity:1; transform:scale(1.08) translateY(-10px); filter:blur(0); } 78% { transform:scale(0.96) translateY(5px); } 100% { opacity:1; transform:scale(1) translateY(0); filter:blur(0); } }' +
      '@keyframes afhub-hint-float-y { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }' +
      '@keyframes afhub-mic-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,.3); } 50% { box-shadow:0 0 0 6px rgba(239,68,68,.0); } }' +
      '@keyframes afhub-dot-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(.7); } }' +
      '@keyframes afhub-avatar-halo { 0%,100% { opacity:.78; transform:scale(.96); } 50% { opacity:1; transform:scale(1.06); } }' +
      dark;
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] || {};
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
      }
    }
    return target;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isHexColor(value) {
    return /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(String(value || ''));
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function log(cfg, level) {
    if (!cfg || !cfg.debug) return;
    var args = Array.prototype.slice.call(arguments, 2);
    var prefix = '[AgentFlowhub Widget]';
    if (level === 'error') console.error.apply(console, [prefix].concat(args));
    else if (level === 'warn') console.warn.apply(console, [prefix].concat(args));
    else console.log.apply(console, [prefix].concat(args));
  }

  window.AgentFlowhub = {
    version: VERSION,
    init: init,
    showLauncher: function () {
      var k;
      for (k in INSTANCES) {
        if (!Object.prototype.hasOwnProperty.call(INSTANCES, k)) continue;
        var inst = INSTANCES[k];
        if (inst && inst.api && typeof inst.api.showLauncher === 'function') inst.api.showLauncher();
      }
    },
    isLauncherHidden: function () {
      var k;
      var hasInstance = false;
      for (k in INSTANCES) {
        if (!Object.prototype.hasOwnProperty.call(INSTANCES, k)) continue;
        hasInstance = true;
        var el = document.getElementById(k);
        if (el && el.classList.contains('afhub-launcher-hidden')) return true;
        if (el) return false;
      }
      if (hasInstance) return false;
      return false;
    }
  };

  autoInitFromScript();
})();


