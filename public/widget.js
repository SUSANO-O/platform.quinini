/**
 * AgentFlowhub Embeddable Chat Widget SDK (v1)
 *
 * Backward-compatible script embed:
 *   <script src="https://your-app.com/widget.js" data-agent-id="my-agent"></script>
 *
 * Programmatic API:
 *   const instance = window.AgentFlowhub.init({ agentId: "my-agent" });
 *   instance.open();
 *
 * Init recomendado (producción):
 *   - host: URL https del AgentFlowhub (no localhost en sitios públicos)
 *   - token: si el agente exige widget token (cabecera X-Widget-Token)
 *   - theme: "light" | "dark"
 *   - welcome / subtitle: textos claros; debug: false en prod
 */
(function () {
  'use strict';

  if (window.AgentFlowhub && window.AgentFlowhub.version) return;

  var VERSION = '1.4.6';
  var INSTANCES = {};
  var INSTANCE_COUNT = 0;

  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICON_MIC_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
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
        '<img class="afhub-orb-avatar-img" src="' + escapeAttr(url) + '" alt="">' +
        '</span></span>'
      );
    }
    return ORB_HTML;
  }

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
    position: 'right',
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
    onOpen: null,
    onClose: null,
    onMessageSent: null,
    onMessageReceived: null,
    onError: null
  };

  function init(config) {
    var cfg = normalizeConfig(config || {});
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
    var pos = String(merged.position || 'right').toLowerCase();
    if (['left', 'right', 'center', 'top', 'custom'].indexOf(pos) === -1) {
      pos = 'right';
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
    return merged;
  }

  function launcherAlign(cfg) {
    var pos = cfg.position;
    if (pos === 'left') return 'left';
    if (pos === 'center' || pos === 'top') return 'center';
    if (pos === 'custom') {
      var ol = cfg.offsetLeft;
      var or = cfg.offsetRight;
      if (ol != null && isFinite(ol) && (or == null || !isFinite(or))) return 'left';
      if (or != null && isFinite(or) && (ol == null || !isFinite(ol))) return 'right';
    }
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
      var ot = cfg.offsetTop;
      var ob = cfg.offsetBottom;
      var ol = cfg.offsetLeft;
      var or = cfg.offsetRight;
      var hasTop = ot != null && isFinite(ot);
      var hasBottom = ob != null && isFinite(ob);
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
      var hasL = ol != null && isFinite(ol);
      var hasR = or != null && isFinite(or);
      if (hasL) root.style.left = ol + 'px';
      if (hasR) root.style.right = or + 'px';
      if (!hasL && !hasR) root.style.right = '20px';

      if (hasR && !hasL) {
        chat.style.right = '0';
        chat.style.left = 'auto';
      } else if (hasL && !hasR) {
        chat.style.left = '0';
        chat.style.right = 'auto';
      } else {
        chat.style.right = '0';
        chat.style.left = 'auto';
      }
    } else if (pos === 'right') {
      root.style.bottom = cfg.offsetBottom + 'px';
      root.style.right = inset + 'px';
      root.setAttribute('data-afhub-v', 'bottom');
      chat.style.right = '0';
      chat.style.left = 'auto';
    } else if (pos === 'left') {
      root.style.bottom = cfg.offsetBottom + 'px';
      root.style.left = inset + 'px';
      root.setAttribute('data-afhub-v', 'bottom');
      chat.style.left = '0';
      chat.style.right = 'auto';
    } else if (pos === 'center') {
      root.style.bottom = cfg.offsetBottom + 'px';
      root.style.left = '50%';
      root.style.transform = 'translateX(-50%)';
      root.style.width = '380px';
      root.setAttribute('data-afhub-v', 'bottom');
      chat.style.left = '0';
      chat.style.right = 'auto';
      chat.style.width = '380px';
    } else if (pos === 'top') {
      root.style.top = cfg.offsetTop + 'px';
      root.style.left = '50%';
      root.style.transform = 'translateX(-50%)';
      root.style.width = '380px';
      root.setAttribute('data-afhub-v', 'top');
      chat.style.left = '0';
      chat.style.right = 'auto';
      chat.style.width = '380px';
    }

    root.setAttribute('data-afhub-h', launcherAlign(cfg));

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

  function createWidgetInstance(id, cfg) {
    var rootId = 'afhub-widget-root-' + id;
    var typingId = 'afhub-typing-' + id;
    var isOpen = false;
    var isLoading = false;
    var history = [];
    var resolvedAgentId = null;

    var root = document.createElement('div');
    root.id = rootId;
    root.style.position = 'fixed';
    root.style.zIndex = String(2147483000 + INSTANCE_COUNT);
    root.style.fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
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

    var fab = document.createElement('button');
    fab.className = 'afhub-fab';
    fab.innerHTML = orbHtmlForCfg(cfg);
    fab.setAttribute('aria-label', 'Abrir chat');
    launcher.appendChild(fab);
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
    headerInfo.innerHTML = '<h3>' + escapeHtml(cfg.title) + '</h3><p>' + escapeHtml(cfg.subtitle) + '</p>';
    header.appendChild(headerInfo);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'afhub-close-btn';
    closeBtn.innerHTML = ICON_X;
    closeBtn.setAttribute('aria-label', 'Cerrar chat');
    header.appendChild(closeBtn);
    chat.appendChild(header);

    var messages = document.createElement('div');
    messages.className = 'afhub-messages';
    chat.appendChild(messages);

    var powered = document.createElement('div');
    powered.className = 'afhub-powered';
    powered.innerHTML = 'Powered by <a href="https://agentflowhub.com" target="_blank" rel="noopener">AgentFlowhub</a>';
    chat.appendChild(powered);

    var inputArea = document.createElement('div');
    inputArea.className = 'afhub-input-area';
    var input = document.createElement('textarea');
    input.className = 'afhub-input';
    input.placeholder = 'Escribe un mensaje...';
    input.rows = 1;
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
    chat.appendChild(inputArea);
    if (voiceBar) {
      chat.insertBefore(voiceBar, inputArea);
    }

    root.appendChild(chat);
    applyWidgetGeometry(root, chat, cfg);
    document.body.appendChild(root);

    function addMessage(type, text) {
      var el = document.createElement('div');
      el.className = 'afhub-msg ' + type;
      if (type === 'bot') {
        el.className += ' afhub-msg-rich';
        el.innerHTML = formatBotHtml(text);
      } else {
        el.textContent = text;
      }
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function showTyping() {
      var el = document.createElement('div');
      el.className = 'afhub-msg bot typing';
      el.id = typingId;
      el.innerHTML = '<div class="afhub-dot"></div><div class="afhub-dot"></div><div class="afhub-dot"></div>';
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() {
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
        timestamp: new Date().toISOString(),
        details: details || {}
      };
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

    function open() {
      if (isOpen) return;
      isOpen = true;
      root.classList.add('afhub-open');
      chat.classList.add('visible');
      fab.classList.add('open');
      fab.innerHTML = ICON_X;
      fab.setAttribute('aria-label', 'Cerrar chat');
      if (history.length === 0) addMessage('bot', cfg.welcome);
      input.focus();
      notify('onOpen');
      emitEvent('widget_opened');
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove('afhub-open');
      chat.classList.remove('visible');
      fab.classList.remove('open');
      fab.innerHTML = orbHtmlForCfg(cfg);
      fab.setAttribute('aria-label', 'Abrir chat');
      notify('onClose');
      emitEvent('widget_closed');
    }

    function toggle() {
      if (isOpen) close(); else open();
    }

    function destroy() {
      root.remove();
      delete INSTANCES[id];
    }

    async function send(textArg) {
      var text = typeof textArg === 'string' ? textArg.trim() : input.value.trim();
      if (!text || isLoading) return;
      if (!cfg.agentId) {
        var errNoAgent = { message: 'Configura agentId para usar el widget.', code: 'MISSING_AGENT_ID' };
        notify('onError', errNoAgent);
        addMessage('bot', errNoAgent.message);
        return;
      }

      addMessage('user', text);
      history.push({ role: 'user', content: text });
      notify('onMessageSent', text);
      emitEvent('message_sent', { length: text.length });
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;
      isLoading = true;
      showTyping();

      var endpoint = cfg.host.replace(/\/$/, '') + '/api/widget/chat';
      var payload = { agentId: cfg.agentId, message: text, history: history.slice(0, -1) };
      if (cfg.widgetId && String(cfg.widgetId).trim()) {
        payload.widgetId = String(cfg.widgetId).trim();
      }
      if (cfg.token && String(cfg.token).trim()) {
        payload.token = String(cfg.token).trim();
      }

      try {
      var data = await fetchJsonWithRetry(endpoint, payload, cfg);
        hideTyping();
        var reply = data.reply || data.response || data.text || 'Sin respuesta';
        resolvedAgentId = data.agentId || resolvedAgentId;
        addMessage('bot', reply);
        history.push({ role: 'model', content: reply });
        notify('onMessageReceived', reply);
        emitEvent('message_received', { length: String(reply || '').length, model: data.model || null });
      } catch (e) {
        hideTyping();
        var msg = (e && e.message) ? e.message : 'Lo siento, ocurrio un error. Intenta de nuevo.';
        addMessage('bot', msg);
        notify('onError', { message: msg, code: 'REQUEST_ERROR' });
        emitEvent('widget_error', { message: msg });
        log(cfg, 'error', 'Request failed', e);
      } finally {
        isLoading = false;
        sendBtn.disabled = !input.value.trim();
      }
    }

    // ── Voice Mode ─────────────────────────────────────────────────────────────
    var voiceActive = false;
    var voiceState = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'
    var recognitionRef = null;
    var voiceShouldBeActive = false;
    var ttsAudio = null;
    var ttsUtterance = null;

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

    function ttsSpeak(text, onEnd) {
      // Limpia el texto de markdown básico
      var cleaned = String(text || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, function(m) { return m.slice(1, -1); })
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#+\s/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 500); // max 500 chars para TTS

      if (!cleaned) { if (onEnd) onEnd(); return; }

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        var utt = new SpeechSynthesisUtterance(cleaned);
        var lang = cfg.voiceLang || navigator.language || 'es-ES';
        utt.lang = lang;
        utt.rate = 1.05;
        utt.pitch = 1.0;

        // Selecciona voz en el idioma si está disponible
        var voices = window.speechSynthesis.getVoices();
        var match = voices.find(function(v) { return v.lang === lang; }) ||
                    voices.find(function(v) { return v.lang.startsWith(lang.split('-')[0]); });
        if (match) utt.voice = match;

        utt.onend = function() { if (onEnd) onEnd(); };
        utt.onerror = function() { if (onEnd) onEnd(); };
        ttsUtterance = utt;
        window.speechSynthesis.speak(utt);
      } else {
        if (onEnd) onEnd();
      }
    }

    function ttsStop() {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (ttsAudio) { ttsAudio.pause(); ttsAudio = null; }
      ttsUtterance = null;
    }

    function startListening() {
      if (!hasSpeechAPI) return;
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      // Cancela instancia anterior
      if (recognitionRef) { try { recognitionRef.abort(); } catch(_) {} }
      voiceShouldBeActive = true;
      setVoiceState('listening');

      var rec = new SR();
      rec.lang = cfg.voiceLang || navigator.language || 'es-ES';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;

      rec.onresult = function(event) {
        var transcript = '';
        for (var i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim();
        if (transcript) {
          setVoiceState('thinking');
          input.value = transcript;
          sendBtn.disabled = false;
          send(transcript);
        } else {
          // No habló — vuelve a escuchar
          if (voiceShouldBeActive) setTimeout(startListening, 200);
        }
      };

      rec.onerror = function(event) {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          if (voiceShouldBeActive) setTimeout(startListening, 300);
        } else {
          log(cfg, 'warn', 'Voice STT error:', event.error);
          if (voiceShouldBeActive) setTimeout(startListening, 500);
        }
      };

      rec.onend = function() {
        // Solo reinicia si estamos en modo escucha (no en thinking/speaking)
        if (voiceShouldBeActive && voiceState === 'listening') {
          setTimeout(startListening, 150);
        }
      };

      recognitionRef = rec;
      try { rec.start(); } catch(_) {}
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

    // Intercepta la respuesta del bot para TTS en modo voz
    var _origAddMessage = addMessage;
    function addMessageWithTTS(type, text) {
      var el = _origAddMessage(type, text);
      if (type === 'bot' && voiceActive) {
        setVoiceState('speaking');
        ttsSpeak(text, function() {
          if (voiceShouldBeActive) {
            setTimeout(startListening, 300);
            setVoiceState('listening');
          }
        });
      }
      return el;
    }
    // Reemplaza addMessage con versión voice-aware
    addMessage = addMessageWithTTS;

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

    fab.addEventListener('click', toggle);
    closeBtn.addEventListener('click', close);
    sendBtn.addEventListener('click', function () { send(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    input.addEventListener('input', function () {
      sendBtn.disabled = !input.value.trim() || isLoading;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    if (cfg.autoOpen) setTimeout(open, 80);
    emitEvent('widget_loaded');

    var api = {
      id: id,
      open: open,
      close: close,
      toggle: toggle,
      send: send,
      destroy: destroy,
      getState: function () {
        return {
          isOpen: isOpen,
          isLoading: isLoading,
          agentId: cfg.agentId,
          resolvedAgentId: resolvedAgentId
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
        throw new Error(data.error || data.message || ('HTTP ' + res.status));
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function autoInitFromScript() {
    var script = document.currentScript || findScriptTag();
    if (!script) return;
    if (!script.getAttribute('data-agent-id')) return;
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
      voiceLang: attr(script, 'data-voice-lang', '')
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

  function cssForRoot(rootId, cfg) {
    var dark =
      cfg.theme === 'dark'
        ? '#' + rootId + ' .afhub-chat { background:#13131a; box-shadow:0 8px 40px rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.06); }' +
          '#' + rootId + ' .afhub-messages { background:linear-gradient(180deg,#16161e 0%,#13131a 100%); }' +
          '#' + rootId + ' .afhub-msg.bot { background:linear-gradient(145deg,#252530,#1e1e28); color:#ececf1; border:1px solid rgba(255,255,255,.06); }' +
          '#' + rootId + ' .afhub-msg.user { color:#fff; }' +
          '#' + rootId + ' .afhub-msg-rich .afhub-pre { background:#1a1a24; color:#e8e8ef; border-color:rgba(255,255,255,.08); }' +
          '#' + rootId + ' .afhub-msg-rich .afhub-code { background:#2a2a36; color:#e0e0ea; }' +
          '#' + rootId + ' .afhub-input-area { border-top-color:#2a2a34; background:#16161d; }' +
          '#' + rootId + ' .afhub-input { border-color:#3d3d4a; background:#1e1e28; color:#ececf1; }' +
          '#' + rootId + ' .afhub-input::placeholder { color:#888; }' +
          '#' + rootId + ' .afhub-powered { color:#6b6b78; }' +
          '#' + rootId + ' .afhub-powered a { color:#9a9aaa; }' +
          '#' + rootId + ' .afhub-dot { background:#777; }' +
          '#' + rootId + ' .afhub-fab-hint { background:#252530; color:#ececf1; border-color:rgba(255,255,255,.06); }' +
          '#' + rootId + ' .afhub-fab-hint::after { border-top-color:#252530 !important; }'
        : '';
    return '' +
      '#' + rootId + ' * { box-sizing:border-box; margin:0; padding:0; }' +
      '#' + rootId + ' { -webkit-font-smoothing:antialiased; }' +
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
      '@media (prefers-reduced-motion:reduce){ #' + rootId + ' .afhub-fab-hint { animation:none !important; opacity:1 !important; transform:none !important; filter:none !important; } #' + rootId + ' .afhub-fab-hint-float { animation:none !important; } }' +
      '#' + rootId + '.afhub-open .afhub-fab-hint-wrap { opacity:0; max-height:0; margin:0; padding:0; overflow:hidden; pointer-events:none; }' +
      '#' + rootId + ' .afhub-fab { width:60px; height:60px; border-radius:50%; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; background:linear-gradient(155deg,rgba(255,255,255,.22) 0%,transparent 42%),' + orbGradientFromCfg(cfg) + '; color:#fff; box-shadow:0 6px 26px rgba(0,0,0,.2),0 0 0 1px rgba(255,255,255,.18) inset,0 -2px 12px rgba(0,0,0,.12) inset; transition:transform .22s,box-shadow .22s; outline:none; position:relative; overflow:hidden; }' +
      '#' + rootId + ' .afhub-fab::before { content:""; position:absolute; inset:0; border-radius:50%; background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.5),transparent 48%); pointer-events:none; opacity:.95; }' +
      '#' + rootId + ' .afhub-fab:hover { transform:scale(1.07); box-shadow:0 8px 32px rgba(0,0,0,.26),0 0 0 1px rgba(255,255,255,.22) inset; }' +
      '#' + rootId + ' .afhub-fab svg { width:26px; height:26px; transition:transform .3s; }' +
      '#' + rootId + ' .afhub-fab-inner { position:relative; z-index:1; width:36px; height:36px; display:flex; align-items:center; justify-content:center; }' +
      '#' + rootId + ' .afhub-orb { position:relative; width:32px; height:32px; display:flex; align-items:center; justify-content:center; }' +
      '#' + rootId + ' .afhub-orb-core { position:relative; z-index:2; width:12px; height:12px; border-radius:50%; background:radial-gradient(circle at 50% 48%,#fff,rgba(255,255,255,.92)); box-shadow:0 0 14px rgba(255,255,255,.85),inset 0 1px 2px rgba(255,255,255,.5); }' +
      '#' + rootId + ' .afhub-orb-wave { pointer-events:none; position:absolute; left:50%; top:50%; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; border:2px solid rgba(255,255,255,.42); animation:afhub-wave 2.5s cubic-bezier(.22,1,.36,1) infinite; }' +
      '#' + rootId + ' .afhub-orb-wave-b { animation-delay:1.2s; border-width:1px; border-color:rgba(255,255,255,.28); }' +
      '#' + rootId + ' .afhub-orb--avatar { width:36px; height:36px; display:flex; align-items:center; justify-content:center; }' +
      '#' + rootId + ' .afhub-orb-avatar-img { width:36px; height:36px; border-radius:50%; object-fit:cover; position:relative; z-index:2; box-shadow:0 0 0 2px rgba(255,255,255,.38), inset 0 1px 2px rgba(0,0,0,.12); }' +
      '@media (prefers-reduced-motion:reduce){ #' + rootId + ' .afhub-orb-wave { animation:none; opacity:.35; transform:scale(1.15); } }' +
      '#' + rootId + ' .afhub-chat { position:absolute; width:380px; max-width:calc(100vw - 40px); height:520px; max-height:calc(100vh - 120px); background:#fff; border-radius:' + cfg.borderRadius + 'px; box-shadow:0 12px 48px rgba(0,0,0,.16),0 0 0 1px rgba(0,0,0,.04); display:flex; flex-direction:column; overflow:hidden; transform:scale(.88) translateY(16px); opacity:0; pointer-events:none; transition:transform .28s cubic-bezier(.34,1.2,.64,1),opacity .28s; }' +
      '#' + rootId + ' .afhub-chat.visible { transform:scale(1) translateY(0); opacity:1; pointer-events:auto; }' +
      '#' + rootId + ' .afhub-header { padding:16px 18px; color:#fff; display:flex; align-items:center; gap:12px; flex-shrink:0; background:linear-gradient(180deg,rgba(255,255,255,.16) 0%,transparent 45%),' + orbGradientFromCfg(cfg) + '; position:relative; }' +
      '#' + rootId + ' .afhub-header::after { content:""; position:absolute; inset:0; background:radial-gradient(120% 80% at 90% -20%,rgba(255,255,255,.25),transparent 55%); pointer-events:none; }' +
      '#' + rootId + ' .afhub-header > * { position:relative; z-index:1; }' +
      '#' + rootId + ' .afhub-avatar { width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.22); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; box-shadow:0 0 0 2px rgba(255,255,255,.2); }' +
      '#' + rootId + ' .afhub-avatar img { width:100%; height:100%; object-fit:cover; }' +
      '#' + rootId + ' .afhub-avatar svg { width:22px; height:22px; }' +
      '#' + rootId + ' .afhub-header-info h3 { font-size:15px; font-weight:600; letter-spacing:.01em; }' +
      '#' + rootId + ' .afhub-header-info p { font-size:11px; text-transform:uppercase; letter-spacing:.08em; opacity:.88; margin-top:3px; font-weight:500; }' +
      '#' + rootId + ' .afhub-close-btn { margin-left:auto; background:none; border:none; color:#fff; cursor:pointer; padding:4px; opacity:.85; }' +
      '#' + rootId + ' .afhub-close-btn:hover { opacity:1; }' +
      '#' + rootId + ' .afhub-messages { flex:1; overflow-y:auto; padding:18px 16px; display:flex; flex-direction:column; gap:12px; scroll-behavior:smooth; background:linear-gradient(180deg,#fafbfc 0%,#f4f6f8 100%); font-size:14px; line-height:1.55; }' +
      '#' + rootId + ' .afhub-msg { max-width:88%; padding:11px 15px; border-radius:16px; font-size:14px; line-height:1.55; word-wrap:break-word; }' +
      '#' + rootId + ' .afhub-msg.user { white-space:pre-wrap; }' +
      '#' + rootId + ' .afhub-msg-rich { white-space:normal; }' +
      '#' + rootId + ' .afhub-msg.bot { background:linear-gradient(180deg,#fff,#f0f2f5); color:#141428; align-self:flex-start; border-bottom-left-radius:5px; border:1px solid rgba(0,0,0,.06); box-shadow:0 1px 2px rgba(0,0,0,.04); }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-p { margin:0 0 .55em; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-p:last-child { margin-bottom:0; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-ul { margin:.35em 0 .55em; padding-left:1.15em; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-ul li { margin:.2em 0; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-pre { margin:.5em 0; padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.45; overflow-x:auto; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:rgba(0,0,0,.06); border:1px solid rgba(0,0,0,.06); }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-code { font-size:.9em; padding:2px 6px; border-radius:5px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:rgba(0,0,0,.07); }' +
      '#' + rootId + ' .afhub-msg-rich strong { font-weight:600; }' +
      '#' + rootId + ' .afhub-msg-rich em { font-style:italic; opacity:.95; }' +
      '#' + rootId + ' .afhub-msg.user { background:' + cfg.color + '; color:#fff; align-self:flex-end; border-bottom-right-radius:5px; box-shadow:0 2px 10px rgba(0,0,0,.14); }' +
      '#' + rootId + ' .afhub-msg.typing { display:flex; gap:4px; padding:12px 18px; }' +
      '#' + rootId + ' .afhub-dot { width:8px; height:8px; background:#aaa; border-radius:50%; animation:afhub-bounce .6s infinite alternate; }' +
      '#' + rootId + ' .afhub-dot:nth-child(2) { animation-delay:.2s; }' +
      '#' + rootId + ' .afhub-dot:nth-child(3) { animation-delay:.4s; }' +
      '#' + rootId + ' .afhub-powered { text-align:center; font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:#aaa; padding:6px 0 4px; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-powered a { color:#888; text-decoration:none; }' +
      '#' + rootId + ' .afhub-powered a:hover { text-decoration:underline; }' +
      '#' + rootId + ' .afhub-input-area { padding:12px 14px; border-top:1px solid #e8eaed; display:flex; gap:8px; flex-shrink:0; background:#fff; }' +
      '#' + rootId + ' .afhub-input { flex:1; border:1px solid #ddd; border-radius:22px; padding:10px 16px; font-size:14px; outline:none; resize:none; min-height:0; max-height:100px; line-height:1.45; font-family:inherit; }' +
      '#' + rootId + ' .afhub-input:focus { border-color:' + cfg.color + '; box-shadow:0 0 0 3px rgba(0,0,0,.08); }' +
      '#' + rootId + ' .afhub-send { width:40px; height:40px; border-radius:50%; border:none; cursor:pointer; background:' + cfg.color + '; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity .15s; }' +
      '#' + rootId + ' .afhub-send:disabled { opacity:.4; cursor:default; }' +
      '#' + rootId + ' .afhub-send svg { width:18px; height:18px; }' +
      '#' + rootId + ' .afhub-mic { width:36px; height:36px; border-radius:50%; border:none; cursor:pointer; background:transparent; color:var(--afhub-mic-color, #9aa0ab); display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .18s,color .18s; padding:0; }' +
      '#' + rootId + ' .afhub-mic:hover { background:rgba(0,0,0,.06); color:#6366f1; }' +
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
      '@keyframes afhub-wave { 0% { transform:scale(.68); opacity:.72; } 100% { transform:scale(1.55); opacity:0; } }' +
      '@keyframes afhub-genie-hint { 0% { opacity:0; transform:scale(0.1) translateY(52px); filter:blur(16px); } 50% { opacity:1; transform:scale(1.08) translateY(-10px); filter:blur(0); } 78% { transform:scale(0.96) translateY(5px); } 100% { opacity:1; transform:scale(1) translateY(0); filter:blur(0); } }' +
      '@keyframes afhub-hint-float-y { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }' +
      '@keyframes afhub-mic-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,.3); } 50% { box-shadow:0 0 0 6px rgba(239,68,68,.0); } }' +
      '@keyframes afhub-dot-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(.7); } }' +
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
    init: init
  };

  autoInitFromScript();
})();
