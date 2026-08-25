/**
 * AgentFlowhub Embeddable Chat Widget — SOURCE OF TRUTH
 * Edit this file, then run: npm run build:widget
 * Outputs: public/widget.js (embed público) + public/assist.js (asistente interno)
 */
(function () {
  'use strict';

  if (window.AgentFlowhub && window.AgentFlowhub.version) return;

  var VERSION = '1.6.163';
  var INSTANCES = {};
  var INSTANCE_COUNT = 0;

  var FRIENDLY_CHAT_ERRORS = {
    AGENT_HUB_SYNC_REQUIRED: 'Estoy reconectando con el asistente. Recarga la página e inténtalo de nuevo.',
    WIDGET_TOKEN_INVALID: 'No pude validar el chat. Recarga la página (Cmd+Shift+R) e inicia sesión si persiste.',
    WIDGET_CHAT_FAILED: 'No pude procesar tu mensaje ahora. Inténtalo en unos segundos.',
    HUB_CHAT_PROXY_FAILED: 'El asistente está ocupado. Espera unos segundos e inténtalo otra vez.',
    HUB_ERROR: 'Hubo un problema temporal. Inténtalo de nuevo en un momento.',
    SESSION_TURN_LIMIT: 'Esta conversación llegó al límite de mensajes. Pulsa «Nueva conversación» para empezar de cero.'
  };

  function friendlyChatError(code, fallback) {
    var c = code ? String(code).trim() : '';
    if (c && FRIENDLY_CHAT_ERRORS[c]) return FRIENDLY_CHAT_ERRORS[c];
    var fb = fallback ? String(fallback).trim() : '';
    if (fb && !/^(error|widget token|sincronizado|internal server)/i.test(fb)) return fb;
    return FRIENDLY_CHAT_ERRORS.WIDGET_CHAT_FAILED;
  }

  function resolvePagePath(cfg) {
    var fromCfg = cfg && cfg.pagePath != null ? String(cfg.pagePath).trim() : '';
    if (fromCfg) return fromCfg;
    try {
      if (typeof window !== 'undefined' && window.location) {
        var host = String(window.location.hostname || '').toLowerCase();
        var path = String(window.location.pathname || '');
        var isBotivaHost = /(^|\.)botiva\.space$/i.test(host);
        var isLocalDev = host === 'localhost' || host === '127.0.0.1';
        // Sitio del cliente (widget embebido): URL completa para contexto BotIvA
        if (host && !isBotivaHost && !isLocalDev && window.location.href) {
          return String(window.location.href).split('#')[0];
        }
        return path;
      }
    } catch (_e) { /* noop */ }
    return '';
  }

  var ASSIST_NAV_BLOCK_RE = /```assist-nav\s*\n([\s\S]*?)\n```/i;
  var ASSIST_NAV_XML_RE = /<assist-nav[\w-]*[\s\S]*?(?:\/>|<\/assist-nav[\w-]*>)/gi;
  var ASSIST_NAV_XML_TAG_RE = /<\/?assist-nav[\w-]*(?:\s[^>]*)?\/?>/gi;

  function stripAssistNavBlock(raw) {
    return String(raw || '')
      .replace(ASSIST_NAV_BLOCK_RE, '')
      .replace(ASSIST_NAV_XML_RE, '')
      .replace(ASSIST_NAV_XML_TAG_RE, '')
      .replace(/\s+$/, '')
      .trim();
  }

  function parseAssistNavXmlAttrs(attrStr) {
    var pick = function (name) {
      var re = new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i');
      var m = re.exec(attrStr);
      return m && m[1] ? String(m[1]).trim() : '';
    };
    var path = pick('path');
    var onDecline = pick('onDecline');
    if (!path || !onDecline) return null;
    return {
      path: path,
      prompt: '',
      onDecline: onDecline,
      afterNavigate: pick('afterNavigate') || pick('onAccept') || ''
    };
  }

  function parseAssistNavOfferFromRaw(raw) {
    var m = ASSIST_NAV_BLOCK_RE.exec(String(raw || ''));
    if (m && m[1]) {
      try {
        var j = JSON.parse(m[1].trim());
        var path = String(j.path || '').trim();
        var onDecline = String(j.onDecline || j.declineHint || '').trim();
        if (!path || !onDecline) return null;
        return {
          path: path,
          prompt: j.prompt ? String(j.prompt).trim() : '',
          onDecline: onDecline,
          afterNavigate: j.afterNavigate ? String(j.afterNavigate).trim() : (j.onAccept ? String(j.onAccept).trim() : '')
        };
      } catch (_e) {
        /* try XML */
      }
    }
    var xml = /<assist-nav\s+([^>]+?)\s*\/?>/i.exec(String(raw || ''));
    if (xml && xml[1]) return parseAssistNavXmlAttrs(xml[1]);
    var action = /<assist-nav-action([^>]*)\/?>/i.exec(String(raw || ''));
    if (action && action[1]) return parseAssistNavXmlAttrs(action[1]);
    return null;
  }

  /** Fallback cliente si el SSE no trae navOffer (cache viejo / prod sin deploy). */
  function inferClientNavOfferFromUserMessage(userMsg) {
    var text = String(userMsg || '').trim().toLowerCase();
    if (!text) return null;
    var mk = function (path, onDecline, afterNavigate) {
      return { path: path, onDecline: onDecline, afterNavigate: afterNavigate || '' };
    };
    if (/(\bwidget builder|\bcre(o|ar|a).*widget|\bcomo cre(o|ar).*widget)/.test(text)) {
      return mk('/dashboard/widget-builder', 'Ve a Dashboard → Widget builder.', 'Elige agente, colores y copia el embed.');
    }
    if (/(\bcre(o|ar|a).*agente|\bnuevo agente|\bcontruyo.*agente|\bconstruyo.*agente|\bcomo cre(o|ar).*agente)/.test(text)) {
      return mk('/dashboard/agents/new', 'Ve a Agentes → Nuevo agente.', 'Completa nombre, prompt y modelo.');
    }
    if (/(\bsuscripci[oó]n|\bfacturaci[oó]n|\bfacturas|\bplan\b)/.test(text)) {
      return mk('/dashboard/settings#settings-billing', 'Ve a Ajustes → Suscripción y facturación.', 'Aquí ves plan, facturas y método de pago.');
    }
    if (/(\binbox|\bconversaciones|\bchats)/.test(text)) {
      return mk('/dashboard/inbox', 'Ve a Inbox en el menú lateral.', 'Aquí ves conversaciones de tus widgets.');
    }
    if (/(\bmis widgets|\bver widgets)/.test(text)) {
      return mk('/dashboard/widgets', 'Ve a Widgets en el menú lateral.', 'Aquí gestionas tus widgets.');
    }
    if (/(\bajustes|\bconfiguraci[oó]n)/.test(text)) {
      return mk('/dashboard/settings', 'Ve a Ajustes en el menú lateral.', 'Ajustes de cuenta y preferencias.');
    }
    if (/(\bapi rest\b|\bdocumentaci[oó]n api\b|\bclaves api\b)/.test(text) || /(\bllevame|\blleva|\bll[eé]vame|\bir a|\bver)\b.*\bapi\b/.test(text)) {
      return mk('/dashboard/api', 'Ve a Dashboard → API en el menú lateral.', 'Documentación y claves API REST.');
    }
    return null;
  }

  function resolveNavOfferForAssistant(doneEvt, rawText, userMsg) {
    var offer = null;
    if (doneEvt && doneEvt.navOffer && doneEvt.navOffer.path) offer = doneEvt.navOffer;
    else if (doneEvt && doneEvt.data && doneEvt.data.navOffer && doneEvt.data.navOffer.path) {
      offer = doneEvt.data.navOffer;
    }
    if (!offer) offer = parseAssistNavOfferFromRaw(rawText);
    var replyText = String(rawText || '');
    if (!offer && /¿quieres que te lleve|¿te llevo|¿te guíe/i.test(replyText)) {
      offer = inferClientNavOfferFromUserMessage(userMsg);
    }
    if (offer && !offer.onDecline) {
      offer.onDecline = 'Usa el menú lateral del dashboard para ir a esa sección.';
    }
    return offer;
  }

  function findBotMessageStack(bubbleEl) {
    if (!bubbleEl) return null;
    try {
      var parent = bubbleEl.parentElement;
      if (parent && parent.classList && parent.classList.contains('afhub-msg-stack')) return parent;
      var row = bubbleEl.closest('.afhub-msg-row');
      return row ? row.querySelector('.afhub-msg-stack') : null;
    } catch (_fs) {
      return null;
    }
  }

  function resolveAssistNavPath(path) {
    var target = String(path || '/dashboard').trim();
    if (!target.startsWith('/')) target = '/' + target;
    try {
      var loc = window.location && window.location.pathname ? window.location.pathname : '';
      var lm = /^\/(es|en)(\/|$)/.exec(loc);
      var hashIdx = target.indexOf('#');
      var hashPart = hashIdx >= 0 ? target.slice(hashIdx) : '';
      var pathPart = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
      if (lm && !/^\/(es|en)\//.test(pathPart)) {
        pathPart = '/' + lm[1] + pathPart;
      }
      target = pathPart + hashPart;
    } catch (_e2) { /* noop */ }
    return target;
  }

  function normalizeAssistPathCompare(path) {
    var p = String(path || '').split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
    return p.replace(/^\/(es|en)(?=\/)/, '') || p;
  }

  function assistNavHashFromPath(path) {
    var raw = String(path || '');
    var idx = raw.indexOf('#');
    return idx >= 0 ? raw.slice(idx + 1).trim() : '';
  }

  function isAssistInternalDashboard() {
    try {
      var p = window.location.pathname || '';
      return /^\/dashboard(\/|$)/.test(p) || /^\/(es|en)\/dashboard(\/|$)/.test(p);
    } catch (_e) {
      return false;
    }
  }

  /** Navegación SPA: AgentFlowhub.navigate, evento afhub:navigate-request, o recarga completa. */
  function navigateAssistDashboard(target) {
    return new Promise(function (resolve) {
      var normalizedTarget = normalizeAssistPathCompare(target);
      var finished = false;
      function finish(ok) {
        if (finished) return;
        finished = true;
        resolve(ok !== false);
      }
      function hardNav() {
        try {
          window.location.assign(target);
        } catch (_n) {
          window.location.href = target;
        }
        finish(true);
      }

      if (!isAssistInternalDashboard()) {
        hardNav();
        return;
      }

      function attachDoneListener(onSuccess, onGiveUp) {
        var timer = null;
        function cleanup() {
          if (timer) clearTimeout(timer);
          timer = null;
          try {
            window.removeEventListener('afhub:navigate-done', onDone);
          } catch (_e1) { /* noop */ }
        }
        function onDone(ev) {
          var evPath = ev && ev.detail && ev.detail.path;
          if (evPath && normalizeAssistPathCompare(evPath) === normalizedTarget) {
            cleanup();
            onSuccess();
          }
        }
        window.addEventListener('afhub:navigate-done', onDone);
        timer = setTimeout(function () {
          cleanup();
          onGiveUp();
        }, 3500);
        return cleanup;
      }

      function trySoftNav(fn) {
        var cleanup = attachDoneListener(
          function () {
            cleanup();
            finish(true);
          },
          function () {
            cleanup();
            hardNav();
          },
        );
        try {
          var ret = fn(target);
          if (ret && typeof ret.then === 'function') {
            ret.then(function (ok) {
              if (ok) {
                cleanup();
                finish(true);
              }
            }).catch(function () {
              cleanup();
              hardNav();
            });
          }
        } catch (_navErr) {
          cleanup();
          hardNav();
        }
      }

      var softNav = null;
      try {
        softNav =
          window.AgentFlowhub && typeof window.AgentFlowhub.navigate === 'function'
            ? window.AgentFlowhub.navigate
            : null;
      } catch (_e0) {
        softNav = null;
      }

      if (softNav) {
        trySoftNav(softNav);
        return;
      }

      var eventCleanup = attachDoneListener(
        function () { finish(true); },
        function () { hardNav(); },
      );
      try {
        window.dispatchEvent(
          new CustomEvent('afhub:navigate-request', { detail: { path: target } }),
        );
      } catch (_ev) {
        eventCleanup();
        hardNav();
      }
    });
  }

  function showAssistNavLoading(chatEl) {
    if (!chatEl) return function () {};
    var existing = chatEl.querySelector('.afhub-nav-loading-overlay');
    if (existing) {
      try {
        existing.remove();
      } catch (_rm) { /* noop */ }
    }
    var ov = document.createElement('div');
    ov.className = 'afhub-nav-loading-overlay visible';
    ov.setAttribute('aria-busy', 'true');
    ov.innerHTML =
      '<div class="afhub-nav-loading-inner">' +
      '<span class="afhub-nav-spinner" aria-hidden="true"></span>' +
      '<span class="afhub-nav-loading-text">Cargando pantalla…</span>' +
      '</div>';
    chatEl.appendChild(ov);
    return function hideAssistNavLoading() {
      try {
        ov.classList.remove('visible');
        setTimeout(function () {
          try {
            ov.remove();
          } catch (_e) { /* noop */ }
        }, 180);
      } catch (_e2) { /* noop */ }
    };
  }

  function assistPostNavStorageKey(cfg) {
    return 'afhub-assist-post-nav:' + String(cfg.agentId || 'na');
  }

  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_NEW_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICON_ATTACH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_MIC_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  var ICON_TICKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V9z"/><line x1="12" y1="7" x2="12" y2="17" stroke-dasharray="2 2"/></svg>';
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
  var ICON_SEARCH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  /** Accesos rápidos (atajos del widget) */
  var ICON_SHORTCUTS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  /** Centrado, ondas suaves (sin conic-spin); funciona con cualquier color de marca */
  var ORB_HTML =
    '<span class="afhub-fab-inner" aria-hidden="true"><span class="afhub-orb">' +
    '<span class="afhub-orb-wave"></span><span class="afhub-orb-wave afhub-orb-wave-b"></span>' +
    '<span class="afhub-orb-core"></span></span></span>';

  /** SVG / vector brand orb (mismo estilo que navbar BotIvA). */
  function isVectorAvatar(url) {
    return /\.svg(\?|#|$)/i.test(String(url || '').trim());
  }

  /** Con avatar → imagen (SVG orbe o PNG). Sin avatar → orbe animado CSS. */
  function orbHtmlForCfg(cfg) {
    var url = cfg.avatar && String(cfg.avatar).trim();
    if (url) {
      var vectorCls = isVectorAvatar(url) ? ' afhub-orb--avatar-vector' : '';
      return (
        '<span class="afhub-fab-inner" aria-hidden="true"><span class="afhub-orb afhub-orb--avatar afhub-orb--avatar-silhouette' +
        vectorCls +
        '">' +
        '<img class="afhub-orb-avatar-img" src="' +
        escapeAttr(url) +
        '" alt="" width="256" height="256" decoding="async" loading="eager">' +
        '</span></span>'
      );
    }
    return ORB_HTML;
  }

  function hasFabAvatar(cfg) {
    return Boolean(cfg.avatar && String(cfg.avatar).trim());
  }

  function usesFabSilhouetteAvatar(cfg) {
    return hasFabAvatar(cfg);
  }

  function syncFabAvatarMode(fab, cfg) {
    if (usesFabSilhouetteAvatar(cfg)) fab.classList.add('afhub-fab--avatar');
    else fab.classList.remove('afhub-fab--avatar');
    if (hasFabAvatar(cfg)) {
      fab.classList.add('afhub-fab--avatar-silhouette');
      fab.classList.remove('afhub-fab--avatar-round');
      if (isVectorAvatar(cfg.avatar)) fab.classList.add('afhub-fab--avatar-vector');
      else fab.classList.remove('afhub-fab--avatar-vector');
    } else {
      fab.classList.remove('afhub-fab--avatar-vector');
      fab.classList.remove('afhub-fab--avatar-silhouette');
      fab.classList.remove('afhub-fab--avatar-round');
    }
    fab.classList.remove('afhub-fab--avatar-teal');
  }

  var AFHUB_FONT_STACK =
    '"Plus Jakarta Sans","Outfit",system-ui,-apple-system,BlinkMacSystemFont,sans-serif';

  function ensureWidgetGoogleFonts() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('afhub-google-fonts')) return;
    var pre1 = document.createElement('link');
    pre1.rel = 'preconnect';
    pre1.href = 'https://fonts.googleapis.com';
    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = 'anonymous';
    var link = document.createElement('link');
    link.id = 'afhub-google-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(pre1);
    document.head.appendChild(pre2);
    document.head.appendChild(link);
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
    position: 'bottom-right',
    edgeInset: 20,
    offsetBottom: 20,
    offsetTop: 20,
    offsetLeft: null,
    offsetRight: null,
    avatar: '',
    /** Tamaño del FAB con avatar (px). Ignorado si no hay avatar. */
    fabAvatarSize: 86,
    borderRadius: 16,
    autoOpen: false,
    debug: false,
    /** Ruta actual del dashboard (Math-ais); se actualiza al navegar sin recargar. */
    pagePath: '',
    timeoutMs: 60000,
    retries: 2,
    trackEvents: true,
    theme: 'light',
    orbLight: '',
    orbDeep: '',
    /** Habilita lectura en voz alta (TTS) en el menú de ajustes. */
    voiceEnabled: false,
    /** Botón adjuntar en el input del chat. */
    imageUploadEnabled: true,
    /** Botón micrófono (STT) en el input del chat. */
    micEnabled: true,
    /** Borde mágico modo AI — scope: off | input | messages | both */
    aiBeamScope: 'both',
    aiBeamPalette: 'rainbow',
    aiBeamColor: '',
    aiBeamBlur: 4,
    aiBeamSpeed: 5,
    aiBeamIntensity: 85,
    scrollHaloEnabled: true,
    scrollHaloColorMode: 'brand',
    scrollHaloColor: '',
    scrollHaloHeight: 28,
    scrollHaloOpacity: 55,
    scrollHaloBlur: 10,
    scrollHaloTop: true,
    scrollHaloBottom: true,
    thinkingIconEnabled: true,
    thinkingIcon: 'rubik',
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
    flowId: '',
    flowToken: '',
    onOpen: null,
    onClose: null,
    onMessageSent: null,
    onMessageReceived: null,
    onStatus: null,
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
      else if (localInput.flowId && localInput.flowToken) {
        finishInit({
          agentId: 'flow-embed',
          color: localInput.color || '#006B7D',
          title: localInput.title || 'Flujo',
          subtitle: localInput.subtitle || '',
          welcome: '',
        });
      } else warnConfigFailed(tempHost, token, debug);
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
      // remote config is authoritative for persisted builder toggles; localInput
      // still supplies host/token/callbacks and can fill gaps if remote fetch failed.
      var mergedInput = assign({}, remoteCfg, localInput);
      if (remoteCfg && typeof remoteCfg === 'object') {
        var remoteWins = [
          'imageUploadEnabled',
          'micEnabled',
          'voiceEnabled',
          'handoffEnabled',
          'humanSupportEnabled',
          'feedbackEnabled',
          'fabDismissible',
          'active',
          'shortcuts',
          'feedbackQuestions',
          'conversationIdleTimeout',
          'handoffTimeout',
          'humanSupportPhone',
          'avatar',
          'fabAvatarSize',
          'color',
          'title',
          'subtitle',
          'welcome',
          'fabHint',
          'theme',
          'borderRadius',
          'position',
          'widgetId',
          'agentId',
          'aiBeamScope',
          'aiBeamPalette',
          'aiBeamColor',
          'aiBeamBlur',
          'aiBeamSpeed',
          'aiBeamIntensity',
          'scrollHaloEnabled',
          'scrollHaloColorMode',
          'scrollHaloColor',
          'scrollHaloHeight',
          'scrollHaloOpacity',
          'scrollHaloBlur',
          'scrollHaloTop',
          'scrollHaloBottom',
          'thinkingIconEnabled',
          'thinkingIcon'
        ];
        var ri;
        for (ri = 0; ri < remoteWins.length; ri++) {
          var rk = remoteWins[ri];
          if (!Object.prototype.hasOwnProperty.call(remoteCfg, rk) || remoteCfg[rk] === undefined) continue;
          if (rk === 'avatar') {
            var remoteAv = String(remoteCfg.avatar == null ? '' : remoteCfg.avatar).trim();
            var localAv = String(localInput.avatar == null ? '' : localInput.avatar).trim();
            mergedInput.avatar = remoteAv || localAv;
            continue;
          }
          mergedInput[rk] = remoteCfg[rk];
        }
      }
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
    merged.fabAvatarSize = Number(merged.fabAvatarSize);
    if (!Number.isFinite(merged.fabAvatarSize)) merged.fabAvatarSize = 86;
    merged.fabAvatarSize = clamp(Math.round(merged.fabAvatarSize), 48, 120);
    merged.orbLight = String(merged.orbLight == null ? '' : merged.orbLight).trim();
    merged.orbDeep = String(merged.orbDeep == null ? '' : merged.orbDeep).trim();
    merged.widgetId = String(merged.widgetId == null ? '' : merged.widgetId).trim();
    merged.humanSupportPhone = String(merged.humanSupportPhone == null ? '' : merged.humanSupportPhone)
      .trim()
      .substring(0, 48);
    merged.humanSupportEnabled = input && input.humanSupportEnabled === false ? false : true;
    merged.handoffEnabled = input && input.handoffEnabled === false ? false : true;
    merged.voiceEnabled = input && input.voiceEnabled === true ? true : false;
    merged.imageUploadEnabled = !(input && input.imageUploadEnabled === false);
    if (input && Object.prototype.hasOwnProperty.call(input, 'micEnabled')) {
      merged.micEnabled = input.micEnabled === true;
    } else {
      merged.micEnabled = merged.voiceEnabled;
    }
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
    merged.flowId = String(merged.flowId == null ? '' : merged.flowId).trim();
    merged.flowToken = String(merged.flowToken == null ? '' : merged.flowToken).trim();
    var aiBeam = normalizeAiBeamConfig(merged);
    merged.aiBeamScope = aiBeam.scope;
    merged.aiBeamPalette = aiBeam.palette;
    merged.aiBeamColor = aiBeam.color;
    merged.aiBeamBlur = aiBeam.blur;
    merged.aiBeamSpeed = aiBeam.speed;
    merged.aiBeamIntensity = aiBeam.intensity;
    var scrollHalo = normalizeScrollHaloConfig(merged);
    merged.scrollHaloEnabled = scrollHalo.enabled;
    merged.scrollHaloColorMode = scrollHalo.colorMode;
    merged.scrollHaloColor = scrollHalo.color;
    merged.scrollHaloHeight = scrollHalo.height;
    merged.scrollHaloOpacity = scrollHalo.opacity;
    merged.scrollHaloBlur = scrollHalo.blur;
    merged.scrollHaloTop = scrollHalo.top;
    merged.scrollHaloBottom = scrollHalo.bottom;
    var thinkingIcon = normalizeThinkingIconConfig(merged);
    merged.thinkingIconEnabled = thinkingIcon.enabled;
    merged.thinkingIcon = thinkingIcon.kind;
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
    var isFlowEmbed = Boolean(cfg.flowId && cfg.flowToken);
    if (!isFlowEmbed && (!cfg.agentId || !String(cfg.agentId).trim())) {
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

  function trimUrlTrailingPunctuation(url) {
    var trimmed = String(url || '');
    var trail = '';
    while (trimmed.length > 8 && /[.,;:!?)\]]$/.test(trimmed)) {
      trail = trimmed.slice(-1) + trail;
      trimmed = trimmed.slice(0, -1);
    }
    return { url: trimmed, trail: trail };
  }

  function linkifyEscapedText(esc) {
    return String(esc || '').replace(/(https?:\/\/[^\s<>&"]+)/gi, function (raw) {
      var parts = trimUrlTrailingPunctuation(raw);
      var href = parts.url;
      if (!href) return raw;
      return (
        '<a href="' +
        href +
        '" target="_blank" rel="noopener noreferrer" class="afhub-msg-link">' +
        href +
        '</a>' +
        parts.trail
      );
    });
  }

  function appendTextWithLinks(el, text, linkStyle) {
    var urlRegex = /https?:\/\/[^\s]+/gi;
    var src = String(text || '');
    if (!urlRegex.test(src)) {
      el.textContent = src;
      return;
    }
    urlRegex.lastIndex = 0;
    var parts = src.split(urlRegex);
    var urls = src.match(urlRegex) || [];
    for (var pi = 0; pi < parts.length; pi++) {
      if (parts[pi]) el.appendChild(document.createTextNode(parts[pi]));
      if (pi < urls.length) {
        var parsed = trimUrlTrailingPunctuation(urls[pi]);
        var link = document.createElement('a');
        link.href = parsed.url;
        link.textContent = parsed.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'afhub-msg-link';
        if (linkStyle) {
          for (var sk in linkStyle) {
            if (Object.prototype.hasOwnProperty.call(linkStyle, sk)) link.style[sk] = linkStyle[sk];
          }
        }
        el.appendChild(link);
        if (parsed.trail) el.appendChild(document.createTextNode(parsed.trail));
      }
    }
  }

  function formatInlineOnlyEsc(esc) {
    var t = esc;
    t = t.replace(/`([^`]+)`/g, '<code class="afhub-code">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = linkifyEscapedText(t);
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

  var CHAT_HISTORY_STORAGE_VER = 2;
  var CHAT_HISTORY_MAX_MESSAGES = 60;
  var CHAT_HISTORY_WARN_USER_TURNS = 35;
  var CHAT_LAST_IMAGE_MAX_CHARS = 120000;
  var CHAT_HISTORY_MEDIA_MAX_PER_MSG = 4;
  var CHAT_HISTORY_DATA_URL_MAX_CHARS = 90000;

  function chatHistoryStorageKey(cfg) {
    return chatSessionStorageKey(cfg) + ':hist';
  }

  function chatUiOpenStorageKey(cfg) {
    return chatSessionStorageKey(cfg) + ':ui-open';
  }

  function persistChatUiOpen(cfg, open) {
    try {
      var key = chatUiOpenStorageKey(cfg);
      if (open) sessionStorage.setItem(key, '1');
      else sessionStorage.removeItem(key);
    } catch (_e) {
      /* noop */
    }
  }

  function shouldRestoreChatUiOpen(cfg) {
    try {
      return sessionStorage.getItem(chatUiOpenStorageKey(cfg)) === '1';
    } catch (_e) {
      return false;
    }
  }

  function sanitizePersistableMediaItem(item) {
    if (!item || typeof item !== 'object') return null;
    var url =
      (typeof item.url === 'string' && item.url) ||
      (typeof item.previewUrl === 'string' && item.previewUrl) ||
      (typeof item.dataUrl === 'string' && item.dataUrl) ||
      '';
    if (!url) return null;
    var mime = typeof item.mimeType === 'string' ? item.mimeType.slice(0, 80) : '';
    var name = typeof item.name === 'string' ? item.name.slice(0, 120) : '';
    var type = typeof item.type === 'string' ? item.type.slice(0, 32) : '';
    if (/^https?:\/\//i.test(url)) {
      var outHttp = { url: url.slice(0, 2048) };
      if (mime) outHttp.mimeType = mime;
      if (name) outHttp.name = name;
      if (type) outHttp.type = type;
      return outHttp;
    }
    if (/^data:image\//i.test(url) && url.length <= CHAT_HISTORY_DATA_URL_MAX_CHARS) {
      var outData = { dataUrl: url, url: url };
      if (mime) outData.mimeType = mime;
      if (name) outData.name = name;
      if (type) outData.type = type;
      return outData;
    }
    return null;
  }

  function sanitizePersistableMediaList(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var mi = 0; mi < raw.length && out.length < CHAT_HISTORY_MEDIA_MAX_PER_MSG; mi++) {
      var mediaItem = sanitizePersistableMediaItem(raw[mi]);
      if (mediaItem) out.push(mediaItem);
    }
    return out;
  }

  function sanitizeHistoryEntries(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < CHAT_HISTORY_MAX_MESSAGES; i++) {
      var row = raw[i];
      if (!row || typeof row !== 'object') continue;
      var role = String(row.role || '').toLowerCase();
      var content = typeof row.content === 'string' ? row.content.trim() : '';
      if (role !== 'user' && role !== 'model') continue;
      var images = sanitizePersistableMediaList(row.images);
      var userImages = sanitizePersistableMediaList(row.userImages);
      var attachments = sanitizePersistableMediaList(row.attachments);
      var hasMedia = images.length > 0 || userImages.length > 0 || attachments.length > 0;
      if (!content && !hasMedia) continue;
      var entry = { role: role, content: content.slice(0, 8000) };
      if (images.length) entry.images = images;
      if (userImages.length) entry.userImages = userImages;
      if (attachments.length) entry.attachments = attachments;
      out.push(entry);
    }
    return out;
  }

  function loadPersistedChatState(cfg, sessionId) {
    try {
      var raw = sessionStorage.getItem(chatHistoryStorageKey(cfg));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || (data.v !== 1 && data.v !== 2)) return null;
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
      sessionStorage.removeItem(chatUiOpenStorageKey(cfg));
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

  function appendGeneratedImage(wrap, url, item, index, altText) {
    var frame = document.createElement('div');
    frame.className = 'afhub-img-frame';
    var im = document.createElement('img');
    im.className = 'afhub-widget-img';
    im.alt = altText || 'Imagen generada';
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
    var thinkingRotateStartedAt = 0;
    var isOpen = false;
    var isLoading = false;
    var lastAssistUserMessage = '';
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
    var flowCtrl = null;
    var fabDrag = null;
    var history = [];
    var chatSessionId = getOrCreateChatSessionId(cfg);
    var isFlowEmbed = Boolean(cfg.flowId && cfg.flowToken);
    var persistedChat = isFlowEmbed ? null : loadPersistedChatState(cfg, chatSessionId);
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
      lastMsgDateKey = '';
      if (widgetDisabled) {
        addMessage('bot', DISABLED_MSG);
        return;
      }
      if (!history.length) {
        if (flowCtrl && flowCtrl.onEmptyHistory()) return;
        addMessage('bot', cfg.welcome);
        return;
      }
      for (var hi = 0; hi < history.length; hi++) {
        var entry = history[hi];
        if (entry.role === 'user') {
          var userOpts = undefined;
          if ((entry.userImages && entry.userImages.length) || (entry.attachments && entry.attachments.length)) {
            userOpts = {};
            if (entry.userImages && entry.userImages.length) userOpts.userImages = entry.userImages;
            if (entry.attachments && entry.attachments.length) userOpts.attachments = entry.attachments;
          }
          addMessage('user', entry.content || '', userOpts);
        } else if (entry.role === 'model') {
          var botOptsHist = undefined;
          if (entry.images && entry.images.length) botOptsHist = { images: entry.images };
          addMessage('bot', entry.content || '', botOptsHist);
        }
      }
    }

    ensureWidgetGoogleFonts();

    var root = document.createElement('div');
    root.id = rootId;
    root.style.position = 'fixed';
    root.style.zIndex = String(2147483000 + INSTANCE_COUNT);
    root.style.fontFamily = AFHUB_FONT_STACK;
    root.style.background = 'transparent';
    root.setAttribute('data-afhub-theme', cfg.theme);
    root.classList.add('afhub-ai-beam-scope-' + String(cfg.aiBeamScope || 'both'));
    if (cfg.debug) root.classList.add('afhub-widget--debug');

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
    avatarEl.className =
      'afhub-avatar' +
      (cfg.avatar ? ' afhub-avatar--silhouette' : '') +
      (cfg.avatar && isVectorAvatar(cfg.avatar) ? ' afhub-avatar--vector' : '');
    avatarEl.innerHTML = cfg.avatar ? ('<img src="' + escapeAttr(cfg.avatar) + '" alt="avatar">') : ICON_BOT;
    header.appendChild(avatarEl);

    var headerInfo = document.createElement('div');
    headerInfo.className = 'afhub-header-info';
    headerInfo.innerHTML =
      '<h3>' + escapeHtml(cfg.title) + '</h3>' +
      '<p class="afhub-header-status">' +
        '<span class="afhub-status-dot" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(String(cfg.subtitle || 'Asistente IA')) + '</span>' +
      '</p>';
    header.appendChild(headerInfo);

    function humanWaDigits() {
      return String(cfg.humanSupportPhone || '').replace(/\D/g, '');
    }

    function createWhatsAppLink(reason) {
      var digits = humanWaDigits();
      if (digits.length < 8) return null;
      var a = document.createElement('a');
      a.className = 'afhub-persona-tag';
      a.href = 'https://wa.me/' + digits;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'WhatsApp';
      a.title = 'Abrir WhatsApp';
      a.addEventListener('click', function () {
        notify('onWhatsAppClick', {
          reason: reason || 'human_support',
          timestamp: new Date().toISOString(),
        });
        emitEvent('whatsapp_clicked', { reason: reason || 'human_support' });
      });
      return a;
    }

    function errorMessageWantsWhatsApp(text) {
      return /escribirnos\s+a\s*:?\s*$/i.test(String(text || '').trim());
    }

    function canShowErrorWhatsApp(imgOpts, text) {
      if (humanWaDigits().length < 8) return false;
      if (imgOpts && imgOpts.showWhatsApp) return true;
      if (imgOpts && imgOpts.error && errorMessageWantsWhatsApp(text)) return true;
      return false;
    }

    function adjustErrorMessageForWhatsApp(text, showWa) {
      var t = String(text || '').trim();
      if (showWa) return t;
      return t
        .replace(/\s*o\s+si\s+prefieres\s+atenci[o\u00f3]n\s+inmediata,?\s+puedes\s+escribirnos\s+a\s*:?\s*$/i, '.')
        .replace(/\s*o\s+puedes\s+escribirnos\s+a\s*:?\s*$/i, '.');
    }

    function botOptsForAgentError(evt) {
      var msg = evt && evt.message ? evt.message : '';
      var hubCodes = {
        HUB_CHAT_PROXY_FAILED: 1,
        HUB_ERROR: 1,
        AGENT_ERROR: 1,
        AGENTFLOWHUB_URL_LOCALHOST: 1,
        LANDING_SECRET_MISSING: 1,
      };
      if (!hubCodes[evt && evt.code] && !errorMessageWantsWhatsApp(msg)) return undefined;
      var opts = { error: true, showWhatsApp: canShowErrorWhatsApp({ showWhatsApp: true }, msg) };
      return opts;
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
      var a = createWhatsAppLink('keyword_offer');
      if (!a) return;
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
      cfg.voiceEnabled === true && typeof window !== 'undefined' && window.speechSynthesis;
    var settingsMenuHtml =
      '<button type="button" class="afhub-settings-item afhub-settings-new-chat">' +
        ICON_NEW_CHAT +
        '<span>Nueva conversación</span>' +
      '</button>';
    settingsMenuHtml +=
      '<button type="button" class="afhub-settings-item afhub-settings-history-search">' +
        ICON_SEARCH +
        '<span>Buscar en historial</span>' +
      '</button>';
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

    var headerSpeakerBtn = null;

    headerActions.appendChild(layoutBtn);
    headerActions.appendChild(expandBtn);
    if (voiceMenuAvailable) {
      headerSpeakerBtn = document.createElement('button');
      headerSpeakerBtn.className = 'afhub-header-icon-btn afhub-header-speaker';
      headerSpeakerBtn.setAttribute('type', 'button');
      headerSpeakerBtn.innerHTML = ICON_VOLUME_OFF;
      headerSpeakerBtn.setAttribute('aria-label', 'Lectura en voz alta');
      headerSpeakerBtn.title = 'Lectura en voz alta';
      headerActions.appendChild(headerSpeakerBtn);
    }
    headerActions.appendChild(settingsWrap);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'afhub-header-icon-btn afhub-close-btn';
    closeBtn.setAttribute('type', 'button');
    closeBtn.innerHTML = ICON_X;
    closeBtn.setAttribute('aria-label', 'Cerrar chat');
    closeBtn.title = 'Cerrar chat';
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);

    chat.appendChild(header);

    var messagesShell = document.createElement('div');
    messagesShell.className = 'afhub-messages-shell';
    var messages = document.createElement('div');
    messages.className = 'afhub-messages';
    var scrollHaloTop = document.createElement('div');
    scrollHaloTop.className = 'afhub-scroll-halo afhub-scroll-halo--top';
    scrollHaloTop.setAttribute('aria-hidden', 'true');
    var scrollHaloBottom = document.createElement('div');
    scrollHaloBottom.className = 'afhub-scroll-halo afhub-scroll-halo--bottom';
    scrollHaloBottom.setAttribute('aria-hidden', 'true');
    messagesShell.appendChild(messages);
    messagesShell.appendChild(scrollHaloTop);
    messagesShell.appendChild(scrollHaloBottom);

    var historySearchBar = document.createElement('div');
    historySearchBar.className = 'afhub-history-search';
    historySearchBar.hidden = true;
    historySearchBar.innerHTML =
      '<div class="afhub-history-search-inner">' +
      '<input type="search" class="afhub-history-search-input" placeholder="Buscar mensaje o palabra…" autocomplete="off" enterkeyhint="search" />' +
      '<span class="afhub-history-search-meta" aria-live="polite"></span>' +
      '<button type="button" class="afhub-history-search-close" aria-label="Cerrar búsqueda">' + ICON_X + '</button>' +
      '</div>';
    messagesShell.insertBefore(historySearchBar, messages);
    var historySearchInput = historySearchBar.querySelector('.afhub-history-search-input');
    var historySearchMeta = historySearchBar.querySelector('.afhub-history-search-meta');
    var historySearchClose = historySearchBar.querySelector('.afhub-history-search-close');
    chat.appendChild(messagesShell);

    var messagesLastScrollTop = 0;
    function syncMessagesScrollEdge() {
      if (!messages) return;
      var st = messages.scrollTop || 0;
      var maxScroll = Math.max(0, messages.scrollHeight - messages.clientHeight);
      var prev = messagesLastScrollTop;

      if (st <= 6) {
        chat.classList.remove('afhub-chat--scroll-top');
      } else if (st < prev - 1) {
        chat.classList.add('afhub-chat--scroll-top');
      } else if (st > prev + 1) {
        chat.classList.remove('afhub-chat--scroll-top');
      }

      messagesLastScrollTop = st;
      chat.classList.toggle('afhub-chat--scroll-bottom', maxScroll - st > 5);
    }
    messages.addEventListener('scroll', syncMessagesScrollEdge, { passive: true });
    requestAnimationFrame(syncMessagesScrollEdge);

    // Accesos rápidos: modal + icono (flotante/barra) | sidebar izquierdo (fullscreen)
    var shortcutsOverlay = null;
    var shortcutsBtn = null;
    var shortcutsWrap = null;
    var shortcutsBar = null;
    var hasShortcuts = Boolean(cfg.shortcuts && cfg.shortcuts.length > 0);
    var applyShortcut = function () {};

    function buildShortcutPill(sc) {
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
      pill.addEventListener('click', function () {
        applyShortcut(sc);
      });
      return pill;
    }

    function openShortcutsModal() {
      if (!shortcutsOverlay || widgetDisabled) return;
      if (chat.classList.contains('afhub-chat--fullscreen')) return;
      shortcutsOverlay.classList.add('visible');
      shortcutsOverlay.setAttribute('aria-hidden', 'false');
      if (shortcutsBtn) shortcutsBtn.setAttribute('aria-expanded', 'true');
      var closeEl = shortcutsOverlay.querySelector('.afhub-shortcuts-close');
      if (closeEl && typeof closeEl.focus === 'function') closeEl.focus();
    }

    function closeShortcutsModal() {
      if (!shortcutsOverlay) return;
      shortcutsOverlay.classList.remove('visible');
      shortcutsOverlay.setAttribute('aria-hidden', 'true');
      if (shortcutsBtn) {
        shortcutsBtn.setAttribute('aria-expanded', 'false');
      }
    }

    function syncShortcutsPresentation() {
      if (!hasShortcuts) return;
      var isFullscreen =
        chatLayout === 'sidebar' && sidebarSize === 'fullscreen';
      chat.classList.toggle('afhub-chat--has-shortcuts', isFullscreen);
      if (shortcutsWrap) {
        shortcutsWrap.style.display = isFullscreen ? 'flex' : 'none';
      }
      if (shortcutsBtn) {
        shortcutsBtn.style.display = isFullscreen ? 'none' : '';
      }
      if (isFullscreen) closeShortcutsModal();
    }

    if (hasShortcuts) {
      shortcutsWrap = document.createElement('div');
      shortcutsWrap.className = 'afhub-shortcuts-wrap';
      shortcutsWrap.style.display = 'none';

      var shortcutsSidebarHead = document.createElement('div');
      shortcutsSidebarHead.className = 'afhub-shortcuts-toggle';
      shortcutsSidebarHead.innerHTML =
        '<span class="afhub-shortcuts-toggle-label">Accesos rápidos</span>';

      shortcutsBar = document.createElement('div');
      shortcutsBar.className = 'afhub-shortcuts';

      shortcutsOverlay = document.createElement('div');
      shortcutsOverlay.className = 'afhub-shortcuts-overlay';
      shortcutsOverlay.setAttribute('aria-hidden', 'true');
      shortcutsOverlay.innerHTML =
        '<div class="afhub-shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="afhub-shortcuts-title">' +
          '<div class="afhub-shortcuts-modal-head">' +
            '<h4 id="afhub-shortcuts-title">Accesos rápidos</h4>' +
            '<button type="button" class="afhub-shortcuts-close" aria-label="Cerrar accesos rápidos">' +
              ICON_X +
            '</button>' +
          '</div>' +
          '<div class="afhub-shortcuts-modal-list"></div>' +
        '</div>';
      var shortcutsModalList = shortcutsOverlay.querySelector('.afhub-shortcuts-modal-list');

      cfg.shortcuts.forEach(function (sc) {
        shortcutsBar.appendChild(buildShortcutPill(sc));
        shortcutsModalList.appendChild(buildShortcutPill(sc));
      });

      shortcutsWrap.appendChild(shortcutsSidebarHead);
      shortcutsWrap.appendChild(shortcutsBar);

      shortcutsOverlay.querySelector('.afhub-shortcuts-close').addEventListener('click', closeShortcutsModal);
      shortcutsOverlay.addEventListener('click', function (e) {
        if (e.target === shortcutsOverlay) closeShortcutsModal();
      });
      shortcutsOverlay.querySelector('.afhub-shortcuts-modal').addEventListener('click', function (e) {
        e.stopPropagation();
      });

      shortcutsBtn = document.createElement('button');
      shortcutsBtn.className = 'afhub-shortcuts-btn';
      shortcutsBtn.type = 'button';
      shortcutsBtn.innerHTML = ICON_SHORTCUTS;
      shortcutsBtn.setAttribute('aria-label', 'Accesos rápidos');
      shortcutsBtn.setAttribute('title', 'Accesos rápidos');
      shortcutsBtn.setAttribute('aria-expanded', 'false');
      shortcutsBtn.setAttribute('aria-haspopup', 'dialog');

      chat.appendChild(shortcutsWrap);
    }

    var inputArea = document.createElement('div');
    inputArea.className = 'afhub-input-area';

    var inputComposer = document.createElement('div');
    inputComposer.className = 'afhub-input-composer';

    /* Border-beam: conic continuo (sin huecos); solo rota la paleta. */
    var beamRing = document.createElement('div');
    beamRing.className = 'afhub-input-beam-ring';
    beamRing.setAttribute('aria-hidden', 'true');
    beamRing.innerHTML =
      '<span class="afhub-input-beam-bloom"></span>' +
      '<span class="afhub-input-beam-spin"></span>';
    inputComposer.appendChild(beamRing);

    var composerInner = document.createElement('div');
    composerInner.className = 'afhub-input-composer-inner';

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
      composerInner.appendChild(attachInput);

      attachBtn = document.createElement('button');
      attachBtn.className = 'afhub-attach';
      attachBtn.innerHTML = ICON_ATTACH;
      attachBtn.type = 'button';
      attachBtn.setAttribute('aria-label', 'Adjuntar captura');
      attachBtn.setAttribute('title', 'Adjuntar captura');
      composerInner.appendChild(attachBtn);
    }

    var inputWrap = document.createElement('div');
    inputWrap.className = 'afhub-input-wrap';

    var input = document.createElement('textarea');
    input.className = 'afhub-input';
    input.placeholder = 'Escribe un mensaje...';
    input.rows = 1;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'true');
    inputWrap.appendChild(input);

    // Voice mic button (solo si el navegador soporta Web Speech API)
    var micBtn = null;
    var voiceBar = null;
    var hasSpeechAPI = typeof window !== 'undefined' &&
      (typeof window.SpeechRecognition !== 'undefined' || typeof window.webkitSpeechRecognition !== 'undefined');
    if (cfg.micEnabled === true && hasSpeechAPI) {
      micBtn = document.createElement('button');
      micBtn.className = 'afhub-mic';
      micBtn.innerHTML = ICON_MIC;
      micBtn.setAttribute('aria-label', 'Activar voz');
      micBtn.setAttribute('type', 'button');
      inputWrap.appendChild(micBtn);

      // Voice status bar (oculta por defecto) — insertar *después* de que inputArea sea hijo de chat
      voiceBar = document.createElement('div');
      voiceBar.className = 'afhub-voice-bar';
      voiceBar.innerHTML =
        '<span class="afhub-voice-dot"></span>' +
        '<span class="afhub-voice-label">Escuchando...</span>' +
        '<button class="afhub-voice-stop" type="button" aria-label="Detener voz">Detener</button>';
    }

    if (shortcutsBtn) {
      composerInner.appendChild(shortcutsBtn);
    }

    composerInner.appendChild(inputWrap);
    inputComposer.appendChild(composerInner);

    inputArea.appendChild(inputComposer);

    var handoffBtn = null;
    if (cfg.handoffEnabled !== false) {
      handoffBtn = document.createElement('button');
      handoffBtn.className = 'afhub-handoff-icon';
      handoffBtn.type = 'button';
      handoffBtn.innerHTML = ICON_USER;
      handoffBtn.setAttribute('aria-label', 'Hablar con una persona');
      handoffBtn.setAttribute('title', 'Hablar con una persona');
      inputArea.appendChild(handoffBtn);
    }

    var ticketBtn = null;
    if (cfg.handoffEnabled !== false) {
      ticketBtn = document.createElement('button');
      ticketBtn.className = 'afhub-handoff-icon afhub-ticket-icon';
      ticketBtn.type = 'button';
      ticketBtn.innerHTML = ICON_TICKET;
      ticketBtn.setAttribute('aria-label', 'Abrir ticket de soporte');
      ticketBtn.setAttribute('title', 'Abrir ticket de soporte');
      inputArea.appendChild(ticketBtn);
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
      if (shortcutsBtn) shortcutsBtn.disabled = true;
      if (handoffBtn) handoffBtn.disabled = true;
      if (ticketBtn) ticketBtn.disabled = true;
      inputArea.classList.add('afhub-input-area--disabled');
    }
    if (voiceBar) {
      chat.insertBefore(voiceBar, inputArea);
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

    var ticketOverlay = document.createElement('div');
    ticketOverlay.className = 'afhub-handoff-overlay afhub-ticket-overlay';
    ticketOverlay.innerHTML =
      '<div class="afhub-handoff-modal afhub-ticket-modal" role="dialog" aria-labelledby="afhub-ticket-title">' +
      '<h4 id="afhub-ticket-title">Abrir ticket de soporte</h4>' +
      '<p class="afhub-handoff-desc">Contanos tu problema y te contactamos por email.</p>' +
      '<label>Nombre<input class="afhub-handoff-input" name="name" type="text" placeholder="Tu nombre" autocomplete="name"></label>' +
      '<label>Email<input class="afhub-handoff-input" name="email" type="email" placeholder="correo@ejemplo.com" autocomplete="email"></label>' +
      '<label>Descripción breve<textarea class="afhub-handoff-input afhub-handoff-textarea" name="description" rows="3" placeholder="¿Qué problema tenés?"></textarea></label>' +
      '<label>Link de video (opcional)<input class="afhub-handoff-input" name="videoUrl" type="url" placeholder="https://..."></label>' +
      '<div class="afhub-ticket-attach-row">' +
      '<button type="button" class="afhub-ticket-attach-btn">📎 Adjuntar imagen (máx. 3)</button>' +
      '<input type="file" class="afhub-ticket-file-input" accept="image/*" multiple style="display:none">' +
      '</div>' +
      '<div class="afhub-ticket-thumbs"></div>' +
      '<p class="afhub-handoff-error afhub-ticket-error" style="display:none"></p>' +
      '<div class="afhub-handoff-actions">' +
      '<button type="button" class="afhub-handoff-cancel afhub-ticket-cancel">Cancelar</button>' +
      '<button type="button" class="afhub-handoff-submit afhub-ticket-submit">Crear ticket</button>' +
      '</div></div>';
    chat.appendChild(ticketOverlay);
    if (shortcutsOverlay) chat.appendChild(shortcutsOverlay);

    // ── Encuesta de satisfacción (inline dentro del chat, no popup) ──
    var feedbackCard = null;        // tarjeta de encuesta activa en el flujo de mensajes (o null)
    var feedbackOnDone = null;
    var feedbackOfferShown = false; // botón "Calificar" por intención de cierre (1 vez por sesión)
    var feedbackQs = (cfg.feedbackEnabled && Array.isArray(cfg.feedbackQuestions))
      ? cfg.feedbackQuestions.filter(function (q) { return q && q.enabled !== false && q.text; })
      : [];

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
    powered.innerHTML = 'Powered by <a href="https://botiva.space" target="_blank" rel="noopener">BOTIVA</a>';
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
      chat.classList.toggle(
        'afhub-chat--fullscreen',
        chatLayout === 'sidebar' && sidebarSize === 'fullscreen',
      );
      syncShortcutsPresentation();

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
          // fullscreen — cortina desde el borde anclado
          chat.style.width = '100vw';
          chat.style.maxWidth = '100vw';
          chat.style.borderRadius = '0';
          if (dockLeft) {
            chat.style.left = '0';
            chat.style.right = 'auto';
          } else {
            chat.style.right = '0';
            chat.style.left = 'auto';
          }
        }

        if (sidebarSize === 'fullscreen') {
          if (scrim.style.display !== 'block') {
            scrim.style.display = 'block';
            scrim.style.opacity = '0';
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                scrim.style.opacity = '1';
              });
            });
          } else {
            scrim.style.opacity = '1';
          }
        } else if (scrim.style.display === 'block') {
          scrim.style.opacity = '0';
          setTimeout(function () {
            if (sidebarSize !== 'fullscreen') scrim.style.display = 'none';
          }, 720);
        } else {
          scrim.style.display = 'none';
        }

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

    /** Meta-instrucciones que el modelo a veces regurgita al visitante. */
    function stripVisibleMetaInstructionLeak(raw) {
      var out = String(raw || '').trim();
      if (!out) return out;
      var headerRe = /^\s*\[(?:INSTRUCCI[OÓ]N(?:ES)?|INSTRUCTION|SYSTEM(?:\s+PROMPT)?|REGLA(?:S)?|IMPORTANTE|ALTA\s+PRIORIDAD|PRIORIDAD[^\]]*)[^\]]*\]\s*/i;
      var lineRe = /^(?:Aseg[uú]rate|Evita(?:\s+cualquier)?|No\s+(?:muestres|reveles|cites|incluyas)|Never\s+|Do\s+not\s+|Remember\s+to\s+|Prioriza\s+siempre|Responde\s+de\s+forma\s+concisa)[^\n]*\n*/i;
      for (var g = 0; g < 6; g++) {
        if (!headerRe.test(out)) break;
        out = out.replace(headerRe, '').replace(/^\s+/, '');
        while (lineRe.test(out)) out = out.replace(lineRe, '').replace(/^\s+/, '');
      }
      out = out.replace(/^\s*Aseg[uú]rate de que tu respuesta sea concisa[^\n]*\n+(?:Evita[^\n]*\n+)*/i, '').trim();
      return out;
    }

    function botReplyForDisplay(raw) {
      var t = stripVisibleMetaInstructionLeak(stripHandoffPrefix(stripAssistNavBlock(String(raw || ''))));
      return cfg.showMcpUi ? t : stripHubSpotProducerNotes(t);
    }

    function appendAssistNavOffer(stackEl, offer) {
      if (!stackEl || !offer || !offer.path) return;
      var wrap = document.createElement('div');
      wrap.className = 'afhub-nav-offer';
      if (offer.prompt) {
        var rowText = '';
        try {
          var msgRow = stackEl.closest('.afhub-msg-row');
          var txtEl = msgRow && msgRow.querySelector('.afhub-msg-text');
          rowText = txtEl ? String(txtEl.innerText || txtEl.textContent || '').toLowerCase() : '';
        } catch (_rt) { /* noop */ }
        if (!rowText.includes('quieres que te lleve') && !rowText.includes('¿te llevo')) {
          var pr = document.createElement('div');
          pr.className = 'afhub-nav-prompt';
          pr.textContent = offer.prompt;
          wrap.appendChild(pr);
        }
      }
      var actions = document.createElement('div');
      actions.className = 'afhub-nav-actions';
      var yesBtn = document.createElement('button');
      yesBtn.type = 'button';
      yesBtn.className = 'afhub-action-btn';
      yesBtn.textContent = 'Sí, llévame';
      var noBtn = document.createElement('button');
      noBtn.type = 'button';
      noBtn.className = 'afhub-action-btn afhub-action-btn--ghost';
      noBtn.textContent = 'No, gracias';
      yesBtn.addEventListener('click', function () {
        yesBtn.disabled = true;
        noBtn.disabled = true;
        var target = resolveAssistNavPath(offer.path);
        var curPath = resolvePagePath(cfg);
        if (normalizeAssistPathCompare(curPath) === normalizeAssistPathCompare(target)) {
          if (offer.onDecline) {
            addMessage('bot', offer.onDecline, { noFeedback: true });
          } else if (offer.afterNavigate) {
            addMessage('bot', offer.afterNavigate, { noFeedback: true });
          }
          return;
        }
        try {
          sessionStorage.setItem(
            assistPostNavStorageKey(cfg),
            JSON.stringify({
              path: target,
              message: offer.afterNavigate || 'Aquí puedes continuar con lo que necesites. ¿En qué te ayudo?',
            }),
          );
        } catch (_s) { /* noop */ }
        var hideLoading = showAssistNavLoading(chat);
        navigateAssistDashboard(target).then(function (ok) {
          hideLoading();
          if (!ok) {
            yesBtn.disabled = false;
            noBtn.disabled = false;
            if (offer.onDecline) {
              addMessage('bot', offer.onDecline, { noFeedback: true });
            }
            return;
          }
          try {
            var navHash = assistNavHashFromPath(target);
            if (navHash) {
              setTimeout(function () {
                try {
                  var el = document.getElementById(navHash);
                  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (_sh) { /* noop */ }
              }, 400);
            }
            cfg.pagePath = target.split('#')[0];
            if (window.AgentFlowhub && typeof window.AgentFlowhub.updatePagePath === 'function') {
              window.AgentFlowhub.updatePagePath(target);
            }
          } catch (_p) { /* noop */ }
          deliverAssistPostNavFollowUp(true);
        });
      });
      noBtn.addEventListener('click', function () {
        yesBtn.disabled = true;
        noBtn.disabled = true;
        if (offer.onDecline) {
          addMessage('bot', offer.onDecline, { noFeedback: true });
        }
      });
      actions.appendChild(yesBtn);
      actions.appendChild(noBtn);
      wrap.appendChild(actions);
      stackEl.appendChild(wrap);
    }

    function attachNavOfferToBubble(bubbleEl, offer) {
      if (!offer || !offer.path || !bubbleEl) return;
      var stack = findBotMessageStack(bubbleEl);
      if (stack && !stack.querySelector('.afhub-nav-offer')) {
        appendAssistNavOffer(stack, offer);
      }
    }

    function deliverAssistPostNavFollowUp(autoOpen) {
      try {
        var raw = sessionStorage.getItem(assistPostNavStorageKey(cfg));
        if (!raw) return false;
        sessionStorage.removeItem(assistPostNavStorageKey(cfg));
        var p = JSON.parse(raw);
        if (p && p.message) {
          setTimeout(function () {
            addMessage('bot', String(p.message), { noFeedback: true });
            if (autoOpen !== false && !isOpen) open();
          }, 350);
          return true;
        }
      } catch (_e) { /* noop */ }
      return false;
    }

    function consumeAssistPostNavFollowUp() {
      deliverAssistPostNavFollowUp(true);
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

    function revealBotReplyProgressively(fullText, finalizeFn) {
      // Sin reveal por trozos: reescribir HTML cada ~10–30ms hacía titilar la burbuja.
      // El streaming SSE ya da sensación de escritura cuando está activo.
      var opts = finalizeFn && finalizeFn.opts;
      var bubble = addMessage('bot', fullText, opts);
      if (finalizeFn) finalizeFn(bubble, fullText);
      speakBotReplyIfEnabled(fullText, bubble);
    }

    var _streamPaintTimer = null;
    var _streamPaintPending = null;

    function updateStreamBubble(bubble, streamReply) {
      if (!bubble) return;
      _streamPaintPending = { bubble: bubble, reply: streamReply };
      if (_streamPaintTimer) return;
      _streamPaintTimer = setTimeout(function () {
        _streamPaintTimer = null;
        var job = _streamPaintPending;
        _streamPaintPending = null;
        if (!job || !job.bubble || !job.bubble.isConnected) return;
        var streamShown = botReplyForDisplay(job.reply);
        var textEl = job.bubble.querySelector('.afhub-msg-text');
        if (textEl) {
          textEl.innerHTML = formatBotHtml(streamShown);
        } else {
          var html = formatBotHtmlWrapped(streamShown);
          var wrap = document.createElement('div');
          wrap.innerHTML = html;
          var inner = wrap.firstChild;
          if (inner) job.bubble.insertBefore(inner, job.bubble.firstChild);
        }
        messages.scrollTop = messages.scrollHeight;
      }, 48);
    }

    function flushStreamBubblePaint() {
      if (_streamPaintTimer) {
        clearTimeout(_streamPaintTimer);
        _streamPaintTimer = null;
      }
      if (!_streamPaintPending) return;
      var job = _streamPaintPending;
      _streamPaintPending = null;
      if (!job.bubble || !job.bubble.isConnected) return;
      var streamShown = botReplyForDisplay(job.reply);
      var textEl = job.bubble.querySelector('.afhub-msg-text');
      if (textEl) textEl.innerHTML = formatBotHtml(streamShown);
      else {
        var html = formatBotHtmlWrapped(streamShown);
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        var inner = wrap.firstChild;
        if (inner) job.bubble.insertBefore(inner, job.bubble.firstChild);
      }
    }

    var lastMsgDateKey = '';
    var typingRowId = 'afhub-typing-row-' + id;

    function formatDateDivider(d) {
      var today = new Date();
      var yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      }
      if (sameDay(d, today)) return 'Hoy';
      if (sameDay(d, yesterday)) return 'Ayer';
      return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    function maybeAppendDateDivider() {
      var d = new Date();
      var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (lastMsgDateKey === key) return;
      lastMsgDateKey = key;
      var div = document.createElement('div');
      div.className = 'afhub-date-divider';
      div.innerHTML = '<span>' + escapeHtml(formatDateDivider(d)) + '</span>';
      messages.appendChild(div);
    }

    function botMsgAvatarEl() {
      var avatar = document.createElement('div');
      avatar.className = 'afhub-msg-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      if (cfg.avatar && String(cfg.avatar).trim()) {
        avatar.classList.add('afhub-msg-avatar--silhouette');
        if (isVectorAvatar(cfg.avatar)) avatar.classList.add('afhub-msg-avatar--vector');
        avatar.innerHTML = '<img src="' + escapeAttr(cfg.avatar) + '" alt="">';
      } else {
        avatar.innerHTML = ICON_BOT;
      }
      return avatar;
    }

    function mountBotMessage(el, fbRow) {
      maybeAppendDateDivider();
      var row = document.createElement('div');
      row.className = 'afhub-msg-row afhub-msg-row--bot';
      row.appendChild(botMsgAvatarEl());
      var stack = document.createElement('div');
      stack.className = 'afhub-msg-stack';
      stack.appendChild(el);
      if (fbRow) stack.appendChild(fbRow);
      row.appendChild(stack);
      messages.appendChild(row);
      return row;
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
        if (canShowErrorWhatsApp(imgOpts, displayBotText)) {
          var inlineWaRow = document.createElement('div');
          inlineWaRow.className = 'afhub-persona-offer-inner';
          inlineWaRow.style.marginTop = '6px';
          var inlineWaLink = createWhatsAppLink('agent_error');
          if (inlineWaLink) {
            inlineWaRow.appendChild(inlineWaLink);
            el.appendChild(inlineWaRow);
            if (!imgOpts) imgOpts = {};
            imgOpts.noFeedback = true;
          }
        }
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
        appendTextWithLinks(el, text, {
          color: 'rgba(255,255,255,.92)',
          textDecoration: 'underline',
          wordBreak: 'break-all',
        });
        if (imgOpts && imgOpts.userImages && imgOpts.userImages.length) {
          for (var ui = 0; ui < imgOpts.userImages.length; ui++) {
            var uItem = imgOpts.userImages[ui];
            var uUrl = uItem && (uItem.previewUrl || uItem.url);
            if (typeof uUrl === 'string' && (/^data:image\//i.test(uUrl) || /^https?:\/\//i.test(uUrl))) {
              var uWrap = document.createElement('div');
              uWrap.className = 'afhub-img-wrap afhub-img-wrap--user';
              var uLink = document.createElement('a');
              uLink.href = uUrl;
              uLink.target = '_blank';
              uLink.rel = 'noopener noreferrer';
              uLink.setAttribute('aria-label', 'Ver imagen en tamaño completo');
              uLink.style.cssText = 'display:block;line-height:0;';
              appendGeneratedImage(uLink, uUrl, uItem, ui, 'Captura adjunta');
              uWrap.appendChild(uLink);
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
      var fbRow = null;
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
        fbRow = document.createElement('div');
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
        if (isError && canShowErrorWhatsApp(imgOpts, String(text || ''))) {
          log(cfg, 'debug', 'Creating WhatsApp link', { phone: cfg.humanSupportPhone });
          var waLink = createWhatsAppLink('agent_error');
          if (waLink) leftContainer.appendChild(waLink);
        } else {
          // Solo copiar (sin 👍/👎 bajo cada mensaje)
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
      }
      if (type === 'bot') {
        var botRow = mountBotMessage(el, fbRow);
        var navOffer = imgOpts && imgOpts.navOffer ? imgOpts.navOffer : null;
        if (!navOffer) navOffer = resolveNavOfferForAssistant(null, text, lastAssistUserMessage);
        if (navOffer && botRow) {
          var navStack = botRow.querySelector('.afhub-msg-stack');
          appendAssistNavOffer(navStack, navOffer);
        }
      } else {
        maybeAppendDateDivider();
        messages.appendChild(el);
      }
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function sanitizeThinkingStatusText(raw) {
      return String(raw || '')
        .replace(/\bmcp\b/gi, 'integración')
        .replace(/\bharness\b/gi, '')
        .replace(/\bpipeline\b/gi, 'proceso')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    /** Alineado con widget-chat-status.ts — fallback cuando aún no llegó evt.message. */
    function widgetStatusCaptionForPhase(phase, detail) {
      var p = String(phase || '').trim();
      var d = typeof detail === 'string' ? detail.trim() : '';
      switch (p) {
        case 'prepare': return 'Preparando tu solicitud…';
        case 'validate': return 'Verificando sesión…';
        case 'vision': return 'Analizando captura…';
        case 'enrich': return 'Cargando contexto de conversación…';
        case 'resolve': return 'Identificando agente…';
        case 'skills':
        case 'skill': return d ? 'Aplicando habilidad: ' + d + '…' : 'Aplicando habilidades del agente…';
        case 'rag': return 'Consultando documentos indexados…';
        case 'tools': return d ? 'Usando ' + d + '…' : 'Ejecutando herramientas…';
        case 'mcp': return 'Conectando con integraciones…';
        case 'model': return 'Generando respuesta…';
        case 'hub': return 'Consultando al asistente…';
        case 'triage': return 'Analizando tu consulta…';
        case 'handoff': return d ? 'Conectando con ' + d + '…' : 'Derivando a un especialista…';
        case 'parallel': return 'Consultando especialistas en paralelo…';
        case 'pipeline': return 'Recopilando información…';
        case 'content': return 'Recopilando información del producto…';
        case 'creative': return d ? 'Generando creativo con ' + d + '…' : 'Generando creativo…';
        case 'synthesize': return 'Preparando respuesta unificada…';
        case 'start':
        default: return 'Generando respuesta…';
      }
    }

    /** Alineado con widget-chat-status.ts — catálogo vs cálculo (cualquier agente). */
    function widgetStatusCaptionForUserMessage(userText, phase, detail) {
      var msg = String(userText || '').trim();
      if (!msg) return widgetStatusCaptionForPhase(phase, detail);
      var inventoryTurn = /\binventario\b/i.test(msg);
      var reasoningTurn = /\b(?:retoma|permuta|cu[aá]nto\s+me\s+falt|diferencia|tasaci[oó]n|razona)\b/i.test(msg);
      var knowledgeTurn = /\b(?:precio|inventario|stock|cotiz|ficha|retoma|permuta|cu[aá]nto\s+(?:me\s+)?(?:falt|cuesta|vale))\b/i.test(msg);
      var p = String(phase || '').trim();
      if (p === 'rag' || p === 'hub' || p === 'mcp' || p === 'tools') {
        if (reasoningTurn) return 'Calculando con las cifras ya conocidas…';
        if (knowledgeTurn && inventoryTurn) return 'Consultando catálogo y precios…';
        if (knowledgeTurn) return 'Consultando precios y fichas…';
      }
      if (p === 'model' && reasoningTurn) return 'Razonando con las cifras del hilo…';
      return widgetStatusCaptionForPhase(phase, detail);
    }

    function thinkingCopyFromStatus(statusLabel, statusPhase) {
      var s = sanitizeThinkingStatusText(statusLabel);
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
      if (!s && !phase) return { title: widgetStatusCaptionForPhase('start'), sub: '' };
      if (!s) return { title: widgetStatusCaptionForPhase(phase), sub: '' };
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
      return { title: s, sub: '' };
    }

    /** Líneas que rotan en el footer gris (detalle SSE + copy de espera). */
    function thinkingRotationLines(phase, serverMsg) {
      var base = sanitizeThinkingStatusText(serverMsg) || widgetStatusCaptionForPhase(phase);
      var extras = {
        prepare: ['Organizando tu mensaje…', 'Un momento…'],
        enrich: ['Revisando lo que ya hablamos…', 'Ordenando el hilo…'],
        validate: ['Confirmando la sesión…'],
        resolve: ['Conectando con tu asistente…'],
        hub: ['Pensando la respuesta…', 'Procesando tu mensaje…', 'Ya casi…'],
        model: ['Redactando…', 'Afinando la respuesta…', 'Casi listo…'],
        rag: ['Buscando en la base de conocimiento…', 'Revisando documentos…'],
        tools: ['Consultando datos…', 'Un segundo más…'],
        mcp: ['Consultando integraciones…', 'Recuperando información…'],
        triage: ['Viendo cómo ayudarte mejor…', 'Un momento…'],
        start: ['Pensando la respuesta…', 'Ya casi…'],
      };
      var more = extras[phase] || extras.hub;
      var lines = [base];
      for (var i = 0; i < more.length; i++) {
        if (more[i] && more[i] !== base) lines.push(more[i]);
      }
      return lines;
    }

    function thinkingFooterForElapsed(phase, elapsedMs) {
      var visual = visualThinkingPhase(phase, elapsedMs);
      return thinkingFooterState(visual);
    }

    /** Si el servidor se queda en prepare/enrich, el copy pasa a “generando”. */
    function visualThinkingPhase(phase, elapsedMs) {
      var p = String(phase || '').trim();
      if ((p === 'prepare' || p === 'enrich' || p === 'validate') && elapsedMs >= 1100) {
        return 'model';
      }
      return p || 'model';
    }

    function applyThinkingRotation(el) {
      if (!el) return;
      var capEl = el.querySelector('.afhub-thinking-caption');
      if (!capEl || capEl.getAttribute('data-slow') === '1') return;
      var elapsed = Date.now() - typingStartedAt;
      var rotElapsed = Date.now() - (thinkingRotateStartedAt || typingStartedAt);
      var rawPhase = el.getAttribute('data-phase') || '';
      var phase = visualThinkingPhase(rawPhase, elapsed);
      var server = capEl.getAttribute('data-server') || '';
      if (phase !== rawPhase) server = widgetStatusCaptionForPhase(phase);
      var lines = thinkingRotationLines(phase, server);
      var idx = Math.floor(rotElapsed / 1100) % lines.length;
      var rotKey = String(idx) + ':' + phase;
      if (capEl.getAttribute('data-rot') === rotKey) return;
      capEl.setAttribute('data-rot', rotKey);
      var stage = thinkingFooterForElapsed(el.getAttribute('data-phase') || '', elapsed);
      var stateEl = el.querySelector('.afhub-thinking-state');
      var footerEl = el.querySelector('.afhub-thinking-footer');
      if (stage) {
        capEl.textContent = stage;
        if (stateEl) {
          stateEl.textContent = lines[idx];
          if (footerEl) footerEl.style.visibility = 'visible';
        }
      } else {
        capEl.textContent = lines[idx];
        if (stateEl) {
          stateEl.textContent = '';
          if (footerEl) footerEl.style.visibility = 'hidden';
        }
      }
    }

    function thinkingFooterState(statusPhase) {
      var phase = String(statusPhase || '').trim();
      if (phase === 'rag') return 'Consultando docs';
      if (phase === 'tools') return 'Ejecutando tools';
      if (phase === 'mcp') return 'Integraciones';
      if (phase === 'model') return 'Generando';
      if (phase === 'parallel') return 'Especialistas';
      if (phase === 'handoff') return 'Delegando';
      if (phase === 'pipeline' || phase === 'content') return 'Recopilando';
      if (phase === 'creative') return 'Creativo';
      if (phase === 'synthesize') return 'Unificando';
      if (phase === 'vision') return 'Analizando imagen';
      if (phase === 'skills' || phase === 'skill') return 'Habilidades';
      if (phase === 'hub' || phase === 'resolve') return 'Conectando';
      if (phase === 'prepare' || phase === 'enrich') return 'Preparando';
      if (phase === 'triage') return 'Analizando';
      if (phase === 'validate') return 'Validando';
      return '';
    }

    /** Caption negra = etapa corta; footer gris = mensaje SSE (detalle). */
    function resolveThinkingDisplay(statusLabel, statusPhase) {
      var server = sanitizeThinkingStatusText(statusLabel);
      var phase = String(statusPhase || '').trim();
      var detail = server || widgetStatusCaptionForPhase(phase);
      var stage = thinkingFooterState(phase);
      if (stage) {
        return { caption: stage, sub: '', footer: detail, detail: detail };
      }
      return { caption: detail, sub: '', footer: '', detail: detail };
    }

    /** @deprecated use resolveThinkingDisplay */
    function displayThinkingCaption(statusLabel, statusPhase) {
      return resolveThinkingDisplay(statusLabel, statusPhase).caption;
    }

    function clearTypingTimer() {
      if (typingTimerHandle) {
        clearInterval(typingTimerHandle);
        typingTimerHandle = null;
      }
    }

    /** Mensaje "tarda más de lo habitual" tras esta espera (segundos). */
    var SLOW_TYPING_MESSAGE_AFTER_SEC = 360;

    function startTypingTimer() {
      clearTypingTimer();
      typingStartedAt = Date.now();
      thinkingRotateStartedAt = typingStartedAt;
      typingTimerHandle = setInterval(function () {
        var el = document.getElementById(typingId);
        if (!el) {
          clearTypingTimer();
          return;
        }
        var sec = Math.floor((Date.now() - typingStartedAt) / 1000);

        if (sec >= SLOW_TYPING_MESSAGE_AFTER_SEC) {
          var capEl = el.querySelector('.afhub-thinking-caption');
          if (capEl && capEl.getAttribute('data-slow') !== '1') {
            capEl.setAttribute('data-slow', '1');
            capEl.textContent = 'Tarda un poco más de lo usual…';
            var subSlow = el.querySelector('.afhub-thinking-sub');
            if (subSlow) subSlow.style.display = 'none';
          }
        } else {
          applyThinkingRotation(el);
        }

        var elapsedEl = el.querySelector('.afhub-thinking-elapsed');
        if (!elapsedEl) return;
        if (!cfg.debug) {
          elapsedEl.textContent = '';
        } else if (sec < 3) {
          elapsedEl.textContent = '';
        } else {
          elapsedEl.textContent = sec + ' s';
        }
      }, 400);
    }

    function setInputAgentBusy(busy) {
      if (!inputComposer) return;
      if (busy) {
        inputComposer.classList.add('afhub-input-composer--agent-busy');
        inputComposer.classList.remove('afhub-input-composer--typing', 'afhub-input-composer--type-pulse');
        if (input && typeof input.blur === 'function') input.blur();
      } else {
        inputComposer.classList.remove('afhub-input-composer--agent-busy');
      }
    }

    /** Subtítulo secundario (solo si aporta contexto distinto al título). */
    function thinkingSublineFromStatus(statusLabel, statusPhase) {
      return resolveThinkingDisplay(statusLabel, statusPhase).sub;
    }

    function applyThinkingDisplay(el, statusLabel, statusPhase) {
      if (!el) return;
      var display = resolveThinkingDisplay(statusLabel, statusPhase);
      var capEl = el.querySelector('.afhub-thinking-caption');
      var subEl = el.querySelector('.afhub-thinking-sub');
      var footerEl = el.querySelector('.afhub-thinking-footer');
      var stateEl = el.querySelector('.afhub-thinking-state');
      if (capEl && capEl.getAttribute('data-slow') !== '1') {
        capEl.setAttribute('data-server', display.detail || display.footer || display.caption || '');
        capEl.removeAttribute('data-rot');
        capEl.textContent = display.caption;
        capEl.style.display = '';
      }
      if (subEl) {
        subEl.textContent = '';
        subEl.style.display = 'none';
      }
      if (stateEl) {
        if (display.footer) {
          stateEl.textContent = display.footer;
          if (footerEl) footerEl.style.visibility = 'visible';
        } else {
          stateEl.textContent = '';
          if (footerEl) footerEl.style.visibility = 'hidden';
        }
      }
      if (statusPhase) el.setAttribute('data-phase', String(statusPhase));
      else el.removeAttribute('data-phase');
      thinkingRotateStartedAt = Date.now();
    }

    var RUBIK_STEP = 5.55;

    function thinkingRubikTile(side, color) {
      return (
        '<span class="afhub-rk-tile afhub-rk-tile--' +
        side +
        (color ? ' afhub-rk-tile--' + color : ' afhub-rk-tile--inner') +
        '">' +
        (color ? '<span class="afhub-rk-sticker"></span>' : '') +
        '</span>'
      );
    }

    function thinkingRubikCubie(x, y, z) {
      return (
        '<span class="afhub-rk-cubie" data-x="' +
        x +
        '" data-y="' +
        y +
        '" data-z="' +
        z +
        '" style="transform:translate3d(' +
        x * RUBIK_STEP +
        'px,' +
        -y * RUBIK_STEP +
        'px,' +
        z * RUBIK_STEP +
        'px)">' +
        thinkingRubikTile('front', z === 1 ? 'g' : '') +
        thinkingRubikTile('back', z === -1 ? 'b' : '') +
        thinkingRubikTile('right', x === 1 ? 'r' : '') +
        thinkingRubikTile('left', x === -1 ? 'o' : '') +
        thinkingRubikTile('top', y === 1 ? 'w' : '') +
        thinkingRubikTile('bottom', y === -1 ? 'y' : '') +
        '</span>'
      );
    }

    function thinkingRubikHtml() {
      var html = '<span class="afhub-thinking-cube">';
      var x;
      var y;
      var z;
      for (x = -1; x <= 1; x++) {
        for (y = -1; y <= 1; y++) {
          for (z = -1; z <= 1; z++) {
            if (x === 0 && y === 0 && z === 0) continue;
            html += thinkingRubikCubie(x, y, z);
          }
        }
      }
      return html + '</span>';
    }

    function thinkingGlyphHtml() {
      var icon = normalizeThinkingIconConfig(cfg);
      if (!icon.enabled) return '';
      if (icon.kind === 'spark') {
        return (
          '<span class="afhub-thinking-glyph afhub-thinking-glyph--spark" aria-hidden="true">' +
            '<span class="afhub-ic-crystal">' +
              '<span class="afhub-ic-crystal__core">' +
                '<span class="afhub-ic-crystal__facet afhub-ic-crystal__facet--n"></span>' +
                '<span class="afhub-ic-crystal__facet afhub-ic-crystal__facet--e"></span>' +
                '<span class="afhub-ic-crystal__facet afhub-ic-crystal__facet--s"></span>' +
                '<span class="afhub-ic-crystal__facet afhub-ic-crystal__facet--w"></span>' +
                '<span class="afhub-ic-crystal__spark"></span>' +
              '</span>' +
            '</span>' +
          '</span>'
        );
      }
      if (icon.kind === 'orb') {
        return (
          '<span class="afhub-thinking-glyph afhub-thinking-glyph--orb" aria-hidden="true">' +
            '<span class="afhub-ic-planet">' +
              '<span class="afhub-ic-planet__glow"></span>' +
              '<span class="afhub-ic-planet__sphere">' +
                '<span class="afhub-ic-planet__shine"></span>' +
                '<span class="afhub-ic-planet__band"></span>' +
              '</span>' +
              '<span class="afhub-ic-planet__ring"></span>' +
            '</span>' +
          '</span>'
        );
      }
      if (icon.kind === 'atom') {
        return (
          '<span class="afhub-thinking-glyph afhub-thinking-glyph--atom" aria-hidden="true">' +
            '<span class="afhub-ic-orbit">' +
              '<span class="afhub-ic-orbit__core"></span>' +
              '<span class="afhub-ic-orbit__ring afhub-ic-orbit__ring--a"><span class="afhub-ic-orbit__e"></span></span>' +
              '<span class="afhub-ic-orbit__ring afhub-ic-orbit__ring--b"><span class="afhub-ic-orbit__e"></span></span>' +
              '<span class="afhub-ic-orbit__ring afhub-ic-orbit__ring--c"><span class="afhub-ic-orbit__e"></span></span>' +
            '</span>' +
          '</span>'
        );
      }
      if (icon.kind === 'pulse') {
        return (
          '<span class="afhub-thinking-glyph afhub-thinking-glyph--pulse" aria-hidden="true">' +
            '<span class="afhub-ic-radar">' +
              '<span class="afhub-ic-radar__disc"></span>' +
              '<span class="afhub-ic-radar__grid"></span>' +
              '<span class="afhub-ic-radar__ring"></span>' +
              '<span class="afhub-ic-radar__ring afhub-ic-radar__ring--mid"></span>' +
              '<span class="afhub-ic-radar__sweep"></span>' +
              '<span class="afhub-ic-radar__blip"></span>' +
              '<span class="afhub-ic-radar__cross"></span>' +
            '</span>' +
          '</span>'
        );
      }
      return (
        '<span class="afhub-thinking-glyph afhub-thinking-glyph--rubik" aria-hidden="true">' +
          thinkingRubikHtml() +
        '</span>'
      );
    }

    function renderThinkingCard(el, statusLabel, statusPhase) {
      var display = resolveThinkingDisplay(statusLabel, statusPhase);
      el.innerHTML =
        '<div class="afhub-thinking-beam-ring" aria-hidden="true">' +
          '<span class="afhub-thinking-beam-spin"></span>' +
        '</div>' +
        '<div class="afhub-thinking-inner">' +
          '<div class="afhub-thinking-body">' +
            '<div class="afhub-thinking-row">' +
              '<p class="afhub-thinking-caption" data-server="' + escapeHtml(display.detail || display.footer || display.caption) + '">' + escapeHtml(display.caption) + '</p>' +
              thinkingGlyphHtml() +
            '</div>' +
          '</div>' +
          '<div class="afhub-thinking-footer"' + (display.footer ? '' : ' style="visibility:hidden"') + '>' +
            '<span class="afhub-thinking-state">' + escapeHtml(display.footer) + '</span>' +
          '</div>' +
          '<span class="afhub-thinking-elapsed"></span>' +
        '</div>';
    }

    function setThinkingCaption(el, statusLabel, statusPhase) {
      if (!el) return;
      var capEl = el.querySelector('.afhub-thinking-caption');
      if (capEl && capEl.getAttribute('data-slow') === '1') return;
      var before = capEl ? capEl.textContent : '';
      applyThinkingDisplay(el, statusLabel, statusPhase);
      var after = el.querySelector('.afhub-thinking-caption');
      var afterText = after ? after.textContent : '';
      // Solo un pulso suave si el texto cambió de verdad (evita titileo por SSE de status).
      if (afterText && afterText !== before) {
        el.classList.add('afhub-thinking-card--pulse');
        setTimeout(function () {
          if (el.isConnected) el.classList.remove('afhub-thinking-card--pulse');
        }, 220);
      }
    }

    function showTyping(statusLabel, statusPhase) {
      hideTyping();
      setInputAgentBusy(true);
      var row = document.createElement('div');
      row.className = 'afhub-msg-row afhub-msg-row--bot afhub-msg-row--typing';
      row.id = typingRowId;
      row.appendChild(botMsgAvatarEl());
      var stack = document.createElement('div');
      stack.className = 'afhub-msg-stack';
      var el = document.createElement('div');
      el.className = 'afhub-msg bot afhub-thinking-card';
      el.id = typingId;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-busy', 'true');
      if (statusPhase) el.setAttribute('data-phase', String(statusPhase));
      renderThinkingCard(el, statusLabel, statusPhase);
      stack.appendChild(el);
      row.appendChild(stack);
      messages.appendChild(row);
      messages.scrollTop = messages.scrollHeight;
      startTypingTimer();
    }

    function updateTypingStatus(statusLabel, statusPhase) {
      var el = document.getElementById(typingId);
      if (!el) {
        showTyping(statusLabel, statusPhase);
        return;
      }
      var capEl = el.querySelector('.afhub-thinking-caption');
      if (capEl && capEl.getAttribute('data-slow') === '1') return;
      if (statusPhase) el.setAttribute('data-phase', String(statusPhase));
      else el.removeAttribute('data-phase');
      setThinkingCaption(el, statusLabel, statusPhase);
      if (cfg.debug) {
        var titleEl = el.querySelector('.afhub-thinking-title');
        var copy = thinkingCopyFromStatus(statusLabel, statusPhase);
        if (titleEl) titleEl.textContent = copy.title;
      }
      messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() {
      clearTypingTimer();
      setInputAgentBusy(false);
      var row = document.getElementById(typingRowId);
      if (row) {
        row.remove();
        return;
      }
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
      console.log('[AFHUB-DEBUG] Handoff modal opened:', {
        handoffEnabled: cfg.handoffEnabled !== false,
        humanSupportPhone: cfg.humanSupportPhone,
        humanSupportEnabled: cfg.humanSupportEnabled !== false,
        handoffNotifyMode: cfg.handoffNotifyMode,
        agentId: cfg.agentId || '',
      });
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
      console.log('[AFHUB-DEBUG] Handoff submit starting:', {
        endpoint: endpoint,
        sessionId: chatSessionId,
        agentId: cfg.agentId || '',
        humanSupportPhone: cfg.humanSupportPhone,
        handoffEnabled: cfg.handoffEnabled !== false,
        hasToken: !!(cfg.token && String(cfg.token).trim()),
        contactInfo: contactInfo,
        userMessagePreview: userMessage ? userMessage.slice(0, 80) : '',
      });
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
          var wa = result.data && result.data.waNotification;
          console.log('[AFHUB-DEBUG] Handoff API response:', {
            httpOk: result.ok,
            handoffNotifyMode: result.data && result.data.handoffNotifyMode,
            humanSupportPhone: result.data && result.data.humanSupportPhone,
            slack: result.data && result.data.slack,
            waNotification: wa,
          });
          if (wa && wa.ok === true) {
            console.log('[AFHUB-DEBUG] ✅ WhatsApp handoff alert SENT to owner:', {
              notifyPhone: wa.notifyPhone,
              messageId: wa.messageId,
              method: wa.method,
              serviceWindowOpen: wa.serviceWindowOpen,
              fromDisplayPhone: wa.fromDisplayPhone,
              fromPhoneNumberId: wa.fromPhoneNumberId,
              deliveryWarning: wa.deliveryWarning,
            });
          } else if (wa && wa.attempted === true) {
            console.log('[AFHUB-DEBUG] ❌ WhatsApp handoff alert NOT sent:', {
              skippedReason: wa.skippedReason,
              error: wa.error,
              notifyPhone: wa.notifyPhone,
              serviceWindowOpen: wa.serviceWindowOpen,
              fromDisplayPhone: wa.fromDisplayPhone,
            });
            if (wa.skippedReason === 'window_closed') {
              console.log('[AFHUB-DEBUG] ℹ️ Ventana Meta cerrada — Inbox/Slack siguen activos. WA requiere plantilla o que el operador escriba al Business en 24 h.');
            }
          } else if (wa) {
            console.log('[AFHUB-DEBUG] ⏭️ WhatsApp handoff alert skipped:', wa);
          }
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

    // ── Formulario "Abrir ticket" (soporte vía Slack, sin pasar por el LLM) ──
    var ticketPendingImages = []; // { file, previewUrl }

    function openTicketModal() {
      if (widgetDisabled) return;
      ticketOverlay.classList.add('visible');
      var errEl = ticketOverlay.querySelector('.afhub-ticket-error');
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    }

    function closeTicketModal() {
      ticketOverlay.classList.remove('visible');
    }

    function renderTicketThumbs() {
      var wrap = ticketOverlay.querySelector('.afhub-ticket-thumbs');
      if (!wrap) return;
      wrap.innerHTML = '';
      ticketPendingImages.forEach(function (img, idx) {
        var box = document.createElement('div');
        box.className = 'afhub-ticket-thumb';
        box.innerHTML = '<img src="' + img.previewUrl + '" alt="Adjunto"><button type="button" class="afhub-ticket-thumb-remove" aria-label="Quitar imagen">×</button>';
        var rm = box.querySelector('.afhub-ticket-thumb-remove');
        if (rm) {
          rm.addEventListener('click', function () {
            ticketPendingImages.splice(idx, 1);
            renderTicketThumbs();
          });
        }
        wrap.appendChild(box);
      });
      var attachBtnEl = ticketOverlay.querySelector('.afhub-ticket-attach-btn');
      if (attachBtnEl) attachBtnEl.disabled = ticketPendingImages.length >= 3;
    }

    async function handleTicketFiles(fileList) {
      var errEl = ticketOverlay.querySelector('.afhub-ticket-error');
      for (var i = 0; i < fileList.length; i++) {
        if (ticketPendingImages.length >= 3) break;
        var file = fileList[i];
        if (!/^image\//i.test(file.type || '')) continue;
        if (file.size > 10 * 1024 * 1024) {
          if (errEl) { errEl.textContent = 'Cada imagen debe pesar menos de 10 MB.'; errEl.style.display = 'block'; }
          continue;
        }
        var previewUrl = await new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result || '')); };
          reader.onerror = function () { resolve(''); };
          reader.readAsDataURL(file);
        });
        if (previewUrl) ticketPendingImages.push({ file: file, previewUrl: previewUrl });
      }
      renderTicketThumbs();
    }

    function resolveWidgetIdForTicket() {
      return String(cfg.widgetId || '').trim();
    }

    function submitTicketRequest() {
      var wid = resolveWidgetIdForTicket();
      var errEl = ticketOverlay.querySelector('.afhub-ticket-error');
      if (!wid || !cfg.token || !String(cfg.token).trim()) {
        if (errEl) { errEl.textContent = 'Configuración incompleta. Recarga la página e inténtalo de nuevo.'; errEl.style.display = 'block'; }
        return;
      }
      var nameEl = ticketOverlay.querySelector('[name="name"]');
      var emailEl = ticketOverlay.querySelector('[name="email"]');
      var descEl = ticketOverlay.querySelector('[name="description"]');
      var videoEl = ticketOverlay.querySelector('[name="videoUrl"]');
      var submitBtn = ticketOverlay.querySelector('.afhub-ticket-submit');
      var name = nameEl && nameEl.value ? String(nameEl.value).trim() : '';
      var email = emailEl && emailEl.value ? String(emailEl.value).trim() : '';
      var description = descEl && descEl.value ? String(descEl.value).trim() : '';
      var videoUrl = videoEl && videoEl.value ? String(videoEl.value).trim() : '';
      if (!name || !email || !description) {
        if (errEl) { errEl.textContent = 'Nombre, email y descripción son requeridos.'; errEl.style.display = 'block'; }
        return;
      }
      if (errEl) errEl.style.display = 'none';
      if (submitBtn) submitBtn.disabled = true;

      var uploads = ticketPendingImages.map(function (img) { return uploadVisitorAttachment(img.file); });
      Promise.all(uploads)
        .then(function (attachments) {
          var imageUrls = attachments.map(function (a) { return a && a.url ? a.url : ''; }).filter(Boolean);
          var endpoint = cfg.host.replace(/\/$/, '') + '/api/widgets/' + encodeURIComponent(wid) + '/ticket';
          return fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Widget-Token': String(cfg.token).trim()
            },
            body: JSON.stringify({
              sessionId: chatSessionId,
              agentId: cfg.agentId || '',
              contactInfo: { name: name, email: email },
              description: description,
              imageUrls: imageUrls,
              videoUrl: videoUrl,
              token: String(cfg.token).trim()
            })
          });
        })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (submitBtn) submitBtn.disabled = false;
          if (!result.ok) {
            if (errEl) {
              errEl.textContent = (result.data && result.data.error) ? result.data.error : 'No se pudo crear el ticket.';
              errEl.style.display = 'block';
            }
            return;
          }
          closeTicketModal();
          ticketPendingImages = [];
          renderTicketThumbs();
          if (nameEl) nameEl.value = '';
          if (emailEl) emailEl.value = '';
          if (descEl) descEl.value = '';
          if (videoEl) videoEl.value = '';
          var ticketIdMsg = result.data && result.data.ticketId ? ' Número de referencia: ' + result.data.ticketId + '.' : '';
          var ticketConfirmText = '🎫 ' + ((result.data && result.data.message) || 'Ticket creado. Te contactaremos pronto.') + ticketIdMsg;
          addMessage('bot', ticketConfirmText);
          // El formulario no pasa por el LLM: sin esto, el chat no "sabe" el ticketId en turnos futuros.
          history.push({ role: 'model', content: ticketConfirmText });
          saveChatToSession();
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
    var inboxWatchTimer = null;
    var humanLastPoll = new Date(0).toISOString();
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
      try { return sessionStorage.getItem('afhub-hide-msg:' + id) === '1'; } catch (e) { return false; }
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
        img.style.cssText = 'max-width:100%;max-height:160px;object-fit:contain;border-radius:8px;display:block;';
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
        appendTextWithLinks(tx, text);
        bubble.appendChild(tx);
      }
      for (var i = 0; i < atts.length; i++) appendHumanAttachment(bubble, atts[i]);
      wrap.appendChild(bubble);

      messages.appendChild(wrap);
      messages.scrollTop = messages.scrollHeight;
      if (mid) ackHumanRead(mid); // visto si el chat está visible
      if (!opts.silent) {
        onHumanMessageArrived();
        if (text) {
          history.push({ role: 'assistant', content: '[Atención personal] ' + text });
          saveChatToSession();
        }
      }
    }

    function resetHumanModeState(msg) {
      humanModeActive = false;
      if (humanPollTimer) { clearInterval(humanPollTimer); humanPollTimer = null; }
      if (humanModeTimer) { clearTimeout(humanModeTimer); humanModeTimer = null; }
      humanShownIds = {};
      humanPollCount = 0;
      humanTimeoutOffered = false;
      if (pendingHumanAttachments.length) { pendingHumanAttachments = []; renderHumanAttachPreviews(); }
      if (msg) addMessage('bot', msg);
      var inp = chat.querySelector('.afhub-input, .afhub-chat-input, textarea');
      if (inp) inp.disabled = false;
    }

    function deactivateHumanMode(msg) {
      resetHumanModeState(msg);
    }

    function historyIsUserOnly(hist) {
      return Array.isArray(hist) && hist.length > 0 && hist.every(function (e) {
        return e && e.role === 'user';
      });
    }

    function resetToWelcomeChat() {
      history = [];
      lastMsgDateKey = '';
      historyDomReady = false;
      clearPersistedChatState(cfg);
      removeFeedbackCard();
      feedbackOfferShown = false;
      messages.innerHTML = '';
      addMessage('bot', cfg.welcome);
      historyDomReady = true;
      saveChatToSession();
    }

    function widgetInboxMessagesUrl(sinceIso) {
      return cfg.host.replace(/\/$/, '') + '/api/widget/messages'
        + '?sessionId=' + encodeURIComponent(chatSessionId)
        + '&since=' + encodeURIComponent(sinceIso)
        + '&token=' + encodeURIComponent(String(cfg.token).trim());
    }

    function pollHumanMessages() {
      if (!humanModeActive || !chatSessionId || !cfg.token) return;
      // Tope de seguridad: evita polling infinito si nunca se resuelve.
      humanPollCount += 1;
      if (humanPollCount > HUMAN_POLL_MAX) {
        deactivateHumanMode();
        return;
      }
      fetch(widgetInboxMessagesUrl(humanLastPoll))
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
          // Resuelta → despedida. Devolver al bot (humanMode false, inbox abierta) → el AI retoma.
          var pollAction = (!data) ? 'keep'
            : (data.resolved === true) ? 'resolved'
            : (data.humanMode === false) ? 'bot_resumed'
            : 'keep';
          if (pollAction === 'resolved') {
            if (feedbackQs.length && !feedbackAlreadyDone()) {
              // Cerrar modo humano y ofrecer la encuesta final.
              deactivateHumanMode();
              addMessage('bot', 'La conversación con el agente ha finalizado. Antes de irte, ¿nos dejas tu opinión?', { noFeedback: true });
              openFeedbackSurvey(null);
            } else {
              deactivateHumanMode('La conversación con el agente ha finalizado. ¿Puedo ayudarte en algo más?');
            }
          } else if (pollAction === 'bot_resumed') {
            deactivateHumanMode('El asistente retomó la conversación. Puedes seguir escribiendo aquí.');
          }
        })
        .catch(function () { /* silencioso: reintenta en el próximo tick */ });
    }

    /** Si el inbox ya está en modo humano, el widget entra al poll (también si el visitante no envió el form). */
    function applyHumanInboxJoin(data, opts) {
      opts = opts || {};
      if (!(data && data.humanMode === true && data.resolved !== true)) return false;
      if (humanModeActive) return true;
      var pending = Array.isArray(data.messages) ? data.messages : [];
      activateHumanMode(data.now);
      if (pending.length) {
        pending.forEach(function (m) { addHumanMessage(m, { silent: opts.silentPending }); });
        if (!isOpen) showUnreadHumanNotice();
      }
      if (!opts.skipBanner) {
        addMessage('bot', opts.takeover
          ? 'Un agente se unió a esta conversación. Te responderá aquí mismo.'
          : 'Sigues conectado con un agente. Escríbele aquí y te responderá en este chat.');
      }
      return true;
    }

    // Verifica al abrir el widget (o al cargar) si la sesión sigue en modo humano.
    function checkHumanModeOnOpen(opts) {
      opts = opts || {};
      if (humanModeActive || !chatSessionId || !cfg.token) return;
      fetch(widgetInboxMessagesUrl(new Date(0).toISOString()))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (applyHumanInboxJoin(data, {
            skipBanner: opts.skipReconnectBanner,
            silentPending: true,
          })) return;
          if (historyIsUserOnly(history)) {
            resetToWelcomeChat();
          }
        })
        .catch(function () { /* silencioso */ });
    }

    function watchInboxTakeover() {
      if (humanModeActive || !chatSessionId || !cfg.token) return;
      fetch(widgetInboxMessagesUrl(new Date(0).toISOString()))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          applyHumanInboxJoin(data, { takeover: true, silentPending: false });
        })
        .catch(function () { /* silencioso */ });
    }

    function activateHumanMode(initialCursor) {
      if (humanModeActive) return;
      humanModeActive = true;
      // Sin cursor de servidor: epoch. El reloj del cliente adelantado perdía mensajes del inbox.
      humanLastPoll = (typeof initialCursor === 'string' && initialCursor)
        ? initialCursor
        : new Date(0).toISOString();
      humanTimeoutOffered = false;
      humanPollCount = 0;
      if (humanPollTimer) { clearInterval(humanPollTimer); humanPollTimer = null; }
      // Primer poll ya; luego cada 3s.
      pollHumanMessages();
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

    if (handoffBtn) handoffBtn.addEventListener('click', openHandoffModal);
    handoffOverlay.querySelector('.afhub-handoff-cancel').addEventListener('click', closeHandoffModal);
    handoffOverlay.querySelector('.afhub-handoff-submit').addEventListener('click', submitHandoffRequest);
    handoffOverlay.addEventListener('click', function (e) {
      if (e.target === handoffOverlay) closeHandoffModal();
    });

    if (ticketBtn) ticketBtn.addEventListener('click', openTicketModal);
    ticketOverlay.querySelector('.afhub-ticket-cancel').addEventListener('click', closeTicketModal);
    ticketOverlay.querySelector('.afhub-ticket-submit').addEventListener('click', submitTicketRequest);
    ticketOverlay.addEventListener('click', function (e) {
      if (e.target === ticketOverlay) closeTicketModal();
    });
    (function () {
      var ticketAttachBtn = ticketOverlay.querySelector('.afhub-ticket-attach-btn');
      var ticketFileInput = ticketOverlay.querySelector('.afhub-ticket-file-input');
      if (ticketAttachBtn && ticketFileInput) {
        ticketAttachBtn.addEventListener('click', function () { ticketFileInput.click(); });
        ticketFileInput.addEventListener('change', function () {
          if (ticketFileInput.files && ticketFileInput.files.length) {
            handleTicketFiles(ticketFileInput.files);
          }
          ticketFileInput.value = '';
        });
      }
    })();

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
        addMessage('bot', 'Esta conversación se finalizó por inactividad. Antes de empezar otra, ¿nos dejas tu opinión?', { noFeedback: true });
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
    function paintFeedbackStars(group, val, commit) {
      if (!group) return;
      var n = Math.max(0, parseInt(val, 10) || 0);
      if (commit !== false) group.setAttribute('data-value', String(n));
      var stars = group.querySelectorAll('.afhub-fb-star');
      var selected = commit !== false ? n : (parseInt(group.getAttribute('data-value'), 10) || 0);
      for (var m = 0; m < stars.length; m++) {
        var bv = parseInt(stars[m].getAttribute('data-star'), 10);
        if (bv <= n) stars[m].classList.add('is-on');
        else stars[m].classList.remove('is-on');
        stars[m].setAttribute('aria-checked', bv === selected && selected > 0 ? 'true' : 'false');
      }
    }

    function buildFeedbackHtml() {
      var h = '<div class="afhub-fb-inner">';
      h += '<div class="afhub-fb-title">' + fbEsc(cfg.feedbackTitle) + '</div>';
      for (var i = 0; i < feedbackQs.length; i++) {
        var q = feedbackQs[i];
        var qid = q.id || ('q' + i);
        h += '<div class="afhub-fb-q" data-qid="' + fbEsc(qid) + '" data-type="' + fbEsc(q.type) + '" data-required="' + (q.required ? '1' : '0') + '">';
        h += '<div class="afhub-fb-label">' + fbEsc(q.text) + (q.required ? ' <span class="afhub-fb-req">*</span>' : '') + '</div>';
        if (q.type === 'rating') {
          h += '<div class="afhub-fb-stars" data-value="0" role="radiogroup" aria-label="' + fbEsc(q.text) + '">';
          for (var s = 1; s <= 5; s++) {
            h += '<button type="button" class="afhub-fb-star" data-star="' + s + '" role="radio" aria-checked="false" aria-label="' + s + ' estrella' + (s === 1 ? '' : 's') + '">';
            h += '<span class="afhub-fb-star-icon" aria-hidden="true">★</span>';
            h += '</button>';
          }
          h += '</div>';
        } else if (q.type === 'yesno') {
          h += '<div class="afhub-fb-choices" role="radiogroup">';
          h += '<label class="afhub-fb-choice"><input type="radio" name="fb_' + fbEsc(qid) + '" value="Sí"><span>Sí</span></label>';
          h += '<label class="afhub-fb-choice"><input type="radio" name="fb_' + fbEsc(qid) + '" value="No"><span>No</span></label>';
          h += '</div>';
        } else if (q.type === 'choice') {
          h += '<div class="afhub-fb-choices afhub-fb-choices--stack" role="radiogroup">';
          var opts = Array.isArray(q.options) ? q.options : [];
          for (var o = 0; o < opts.length; o++) {
            h += '<label class="afhub-fb-choice"><input type="radio" name="fb_' + fbEsc(qid) + '" value="' + fbEsc(opts[o]) + '"><span>' + fbEsc(opts[o]) + '</span></label>';
          }
          h += '</div>';
        } else {
          h += '<textarea class="afhub-fb-text" rows="2" placeholder="Tu comentario…"></textarea>';
        }
        h += '</div>';
      }
      h += '<p class="afhub-fb-error" hidden></p>';
      h += '<div class="afhub-fb-actions">';
      h += '<button type="button" class="afhub-fb-submit">Enviar</button>';
      h += '<button type="button" class="afhub-fb-skip">Ahora no</button>';
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

    function normalizeFeedbackToken(t) {
      return String(t || '').trim().toLowerCase()
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
        .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u').replace(/ñ/g, 'n');
    }

    function isAffirmativeFeedback(t) {
      var raw = String(t || '').trim();
      var n = normalizeFeedbackToken(raw);
      if (!n) return false;
      if (/^👍/.test(raw)) return true;
      return n === 'si' || n === 'yes' || n === 'ya' || n === 'claro' || n === 'ok' || n === 'okey'
        || n === 'vale' || n === 'bueno' || n === 'bien' || n === 'excelente' || n === 'perfecto'
        || n === 'genial' || n === '+1' || n === 'de acuerdo';
    }

    function isNegativeFeedback(t) {
      var raw = String(t || '').trim();
      var n = normalizeFeedbackToken(raw);
      if (!n) return false;
      if (/^👎/.test(raw)) return true;
      return n === 'no' || n === 'nop' || n === 'nope' || n === 'mal' || n === 'pesimo' || n === 'regular';
    }

    function isFeedbackDismissText(t) {
      var n = normalizeFeedbackToken(t);
      return /^(ahora no|omitir|saltar|skip|luego|despues|no gracias|paso)$/.test(n);
    }

    function lastBotMessageAsksForFeedback() {
      for (var i = history.length - 1; i >= 0; i--) {
        var role = history[i] && history[i].role;
        if (role === 'model' || role === 'assistant' || role === 'bot') {
          var txt = String(history[i].content || '').toLowerCase();
          return /opini[oó]n|calificar|experiencia|encuesta|nos dejas|valoraci[oó]n|antes de (irte|empezar)/.test(txt);
        }
        if (role === 'user') break;
      }
      return false;
    }

    function autofillFeedbackCardFromSentiment(positive) {
      if (!feedbackCard) return false;
      var qEls = feedbackCard.querySelectorAll('.afhub-fb-q');
      for (var i = 0; i < qEls.length; i++) {
        var el = qEls[i];
        var type = el.getAttribute('data-type');
        if (type === 'rating') {
          paintFeedbackStars(el.querySelector('.afhub-fb-stars'), positive ? 5 : 2);
        } else if (type === 'yesno') {
          var radios = el.querySelectorAll('input[type=radio]');
          for (var r = 0; r < radios.length; r++) {
            var rv = normalizeFeedbackToken(radios[r].value);
            if ((positive && rv === 'si') || (!positive && rv === 'no')) {
              radios[r].checked = true;
              break;
            }
          }
        } else {
          var ta = el.querySelector('.afhub-fb-text');
          if (ta && !ta.value.trim()) {
            ta.value = positive ? 'Buena experiencia' : 'Puede mejorar';
          }
        }
      }
      return true;
    }

    function recordQuickFeedback(value) {
      emitEvent('message_feedback', {
        value: value,
        feedbackId: 'fb_text_' + Date.now(),
        messagePreview: 'feedback_text_reply',
      });
      try { sessionStorage.setItem('afhub-fb-done:' + chatSessionId, '1'); } catch (e) { /* */ }
    }

    /** Respuestas cortas (sí/no/ahora no) mientras hay encuesta pendiente — no enviar al agente. */
    function tryConsumeFeedbackTextReply(text) {
      if (feedbackAlreadyDone() || !feedbackQs.length) return false;
      var raw = String(text || '').trim();
      if (!raw) return false;

      if (isFeedbackDismissText(raw)) {
        if (feedbackCard || feedbackOnDone || lastBotMessageAsksForFeedback()) {
          dismissFeedback();
          return true;
        }
        return false;
      }

      var aff = isAffirmativeFeedback(raw);
      var neg = isNegativeFeedback(raw);
      if (!aff && !neg) return false;

      var inFeedbackFlow = !!(feedbackCard || feedbackOnDone || lastBotMessageAsksForFeedback());
      if (!inFeedbackFlow) return false;

      if (!feedbackCard) openFeedbackSurvey(null);

      if (feedbackCard) {
        autofillFeedbackCardFromSentiment(aff);
        submitFeedback();
        return true;
      }

      recordQuickFeedback(aff ? 'up' : 'down');
      addMessage('bot', cfg.feedbackThanks || '¡Gracias por tu feedback!', { noFeedback: true });
      scheduleAfterFeedbackSuccess(feedbackOnDone);
      return true;
    }

    /** Tras feedback exitoso: breve gracias y reinicio limpio (sin historial). */
    var feedbackResetTimer = null;
    function scheduleAfterFeedbackSuccess(pendingCb) {
      var cb = pendingCb || null;
      feedbackOnDone = null;
      if (feedbackResetTimer) {
        clearTimeout(feedbackResetTimer);
        feedbackResetTimer = null;
      }
      feedbackResetTimer = setTimeout(function () {
        feedbackResetTimer = null;
        startNewConversation();
        if (typeof cb === 'function') cb();
      }, 1200);
    }

    function submitFeedback() {
      var res = collectFeedbackAnswers();
      var errEl = feedbackCard && feedbackCard.querySelector('.afhub-fb-error');
      if (res.error) {
        if (errEl) {
          errEl.textContent = res.error;
          errEl.removeAttribute('hidden');
          errEl.style.display = 'block';
        }
        return;
      }
      if (errEl) {
        errEl.setAttribute('hidden', '');
        errEl.style.display = 'none';
        errEl.textContent = '';
      }
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
      // Reemplazar la encuesta por el agradecimiento, luego reiniciar conversación.
      if (feedbackCard) {
        feedbackCard.innerHTML =
          '<div class="afhub-fb-inner afhub-fb-thanks">' +
          '<span class="afhub-fb-check" aria-hidden="true">✓</span>' +
          '<span>' + fbEsc(cfg.feedbackThanks) + '</span></div>';
        feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      feedbackCard = null;
      scheduleAfterFeedbackSuccess(feedbackOnDone);
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
              paintFeedbackStars(group, this.getAttribute('data-star'), true);
            });
            stars[k].addEventListener('mouseenter', function () {
              paintFeedbackStars(group, this.getAttribute('data-star'), false);
            });
            stars[k].addEventListener('focus', function () {
              paintFeedbackStars(group, this.getAttribute('data-star'), false);
            });
          }
          group.addEventListener('mouseleave', function () {
            paintFeedbackStars(group, group.getAttribute('data-value') || 0, false);
          });
        })(groups[g]);
      }
      feedbackCard.querySelector('.afhub-fb-submit').addEventListener('click', submitFeedback);
      feedbackCard.querySelector('.afhub-fb-skip').addEventListener('click', dismissFeedback);
      feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (widgetDisabled && handoffBtn) {
      handoffBtn.disabled = true;
      handoffBtn.classList.add('afhub-handoff-icon--disabled');
    }
    if (widgetDisabled && ticketBtn) {
      ticketBtn.disabled = true;
      ticketBtn.classList.add('afhub-handoff-icon--disabled');
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      clearUnreadHumanNotice();
      root.classList.add('afhub-open');
      chat.classList.add('visible');
      fab.classList.add('open');
      fab.setAttribute('aria-label', 'Abrir chat');
      fab.setAttribute('aria-hidden', 'true');
      fab.tabIndex = -1;
      syncChatPanelLayout();
      renderHistoryToDom();
      requestAnimationFrame(syncMessagesScrollEdge);
      checkHumanModeOnOpen();
      checkIdleFeedback();
      Object.keys(humanShownIds).forEach(function (id) { ackHumanRead(id); });
      if (!widgetDisabled) input.focus();
      persistChatUiOpen(cfg, true);
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
      closeShortcutsModal();
      chat.classList.remove('afhub-chat--scroll-top', 'afhub-chat--scroll-bottom');
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
      fab.removeAttribute('aria-hidden');
      fab.tabIndex = 0;
      persistChatUiOpen(cfg, false);
      notify('onClose');
      emitEvent('widget_closed');
    }

    function startNewConversation() {
      if (isLoading) return;
      if (feedbackResetTimer) {
        clearTimeout(feedbackResetTimer);
        feedbackResetTimer = null;
      }
      closeHistorySearch();
      emitEvent('widget_closed');
      resetHumanModeState();
      clearPersistedChatState(cfg);
      try {
        sessionStorage.removeItem(chatSessionStorageKey(cfg) + ':long-warn');
      } catch (_e) {
        /* noop */
      }
      chatSessionId = rotateChatSessionId(cfg);
      history = [];
      feedbackOfferShown = false;
      feedbackOnDone = null;
      touchActivity();
      lastGeneratedImageDataUrl = '';
      lastSessionImageUrls = [];
      clearPendingAttachment();
      historyDomReady = false;
      lastMsgDateKey = '';
      hideTyping();
      removeFeedbackCard();
      messages.innerHTML = '';
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;
      if (flowCtrl) {
        flowCtrl.reset();
        flowCtrl.onEmptyHistory();
      } else {
        addMessage('bot', cfg.welcome);
      }
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
      if (humanPollTimer) { clearInterval(humanPollTimer); humanPollTimer = null; }
      if (inboxWatchTimer) { clearInterval(inboxWatchTimer); inboxWatchTimer = null; }
      if (humanModeTimer) { clearTimeout(humanModeTimer); humanModeTimer = null; }
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

    function mimeTypeFromImageUrl(url) {
      if (typeof url !== 'string') return 'image/jpeg';
      var m = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url);
      if (!m) return 'image/jpeg';
      var ext = m[1].toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
      return 'image/' + ext;
    }

    async function uploadPendingAttachment() {
      if (!pendingAttachment || !pendingAttachment.dataUrl) return [];
      // Snapshot antes del fetch: clearPendingAttachment() puede ejecutarse mientras sube.
      var snapDataUrl = pendingAttachment.dataUrl;
      var snapMimeType = pendingAttachment.mimeType || 'image/jpeg';
      var uploadEndpoint = cfg.host.replace(/\/$/, '') + '/api/widget/upload-image';
      var upHeaders = { 'Content-Type': 'application/json' };
      if (cfg.token) upHeaders['X-Widget-Token'] = String(cfg.token).trim();
      var upRes = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: upHeaders,
        body: JSON.stringify({
          dataUrl: snapDataUrl,
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
      return [{
        url: upJson.url,
        publicId: upJson.publicId || '',
        mimeType: upJson.mimeType || snapMimeType || mimeTypeFromImageUrl(upJson.url),
      }];
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

      if (text && !hasAttach && !hasHumanAttach && tryConsumeFeedbackTextReply(text)) {
        addMessage('user', text);
        history.push({ role: 'user', content: text });
        saveChatToSession();
        touchActivity();
        input.value = '';
        input.style.height = 'auto';
        syncSendButtonState();
        return;
      }

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
      lastAssistUserMessage = displayText;

      var humanAttachForMsg = hasHumanAttach ? pendingHumanAttachments.slice() : null;
      var userMsgOpts = attachPreviewForMsg
        ? { userImages: [attachPreviewForMsg] }
        : (humanAttachForMsg ? { attachments: humanAttachForMsg } : undefined);
      var wasLastUserMsgTrivial = isWidgetGreeting(displayText);
      addMessage('user', displayText, userMsgOpts);
      appendHumanSupportOfferInChat(displayText);
      var userHistEntry = { role: 'user', content: displayText };
      if (humanAttachForMsg && humanAttachForMsg.length) {
        userHistEntry.attachments = sanitizePersistableMediaList(humanAttachForMsg);
      }
      history.push(userHistEntry);
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
          var lastUserHist = history.length ? history[history.length - 1] : null;
          if (lastUserHist && lastUserHist.role === 'user' && userImagesPayload.length) {
            lastUserHist.userImages = sanitizePersistableMediaList(userImagesPayload);
            saveChatToSession();
          }
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
      try {
        var pp = resolvePagePath(cfg);
        if (pp) payload.pagePath = pp;
      } catch (_pp) { /* noop */ }

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
                : widgetStatusCaptionForUserMessage(displayText, 'model');
      var initialPhase = userImagesPayload.length
        ? 'vision'
        : cfg.multiAgentEnabled
          ? 'triage'
          : 'model';
      setInputAgentBusy(true);
      showTyping(initialTyping, initialPhase);

      // ── SSE Streaming (cuando el servidor lo soporta) ──────────────────────
      var useStream = cfg.stream !== false && typeof window.ReadableStream !== 'undefined';
      var streamRevealMinChars = 8;

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
          var TICKET_MARKER = '[[OPEN_TICKET_FORM]]';
          var streamMaybeMarker = true; // mientras streamReply sea prefijo del marcador, no renderizamos aún

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
                notify('onStatus', { phase: stPhase, message: evt.message });
                continue;
              }
              if (evt.type === 'token') {
                streamReply += typeof evt.text === 'string' ? evt.text : '';
                if (streamMaybeMarker) {
                  if (TICKET_MARKER.indexOf(streamReply.trim()) === 0 && streamReply.trim().length > 0) {
                    continue; // sigue pareciendo el marcador — no renderizar todavía
                  }
                  streamMaybeMarker = false; // divergió: es texto normal, mostramos todo lo acumulado
                }
                if (streamReply.length >= streamRevealMinChars) hideTyping();
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
                var errMsg = friendlyChatError(evt.code, evt.message || 'Error del agente.');
                if (evt.code === 'SESSION_TURN_LIMIT') {
                  errMsg = FRIENDLY_CHAT_ERRORS.SESSION_TURN_LIMIT;
                }
                var streamErrorOpts = botOptsForAgentError(evt);
                var streamShowWa = canShowErrorWhatsApp(streamErrorOpts, errMsg);
                errMsg = adjustErrorMessageForWhatsApp(errMsg, streamShowWa);
                if (streamErrorOpts) streamErrorOpts.showWhatsApp = streamShowWa;
                addMessage('bot', errMsg, streamErrorOpts);
                notify('onError', { message: errMsg, code: evt.code });
              }
            }
          }

          if (streamDoneEvt) {
            var doneEvt = streamDoneEvt;
            var finalRaw = resolveStreamFinalRaw(doneEvt, streamReply);
            var finalReply = botReplyForDisplay(finalRaw);
            if (/\[\[OPEN_TICKET_FORM\]\]/.test(finalReply)) {
              finalReply = finalReply.replace(/\[\[OPEN_TICKET_FORM\]\]/g, '').trim();
              if (!finalReply) finalReply = 'Contame los detalles en este formulario 👇';
              try { openTicketModal(); } catch (_e) { /* noop */ }
            }
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
              flushStreamBubblePaint();
              var te2 = streamBubble.querySelector('.afhub-msg-text');
              if (te2) te2.innerHTML = formatBotHtml(finalReply);
              streamBubble.classList.remove('afhub-msg--streaming');
              var streamNavOffer = resolveNavOfferForAssistant(doneEvt, finalRaw, lastAssistUserMessage);
              if (streamNavOffer) {
                attachNavOfferToBubble(streamBubble, streamNavOffer);
              }
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
            var streamHistEntry = { role: 'model', content: finalReply };
            if (doneEvt.images && doneEvt.images.length) {
              var streamImgs = sanitizePersistableMediaList(doneEvt.images);
              if (streamImgs.length) streamHistEntry.images = streamImgs;
            }
            history.push(streamHistEntry);
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
      if (!document.getElementById(typingId)) {
        showTyping(widgetStatusCaptionForUserMessage(displayText, 'hub'), 'hub');
      }
      var data = await fetchJsonWithRetry(endpoint, payload, cfg);
        hideTyping();
        var replyRaw = data.reply || data.response || data.text || 'Sin respuesta';
        var reply = botReplyForDisplay(replyRaw);
        if (/\[\[OPEN_TICKET_FORM\]\]/.test(reply)) {
          reply = reply.replace(/\[\[OPEN_TICKET_FORM\]\]/g, '').trim();
          if (!reply) reply = 'Contame los detalles en este formulario 👇';
          try { openTicketModal(); } catch (_e) { /* noop */ }
        }
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
        var navOffer = resolveNavOfferForAssistant(data, replyRaw, lastAssistUserMessage);
        var botOpts = undefined;
        var showTools = cfg.showMcpUi && toolsUsed && toolsUsed.length;
        var showMcpChip = cfg.showMcpUi && mcpTag;
        if ((imgs && imgs.length) || showTools || showMcpChip || cooldown || navOffer) {
          botOpts = {};
          if (imgs && imgs.length) botOpts.images = imgs;
          if (showTools) botOpts.toolsUsed = toolsUsed;
          if (showMcpChip) botOpts.mcpTag = mcpTag;
          if (cooldown) botOpts.cooldown = true;
          if (navOffer) botOpts.navOffer = navOffer;
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
          var stdHistEntry = { role: 'model', content: finalReply };
          if (imgs && imgs.length) {
            var stdImgs = sanitizePersistableMediaList(imgs);
            if (stdImgs.length) stdHistEntry.images = stdImgs;
          }
          history.push(stdHistEntry);
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
        var msgRaw = isHubError && e && e.message
          ? e.message
          : 'El agente no puede responder ahora. Espera unos segundos e inténtalo de nuevo o si prefieres atención inmediata, puedes escribirnos a ';
        var showWa = canShowErrorWhatsApp({ showWhatsApp: true }, msgRaw);
        var msg = adjustErrorMessageForWhatsApp(msgRaw, showWa);
        var botOpts = { error: true, showWhatsApp: showWa };
        log(cfg, 'debug', 'Chat error - showing WhatsApp button', { isHubError, msgLength: msg.length, botOpts });
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
      syncVoiceBeamUI(state);
      if (!voiceBar || state === 'idle') return;
      var dot = voiceBar.querySelector('.afhub-voice-dot');
      var label = voiceBar.querySelector('.afhub-voice-label');
      if (!dot || !label) return;
      dot.className = 'afhub-voice-dot afhub-voice-dot--' + state;
      var labels = { listening: 'Escuchando...', thinking: 'Pensando...', speaking: 'Hablando...' };
      label.textContent = labels[state] || 'Escuchando...';
    }

    /** Beam "line" (ondas) mientras escucha/habla/piensa; borde completo en idle. */
    function syncVoiceBeamUI(state) {
      if (!inputComposer) return;
      var s = state || voiceState || 'idle';
      var line = s === 'listening' || s === 'speaking' || s === 'thinking';
      inputComposer.classList.toggle('afhub-input-composer--voice-line', line);
      if (line) inputComposer.setAttribute('data-voice', s);
      else inputComposer.removeAttribute('data-voice');
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
      else if (ttsMode) setVoiceState('speaking');
      log(cfg, 'debug', '[TTS] Speaking reply', { length: ttsText.length, preview: ttsText.substring(0, 120) });
      ttsSpeak(ttsText, function() {
        if (voiceActive && voiceShouldBeActive) {
          setTimeout(startListening, 300);
          setVoiceState('listening');
        } else {
          setVoiceState('idle');
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
      syncVoiceBeamUI('idle');
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
      if (headerSpeakerBtn) {
        headerSpeakerBtn.innerHTML = ttsMode ? ICON_VOLUME_ON : ICON_VOLUME_OFF;
        headerSpeakerBtn.classList.toggle('afhub-header-speaker--active', ttsMode);
        headerSpeakerBtn.setAttribute(
          'aria-label',
          ttsMode ? 'Desactivar lectura en voz alta' : 'Lectura en voz alta'
        );
        headerSpeakerBtn.title = ttsMode ? 'Desactivar lectura en voz alta' : 'Lectura en voz alta';
      }
    }

    function toggleTtsMode() {
      ttsMode = !ttsMode;
      syncSpeakerMenuItem();
      if (!ttsMode) ttsStop();
    }

    if (headerSpeakerBtn) {
      headerSpeakerBtn.addEventListener('click', toggleTtsMode);
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

    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    });

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
      header.style.touchAction = 'none';
      header.style.cursor = 'grab';
      header.classList.add('afhub-header--draggable');

      function isHeaderDragBlocked(target) {
        if (!target || !target.closest) return false;
        return Boolean(
          target.closest(
            'button, a, input, textarea, select, .afhub-header-actions, .afhub-settings-menu, .afhub-settings-wrap'
          )
        );
      }

      function beginRootPointerDrag(e, captureEl, mode) {
        if (chatLayout === 'sidebar') return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        if (mode === 'chat' && isHeaderDragBlocked(e.target)) return;

        var chatRect = null;
        var rootRect = root.getBoundingClientRect();
        if (mode === 'chat') {
          chatRect = chat.getBoundingClientRect();
          if (!chatRect.width || !chatRect.height) return;
        }

        fabDrag = {
          pid: e.pointerId,
          mode: mode,
          el: captureEl,
          sx: e.clientX,
          sy: e.clientY,
          moved: false,
          ox: mode === 'chat' ? e.clientX - chatRect.left : e.clientX - rootRect.left,
          oy: mode === 'chat' ? e.clientY - chatRect.top : e.clientY - rootRect.top,
          rootOffX: mode === 'chat' ? rootRect.left - chatRect.left : 0,
          rootOffY: mode === 'chat' ? rootRect.top - chatRect.top : 0,
          chatW: mode === 'chat' ? chatRect.width : 0,
          chatH: mode === 'chat' ? chatRect.height : 0
        };
        try {
          captureEl.setPointerCapture(e.pointerId);
        } catch (_err) {
          /* noop */
        }
      }

      function onRootPointerMove(e) {
        if (!fabDrag || e.pointerId !== fabDrag.pid) return;
        var pad = 8;
        var vw = window.innerWidth || 320;
        var vh = window.innerHeight || 568;
        if (!fabDrag.moved) {
          if (Math.abs(e.clientX - fabDrag.sx) < 6 && Math.abs(e.clientY - fabDrag.sy) < 6) return;
          fabDrag.moved = true;
          fab.classList.add('afhub-fab--dragging');
          header.classList.add('afhub-header--dragging');
          root.classList.add('afhub-root--dragging');
        }

        var nl;
        var nt;
        if (fabDrag.mode === 'chat') {
          var chatL = clamp(e.clientX - fabDrag.ox, pad, Math.max(pad, vw - fabDrag.chatW - pad));
          var chatT = clamp(e.clientY - fabDrag.oy, pad, Math.max(pad, vh - fabDrag.chatH - pad));
          nl = chatL + fabDrag.rootOffX;
          nt = chatT + fabDrag.rootOffY;
        } else {
          var nw = root.offsetWidth || 72;
          var nh = root.offsetHeight || 72;
          nl = clamp(e.clientX - fabDrag.ox, pad, Math.max(pad, vw - nw - pad));
          nt = clamp(e.clientY - fabDrag.oy, pad, Math.max(pad, vh - nh - pad));
        }

        root.style.left = nl + 'px';
        root.style.top = nt + 'px';
        root.style.right = '';
        root.style.bottom = '';
        root.style.transform = '';
        root.style.width = '';
      }

      function endRootPointerDrag(e) {
        if (!fabDrag) return;
        if (e && e.pointerId != null && e.pointerId !== fabDrag.pid) return;
        var captureEl = fabDrag.el || fab;
        try {
          captureEl.releasePointerCapture(fabDrag.pid);
        } catch (_er) {
          /* noop */
        }
        fab.classList.remove('afhub-fab--dragging');
        header.classList.remove('afhub-header--dragging');
        root.classList.remove('afhub-root--dragging');
        if (fabDrag.moved) {
          finalizeFabDragToCfg();
          clampCustomLauncherToViewport();
          persistFabDragToSession();
          syncChatPanelLayout();
          suppressFabClick = true;
        }
        fabDrag = null;
      }

      fab.addEventListener('pointerdown', function (e) {
        beginRootPointerDrag(e, fab, 'fab');
      });
      header.addEventListener('pointerdown', function (e) {
        if (!isOpen) return;
        beginRootPointerDrag(e, header, 'chat');
      });
      fab.addEventListener('pointermove', onRootPointerMove);
      header.addEventListener('pointermove', onRootPointerMove);
      fab.addEventListener('pointerup', endRootPointerDrag);
      fab.addEventListener('pointercancel', endRootPointerDrag);
      header.addEventListener('pointerup', endRootPointerDrag);
      header.addEventListener('pointercancel', endRootPointerDrag);
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

    /** Menú Ajustes — abrir/cerrar y manejar opciones */
    function setSettingsMenuOpen(open) {
      settingsMenu.style.display = open ? 'block' : 'none';
      chat.classList.toggle('afhub-settings-open', open === true);
    }
    settingsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = settingsMenu.style.display !== 'none';
      setSettingsMenuOpen(!isOpen);
    });
    /** Cerrar el menú al click fuera */
    document.addEventListener('click', function (e) {
      if (!settingsWrap.contains(e.target)) setSettingsMenuOpen(false);
    });
    var newChatMenuItem = settingsMenu.querySelector('.afhub-settings-new-chat');
    if (newChatMenuItem) {
      newChatMenuItem.addEventListener('click', function () {
        setSettingsMenuOpen(false);
        startNewConversation();
      });
    }

    var historySearchHits = [];
    var historySearchHitIdx = -1;

    function clearHistorySearchHighlights() {
      var prev = messages.querySelectorAll('.afhub-msg--search-hit, .afhub-msg--search-dim');
      for (var i = 0; i < prev.length; i++) {
        prev[i].classList.remove('afhub-msg--search-hit', 'afhub-msg--search-dim');
      }
      historySearchHits = [];
      historySearchHitIdx = -1;
      if (historySearchMeta) historySearchMeta.textContent = '';
    }

    function collectSearchableMessages() {
      var nodes = messages.querySelectorAll('.afhub-msg.user, .afhub-msg.bot');
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.classList.contains('afhub-fb-card') || el.classList.contains('afhub-fb-offer') || el.classList.contains('afhub-thinking-card')) {
          continue;
        }
        var txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt.length < 1) continue;
        out.push({ el: el, text: txt });
      }
      return out;
    }

    function runHistorySearch(query) {
      clearHistorySearchHighlights();
      var needle = String(query || '').trim().toLowerCase();
      if (needle.length < 1) {
        if (historySearchMeta) historySearchMeta.textContent = '';
        return;
      }
      var all = collectSearchableMessages();
      var hits = [];
      for (var i = 0; i < all.length; i++) {
        if (all[i].text.toLowerCase().indexOf(needle) !== -1) hits.push(all[i].el);
        else all[i].el.classList.add('afhub-msg--search-dim');
      }
      historySearchHits = hits;
      if (historySearchMeta) {
        historySearchMeta.textContent = hits.length
          ? hits.length + (hits.length === 1 ? ' resultado' : ' resultados')
          : 'Sin coincidencias';
      }
      if (hits.length) {
        historySearchHitIdx = 0;
        hits[0].classList.add('afhub-msg--search-hit');
        hits[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function closeHistorySearch() {
      if (!historySearchBar) return;
      historySearchBar.hidden = true;
      chat.classList.remove('afhub-history-search-open');
      if (historySearchInput) historySearchInput.value = '';
      clearHistorySearchHighlights();
    }

    function openHistorySearch() {
      setSettingsMenuOpen(false);
      historySearchBar.hidden = false;
      chat.classList.add('afhub-history-search-open');
      clearHistorySearchHighlights();
      if (historySearchInput) {
        historySearchInput.value = '';
        historySearchInput.focus();
      }
      if (historySearchMeta) historySearchMeta.textContent = 'Escribe una palabra…';
    }

    var historySearchMenuItem = settingsMenu.querySelector('.afhub-settings-history-search');
    if (historySearchMenuItem) {
      historySearchMenuItem.addEventListener('click', function () {
        openHistorySearch();
      });
    }
    if (historySearchClose) {
      historySearchClose.addEventListener('click', function () {
        closeHistorySearch();
      });
    }
    if (historySearchInput) {
      var historySearchDebounce = null;
      historySearchInput.addEventListener('input', function () {
        if (historySearchDebounce) clearTimeout(historySearchDebounce);
        var q = historySearchInput.value;
        historySearchDebounce = setTimeout(function () {
          runHistorySearch(q);
        }, 120);
      });
      historySearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeHistorySearch();
          return;
        }
        if (e.key === 'Enter' && historySearchHits.length) {
          e.preventDefault();
          historySearchHitIdx = (historySearchHitIdx + 1) % historySearchHits.length;
          for (var h = 0; h < historySearchHits.length; h++) {
            historySearchHits[h].classList.toggle('afhub-msg--search-hit', h === historySearchHitIdx);
          }
          historySearchHits[historySearchHitIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (historySearchMeta) {
            historySearchMeta.textContent =
              historySearchHitIdx + 1 + ' / ' + historySearchHits.length;
          }
        }
      });
    }

    /** Opción Borrar conversación */
    var clearBtnEl = settingsMenu.querySelector('.afhub-settings-clear');
    if (clearBtnEl) {
      clearBtnEl.addEventListener('click', function () {
        setSettingsMenuOpen(false);
        var ok = window.confirm('¿Borrar toda la conversación? Esta acción no se puede deshacer.');
        if (ok) startNewConversation();
      });
    }
    if (cfg.flowId && cfg.flowToken && typeof createFlowController === 'function') {
      flowCtrl = createFlowController({
        cfg: cfg,
        chat: chat,
        inputArea: inputArea,
        input: input,
        addMessage: function (type, text, imgOpts) { return addMessage(type, text, imgOpts); },
        historyPush: function (entry) {
          history.push(entry);
          saveChatToSession();
        },
        getInputValue: function () { return input.value; },
        clearInput: function () {
          input.value = '';
          input.style.height = 'auto';
          syncSendButtonState();
        },
        syncSendButtonState: syncSendButtonState,
      });
    }

    var baseSend = send;
    send = function (textArg) {
      if (flowCtrl && flowCtrl.onSend(textArg, baseSend)) return;
      return baseSend(textArg);
    };

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
    applyShortcut = function (sc) {
      if (widgetDisabled) return;
      closeShortcutsModal();
      input.value = sc.message || sc.label || '';
      input.dispatchEvent(new Event('input'));
      send();
    };
    if (shortcutsBtn) {
      shortcutsBtn.addEventListener('click', function () {
        if (shortcutsOverlay && shortcutsOverlay.classList.contains('visible')) {
          closeShortcutsModal();
        } else {
          openShortcutsModal();
        }
      });
    }
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && shortcutsOverlay && shortcutsOverlay.classList.contains('visible')) {
        e.preventDefault();
        closeShortcutsModal();
      }
    });
    var beamTypePulseTimer = null;
    var beamTypingIdleTimer = null;
    var lastBeamInputLen = 0;
    function pulseBeamOnType() {
      if (!inputComposer) return;
      inputComposer.classList.add('afhub-input-composer--typing');
      inputComposer.classList.remove('afhub-input-composer--type-pulse');
      void inputComposer.offsetWidth;
      inputComposer.classList.add('afhub-input-composer--type-pulse');
      if (beamTypePulseTimer) clearTimeout(beamTypePulseTimer);
      beamTypePulseTimer = setTimeout(function () {
        inputComposer.classList.remove('afhub-input-composer--type-pulse');
        beamTypePulseTimer = null;
      }, 280);
      if (beamTypingIdleTimer) clearTimeout(beamTypingIdleTimer);
      beamTypingIdleTimer = setTimeout(function () {
        inputComposer.classList.remove('afhub-input-composer--typing');
        beamTypingIdleTimer = null;
      }, 900);
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
      var len = (input.value || '').length;
      if (len > lastBeamInputLen) pulseBeamOnType();
      lastBeamInputLen = len;
    });

    if (cfg.autoOpen || shouldRestoreChatUiOpen(cfg)) setTimeout(open, 80);
    else setTimeout(function () { checkHumanModeOnOpen({ skipReconnectBanner: true }); }, 400);
    inboxWatchTimer = setInterval(watchInboxTakeover, 3500);
    setTimeout(consumeAssistPostNavFollowUp, 600);
    emitEvent('widget_loaded');
    try {
      window.dispatchEvent(new CustomEvent('afhub:assist-ready'));
    } catch (_readyEv) { /* noop */ }

    var api = {
      id: id,
      open: open,
      close: close,
      toggle: toggle,
      send: send,
      newConversation: startNewConversation,
      showLauncher: function () { showLauncher(true); },
      hideLauncher: function () { hideLauncher(true); },
      updatePagePath: function (path) {
        cfg.pagePath = path != null ? String(path).trim() : '';
      },
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
    var hasToken   = script.getAttribute('data-token') || script.getAttribute('data-widget-token');
    var hasFlow    = script.getAttribute('data-flow-id') && script.getAttribute('data-flow-token');
    if (!hasAgentId && !hasToken && !hasFlow) return;
    var config = {
      agentId: attr(script, 'data-agent-id', ''),
      token: attr(script, 'data-token', '') || attr(script, 'data-widget-token', ''),
      flowId: attr(script, 'data-flow-id', ''),
      flowToken: attr(script, 'data-flow-token', ''),
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
      voiceEnabled: attr(script, 'data-voice-enabled', 'false') === 'true',
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
    if (hasFlow && !hasToken) {
      log({ debug: true }, 'warn', '[AgentFlowhub] Flujo embebido sin data-token del widget; añade data-token="wt_..." al script.');
    }
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

  function colorRgba(hex, alpha) {
    var rgb = hexToRgbOrb(hex);
    if (!rgb) return 'rgba(99,102,241,' + alpha + ')';
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  /** amount: -1..1 — negativo oscurece, positivo aclara */
  function shadeHex(hex, amount) {
    var rgb = hexToRgbOrb(isHexColor(hex) ? hex : '#6366f1');
    if (!rgb) return hex;
    function ch(c) {
      if (amount >= 0) return clamp(c + (255 - c) * amount, 0, 255);
      return clamp(c * (1 + amount), 0, 255);
    }
    return rgbToHexOrb(ch(rgb.r), ch(rgb.g), ch(rgb.b));
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

  function normalizeAiBeamConfig(cfg) {
    var scope = String((cfg && cfg.aiBeamScope) || 'both').toLowerCase();
    if (['off', 'input', 'messages', 'both'].indexOf(scope) === -1) scope = 'both';
    var palette = String((cfg && cfg.aiBeamPalette) || 'rainbow').toLowerCase();
    if (['rainbow', 'brand', 'custom'].indexOf(palette) === -1) palette = 'rainbow';
    var color = String((cfg && cfg.aiBeamColor) || '').trim();
    if (!isHexColor(color)) color = '';
    var blur = Number(cfg && cfg.aiBeamBlur);
    if (!isFinite(blur)) blur = 4;
    blur = clamp(Math.round(blur), 0, 20);
    var speed = Number(cfg && cfg.aiBeamSpeed);
    if (!isFinite(speed)) speed = 5;
    speed = clamp(Math.round(speed * 10) / 10, 2, 16);
    var intensity = Number(cfg && cfg.aiBeamIntensity);
    if (!isFinite(intensity)) intensity = 85;
    intensity = clamp(Math.round(intensity), 10, 100);
    return { scope: scope, palette: palette, color: color, blur: blur, speed: speed, intensity: intensity };
  }

  function normalizeScrollHaloConfig(cfg) {
    var enabled = !(cfg && cfg.scrollHaloEnabled === false);
    var colorMode = String((cfg && cfg.scrollHaloColorMode) || 'brand').toLowerCase();
    if (colorMode !== 'custom') colorMode = 'brand';
    var color = String((cfg && cfg.scrollHaloColor) || '').trim();
    if (!isHexColor(color)) color = '';
    var height = Number(cfg && cfg.scrollHaloHeight);
    if (!isFinite(height)) height = 28;
    height = clamp(Math.round(height), 8, 48);
    var opacity = Number(cfg && cfg.scrollHaloOpacity);
    if (!isFinite(opacity)) opacity = 55;
    opacity = clamp(Math.round(opacity), 0, 100);
    var blur = Number(cfg && cfg.scrollHaloBlur);
    if (!isFinite(blur)) blur = 10;
    blur = clamp(Math.round(blur), 0, 24);
    var top = !(cfg && cfg.scrollHaloTop === false);
    var bottom = !(cfg && cfg.scrollHaloBottom === false);
    return {
      enabled: enabled,
      colorMode: colorMode,
      color: color,
      height: height,
      opacity: opacity,
      blur: blur,
      top: top,
      bottom: bottom
    };
  }

  function normalizeThinkingIconConfig(cfg) {
    var enabled = !(cfg && cfg.thinkingIconEnabled === false);
    var kind = String((cfg && cfg.thinkingIcon) || 'rubik').toLowerCase();
    if (['rubik', 'spark', 'orb', 'atom', 'pulse'].indexOf(kind) === -1) kind = 'rubik';
    return { enabled: enabled, kind: kind };
  }

  function resolveScrollHaloAccent(haloCfg, brandHex) {
    if (haloCfg.colorMode === 'custom' && haloCfg.color) return haloCfg.color;
    var scrollHaloRgb = hexToRgbOrb(brandHex);
    var widgetAccentLight = '#ffc9a3';
    if (scrollHaloRgb) {
      var scrollHaloHsl = rgbToHslOrb(scrollHaloRgb.r, scrollHaloRgb.g, scrollHaloRgb.b);
      widgetAccentLight = rgbToHexOrb(
        scrollHaloHsl.h,
        clamp(scrollHaloHsl.s - 10, 0, 100),
        clamp(scrollHaloHsl.l + 24, 62, 90)
      );
    }
    return widgetAccentLight;
  }

  function buildScrollHaloGradient(accent, opacityPct, direction) {
    var peak = (opacityPct / 100) * 0.72;
    var mid = peak * 0.54;
    var low = peak * 0.15;
    var fade = peak * 0.04;
    if (direction === 'bottom') {
      return (
        'linear-gradient(0deg,' +
        colorRgba(accent, peak) +
        ' 0%,' +
        colorRgba(accent, mid) +
        ' 42%,' +
        colorRgba(accent, low) +
        ' 72%,' +
        colorRgba(accent, fade) +
        ' 88%,transparent 100%)'
      );
    }
    return (
      'linear-gradient(180deg,' +
      colorRgba(accent, peak) +
      ' 0%,' +
      colorRgba(accent, mid) +
      ' 42%,' +
      colorRgba(accent, low) +
      ' 72%,' +
      colorRgba(accent, fade) +
      ' 88%,transparent 100%)'
    );
  }

  function conicBeamGradient(cfg, brandHex, vivid) {
    var beam = normalizeAiBeamConfig(cfg);
    if (beam.palette === 'rainbow') {
      return vivid
        ? 'conic-gradient(from var(--afhub-beam-angle,0deg),#14b8a6,#0ea5e9,#6366f1,#a855f7,#d946ef,#f97316,#eab308,#14b8a6)'
        : 'conic-gradient(from var(--afhub-beam-angle,0deg),#2dd4bf,#38bdf8,#818cf8,#c084fc,#e879f9,#f472b6,#fb923c,#fbbf24,#2dd4bf)';
    }
    var hex = beam.palette === 'custom' && beam.color ? beam.color : (isHexColor(brandHex) ? brandHex : '#6366f1');
    var rgb = hexToRgbOrb(hex);
    if (!rgb) {
      return vivid
        ? 'conic-gradient(from var(--afhub-beam-angle,0deg),#14b8a6,#0ea5e9,#6366f1,#a855f7,#d946ef,#f97316,#eab308,#14b8a6)'
        : 'conic-gradient(from var(--afhub-beam-angle,0deg),#2dd4bf,#38bdf8,#818cf8,#c084fc,#e879f9,#f472b6,#fb923c,#fbbf24,#2dd4bf)';
    }
    var hsl = rgbToHslOrb(rgb.r, rgb.g, rgb.b);
    var light = hslToRgbOrb(hsl.h, clamp(hsl.s + (vivid ? 14 : 10), 0, 100), clamp(hsl.l + (vivid ? 20 : 16), 12, 94));
    var soft = hslToRgbOrb(hsl.h, clamp(hsl.s - 4, 0, 100), clamp(hsl.l + 8, 12, 92));
    var deep = hslToRgbOrb(hsl.h, clamp(hsl.s + 2, 0, 100), clamp(hsl.l - (vivid ? 10 : 6), 8, 88));
    var c1 = rgbToHexOrb(light.r, light.g, light.b);
    var c2 = hex;
    var c3 = rgbToHexOrb(soft.r, soft.g, soft.b);
    var c4 = rgbToHexOrb(deep.r, deep.g, deep.b);
    return (
      'conic-gradient(from var(--afhub-beam-angle,0deg),' +
      c1 +
      ',' +
      c2 +
      ',' +
      c3 +
      ',' +
      c4 +
      ',' +
      c2 +
      ',' +
      c1 +
      ')'
    );
  }

  function fabAvatarSizePx(cfg) {
    var n = Number(cfg && cfg.fabAvatarSize);
    if (!Number.isFinite(n)) n = 86;
    return clamp(Math.round(n), 48, 120);
  }

  function cssForRoot(rootId, cfg) {
    var fabAvatarPx = fabAvatarSizePx(cfg);
    var beamCfg = normalizeAiBeamConfig(cfg);
    var brandHex = isHexColor(cfg.color) ? cfg.color : '#6366f1';
    var b04 = colorRgba(brandHex, 0.04);
    var b06 = colorRgba(brandHex, 0.06);
    var b08 = colorRgba(brandHex, 0.08);
    var b10 = colorRgba(brandHex, 0.1);
    var b12 = colorRgba(brandHex, 0.12);
    var b14 = colorRgba(brandHex, 0.14);
    var b16 = colorRgba(brandHex, 0.16);
    var b18 = colorRgba(brandHex, 0.18);
    var b22 = colorRgba(brandHex, 0.22);
    var b28 = colorRgba(brandHex, 0.28);
    var b32 = colorRgba(brandHex, 0.32);
    var glassBubble = 'rgba(255,255,255,.58)';
    var isDarkTheme = cfg.theme === 'dark';
    var chatShellGlass = 'rgba(255,255,255,.64)';
    var chatGlassFilter = 'blur(44px) saturate(185%) brightness(1.05)';
    var chatSurfaceBg = 'transparent';
    var messagesBg = 'transparent';
    var shortcutsSidebarBg = 'linear-gradient(180deg, rgba(255,255,255,.28) 0%, rgba(247,248,250,.18) 100%)';
    var shellBg = chatShellGlass;
    var panelBg = chatSurfaceBg;
    var msgBubbleBg = 'rgba(255,255,255,.82)';
    var msgBubbleBorder = 'none';
    var msgBubbleShadow = '0 2px 10px rgba(15,23,42,.05), 0 1px 3px rgba(15,23,42,.04)';
    var userBubbleBg = 'rgba(255,255,255,.88)';
    var userBubbleBorder = 'none';
    var userBubbleShadow = '0 2px 10px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)';
    var userBubbleColor = '#111111';
    var fsBotMsgColor = '#111111';
    var composerInnerShadow = '0 1px 2px rgba(15,23,42,.03)';
    var composerShellBg = 'rgba(255,255,255,.52)';
    var composerInnerBg = 'rgba(255,255,255,.38)';
    var composerBorder = 'none';
    var headerText = '#111111';
    var headerSubtext = '#737373';
    var headerIcon = '#64748b';
    if (isDarkTheme) {
      chatShellGlass = 'rgba(22,22,28,.82)';
      chatGlassFilter = 'blur(40px) saturate(160%) brightness(.9)';
      chatSurfaceBg = 'transparent';
      messagesBg = 'transparent';
      shellBg = chatShellGlass;
      panelBg = chatSurfaceBg;
      shortcutsSidebarBg =
        'radial-gradient(ellipse 90% 60% at 0% 0%, rgba(255,255,255,.05) 0%, transparent 55%),' +
        'linear-gradient(180deg, rgba(22,22,29,.72) 0%, rgba(18,18,26,.55) 100%)';
      fsBotMsgColor = '#ececf1';
      msgBubbleBg = 'rgba(38,38,48,.78)';
      msgBubbleBorder = 'none';
      msgBubbleShadow = '0 4px 16px rgba(0,0,0,.28), 0 1px 2px rgba(0,0,0,.18)';
      userBubbleBg = brandHex;
      userBubbleBorder = 'none';
      userBubbleShadow = '0 2px 10px rgba(0,0,0,.28)';
      userBubbleColor = '#ffffff';
      composerInnerShadow = 'none';
      composerShellBg = 'rgba(255,255,255,.08)';
      composerInnerBg = 'rgba(255,255,255,.06)';
      composerBorder = 'none';
      headerText = '#ffffff';
      headerSubtext = 'rgba(255,255,255,.82)';
      headerIcon = 'rgba(255,255,255,.78)';
    } else {
      msgBubbleBg = 'rgba(255,255,255,.82)';
    }
    var rainbowBeam = conicBeamGradient(cfg, brandHex, false);
    var rainbowBeamVivid = conicBeamGradient(cfg, brandHex, true);
    var beamBlurPx = beamCfg.blur;
    var beamSpeedIn = beamCfg.speed;
    var beamSpeedMsg = Math.round(beamCfg.speed * 12) / 10;
    var beamIntensity = beamCfg.intensity / 100;
    var beamGlow = beamIntensity * 0.45;
    var beamBloomOpacity = 0.42 * beamIntensity;
    var scrollHaloRgb = hexToRgbOrb(brandHex);
    var widgetAccentLight = '#ffc9a3';
    if (scrollHaloRgb) {
      var scrollHaloHsl = rgbToHslOrb(scrollHaloRgb.r, scrollHaloRgb.g, scrollHaloRgb.b);
      widgetAccentLight = rgbToHexOrb(
        scrollHaloHsl.h,
        clamp(scrollHaloHsl.s - 10, 0, 100),
        clamp(scrollHaloHsl.l + 24, 62, 90)
      );
    }
    var messagesPadTop = 22;
    var widgetScrollHaloHeight = 28;
    var widgetScrollHaloGradient =
      'linear-gradient(180deg,' +
      colorRgba(widgetAccentLight, 0.52) +
      ' 0%,' +
      colorRgba(widgetAccentLight, 0.28) +
      ' 42%,' +
      colorRgba(widgetAccentLight, 0.08) +
      ' 72%,transparent 100%)';
    var widgetScrollHaloGradientBottom =
      'linear-gradient(0deg,' +
      colorRgba(widgetAccentLight, 0.52) +
      ' 0%,' +
      colorRgba(widgetAccentLight, 0.28) +
      ' 42%,' +
      colorRgba(widgetAccentLight, 0.08) +
      ' 72%,transparent 100%)';
    var glassComposer = 'rgba(255,255,255,.52)';
    var macRadius = Math.max(Number(cfg.borderRadius) || 16, 22);
    var inputTopRadius = Math.max(14, Math.min(macRadius, 22));
    var macSpring = 'cubic-bezier(0.32,0.72,0,1)';
    var dp = '#' + rootId + '[data-afhub-theme="dark"] ';
    var dark = isDarkTheme
      ? dp + '.afhub-chat { background:' + shellBg + '; -webkit-backdrop-filter:' + chatGlassFilter + '; backdrop-filter:' + chatGlassFilter + '; border-color:rgba(255,255,255,.1); box-shadow:0 20px 56px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08); }' +
        dp + '.afhub-messages { background:transparent; scrollbar-color:rgba(255,255,255,.14) transparent; }' +
        dp + '.afhub-messages::-webkit-scrollbar-thumb { background:rgba(255,255,255,.16); }' +
        dp + '.afhub-header { background:' + chatSurfaceBg + '; color:#fff; }' +
        dp + '.afhub-chat--scroll-top .afhub-scroll-halo--top { opacity:1; }' +
        dp + '.afhub-chat--scroll-bottom .afhub-scroll-halo--bottom { opacity:1; }' +
        dp + '.afhub-header-info h3 { color:' + headerText + '; }' +
        dp + '.afhub-header-status { color:' + headerSubtext + '; }' +
        dp + '.afhub-status-dot { background:#4ade80; box-shadow:0 0 0 1px rgba(255,255,255,.35); }' +
        dp + '.afhub-header-icon-btn { color:' + headerIcon + '; }' +
        dp + '.afhub-header-icon-btn:hover,' + dp + '.afhub-header-icon-btn:active { background:rgba(255,255,255,.14); color:#fff; }' +
        dp + '.afhub-avatar svg,' + dp + '.afhub-msg-avatar svg { color:rgba(255,255,255,.82); }' +
        dp + '.afhub-settings-menu { background:#252530; border-color:rgba(255,255,255,.1); box-shadow:0 16px 48px rgba(0,0,0,.45); }' +
        dp + '.afhub-settings-item { color:#ececf1; }' +
        dp + '.afhub-settings-item:hover { background:rgba(255,255,255,.08); color:#fff; }' +
        dp + '.afhub-history-search-inner { background:rgba(37,37,48,.92); border-color:rgba(255,255,255,.1); box-shadow:none; }' +
        dp + '.afhub-history-search-input { color:#ececf1; }' +
        dp + '.afhub-history-search-meta { color:#71717a; }' +
        dp + '.afhub-history-search-close { color:#a1a1aa; }' +
        dp + '.afhub-history-search-close:hover { background:rgba(255,255,255,.08); color:#fff; }' +
        dp + '.afhub-msg.afhub-msg--search-hit { outline-color:rgba(255,255,255,.35); }' +
        dp + '.afhub-msg.bot,' + dp + '.afhub-msg-row--bot .afhub-msg { background:' + msgBubbleBg + '; color:#ececf1; border:' + msgBubbleBorder + '; box-shadow:' + msgBubbleShadow + '; }' +
        dp + '.afhub-msg.user { background:' + userBubbleBg + '; color:' + userBubbleColor + '; border:' + userBubbleBorder + '; box-shadow:' + userBubbleShadow + '; }' +
        dp + '.afhub-msg.user .afhub-msg-link { color:#fff; text-decoration:underline; }' +
        dp + '.afhub-msg-time { color:#8b8b98; }' +
        dp + '.afhub-thinking-inner { background:' + msgBubbleBg + '; border:' + msgBubbleBorder + '; box-shadow:' + msgBubbleShadow + '; }' +
        dp + '.afhub-thinking-caption { color:#ececf1; text-decoration:none; background:transparent; -webkit-text-fill-color:currentColor; }' +
        dp + '.afhub-thinking-sub { color:#9ca3af; text-decoration:none; background:transparent; -webkit-text-fill-color:currentColor; }' +
        dp + '.afhub-thinking-footer { border-top:none; }' +
        dp + '.afhub-thinking-card::before { opacity:.18 !important; filter:blur(4px) saturate(1.1); }' +
        dp + '.afhub-thinking-beam-ring { opacity:.62 !important; }' +
        dp + '.afhub-thinking-beam-spin { filter:saturate(1.05) brightness(1); opacity:.85; }' +
        dp + '.afhub-thinking-state { background:linear-gradient(90deg,#8b8b98 0%,#cbd5e1 42%,#8b8b98 84%); background-size:220% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }' +
        dp + '.afhub-input-area { background:' + panelBg + '; }' +
        dp + '.afhub-input-composer { background:' + composerShellBg + '; }' +
        dp + '.afhub-input-composer-inner { background:' + composerInnerBg + '; border:none; box-shadow:' + composerInnerShadow + '; }' +
        dp + '.afhub-input { color:#ececf1 !important; -webkit-text-fill-color:#ececf1; caret-color:' + brandHex + '; }' +
        dp + '.afhub-input::placeholder { color:#888; }' +
        dp + '.afhub-attach,' + dp + '.afhub-mic,' + dp + '.afhub-shortcuts-btn,' + dp + '.afhub-handoff-icon { color:#a1a1aa; }' +
        dp + '.afhub-attach:hover,' + dp + '.afhub-mic:hover,' + dp + '.afhub-shortcuts-btn:hover,' + dp + '.afhub-handoff-icon:hover { background:rgba(255,255,255,.08); color:#e4e4e7; }' +
        dp + '.afhub-send:not(:disabled) { background:#ececf1; color:#111; }' +
        dp + '.afhub-send:disabled { background:#3f3f46; color:rgba(255,255,255,.45); }' +
        dp + '.afhub-powered { color:#6b6b78; background:' + shellBg + '; }' +
        dp + '.afhub-powered a { color:#9a9aaa; }' +
        dp + '.afhub-policy { color:#8b8b98; }' +
        dp + '.afhub-policy a,' + dp + '.afhub-policy-link { color:#c4b5fd; }' +
        dp + '.afhub-fab-hint { background:#252530; color:#ececf1; border-color:rgba(255,255,255,.08); box-shadow:0 8px 32px rgba(0,0,0,.35); }' +
        dp + '.afhub-fab-hint::after { border-top-color:#252530 !important; }' +
        dp + '.afhub-persona-offer { border-color:rgba(255,255,255,.1); background:rgba(255,255,255,.05); }' +
        dp + '.afhub-persona-offer-hint { color:#b8b8c8; }' +
        dp + '.afhub-persona-tag { border-color:rgba(255,255,255,.12); background:rgba(255,255,255,.06); }' +
        dp + '.afhub-msg-copy-btn { border-color:rgba(255,255,255,.2); color:#a9b0bd; }' +
        dp + '.afhub-msg-copy-btn:hover { border-color:rgba(255,255,255,.4); color:#eef2ff; }' +
        dp + '.afhub-msg-rich .afhub-pre { background:#1a1a24; color:#e8e8ef; border-color:rgba(255,255,255,.08); }' +
        dp + '.afhub-msg-rich .afhub-code { background:#2a2a36; color:#e0e0ea; }' +
        dp + '.afhub-tool-tag,' + dp + '.afhub-mcp-source-tag { background:rgba(255,255,255,.08); color:#a8a8b8; border-color:rgba(255,255,255,.12); }' +
        dp + '.afhub-fallback-tag { color:rgba(255,255,255,.28) !important; border-color:rgba(255,255,255,.1) !important; background:rgba(255,255,255,.04) !important; }' +
        dp + '.afhub-fallback-tag--debug { color:#fbbf24 !important; background:rgba(251,191,36,.1) !important; border-color:rgba(251,191,36,.3) !important; }' +
        dp + '.afhub-feedback-btn { color:#a9b0bd; }' +
        dp + '.afhub-feedback-btn:hover { background:rgba(255,255,255,.08); color:#fff; }' +
        dp + '.afhub-flow-options { background:' + chatSurfaceBg + '; border-top:none; }' +
        dp + '.afhub-flow-opt-btn { background:#252530; border-color:rgba(255,255,255,.1); color:#ececf1; }' +
        dp + '.afhub-attach-preview { background:' + chatSurfaceBg + '; border-top:none; }' +
        dp + '.afhub-attach-preview-inner { background:#252530; border-color:rgba(255,255,255,.1); }' +
        dp + '.afhub-attach-preview-label { color:#a1a1aa; }' +
        dp + '.afhub-handoff-modal { background:#252530; color:#ececf1; }' +
        dp + '.afhub-handoff-modal h4 { color:#fff; }' +
        dp + '.afhub-handoff-desc,' + dp + '.afhub-handoff-modal label { color:#a1a1aa; }' +
        dp + '.afhub-handoff-input { background:#1e1e28 !important; color:#ececf1 !important; border-color:rgba(255,255,255,.12) !important; -webkit-text-fill-color:#ececf1; }' +
        dp + '.afhub-ticket-attach-btn { background:#1e1e28 !important; color:#ececf1 !important; border-color:rgba(255,255,255,.12) !important; }' +
        dp + '.afhub-ticket-thumb { border-color:rgba(255,255,255,.12); }' +
        dp + '.afhub-msg.afhub-fb-card,' + dp + '.afhub-msg.afhub-fb-offer { background:' + msgBubbleBg + '; border:' + msgBubbleBorder + '; box-shadow:' + msgBubbleShadow + '; -webkit-backdrop-filter:none; backdrop-filter:none; color:#ececf1; }' +
        dp + '.afhub-fb-title { color:#ececf1; }' +
        dp + '.afhub-fb-label { color:#a1a1aa; }' +
        dp + '.afhub-fb-star { color:#52525b; }' +
        dp + '.afhub-fb-star:hover,' + dp + '.afhub-fb-star:focus-visible { background:rgba(245,179,1,.16); }' +
        dp + '.afhub-fb-choice span { background:#252530; border-color:rgba(255,255,255,.12); color:#d4d4d8; }' +
        dp + '.afhub-fb-choice:hover span { background:#2d2d3a; border-color:rgba(255,255,255,.18); color:#ececf1; }' +
        dp + '.afhub-fb-text { background:#1e1e28; color:#ececf1; border-color:rgba(255,255,255,.12); -webkit-text-fill-color:#ececf1; caret-color:' + brandHex + '; }' +
        dp + '.afhub-fb-text::placeholder { color:#71717a; opacity:1; }' +
        dp + '.afhub-fb-skip { color:#a1a1aa; }' +
        dp + '.afhub-fb-skip:hover { color:#ececf1; background:rgba(255,255,255,.08); }' +
        dp + '.afhub-fb-thanks { color:#ececf1; }' +
        dp + '.afhub-chat.afhub-chat--fullscreen { background:' + shellBg + '; }' +
        dp + '.afhub-chat.afhub-chat--fullscreen .afhub-header { background:' + chatSurfaceBg + '; }' +
        dp + '.afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-wrap { background:' + shortcutsSidebarBg + '; border-right-color:rgba(255,255,255,.08); box-shadow:inset -1px 0 0 rgba(255,255,255,.04); }' +
        dp + '.afhub-chat.afhub-chat--fullscreen .afhub-shortcut-pill { background:#252530; border-color:rgba(255,255,255,.1); color:#d4d4d8; }' +
        dp + '.afhub-shortcuts-modal { background:#252530; border-color:rgba(255,255,255,.1); box-shadow:0 16px 48px rgba(0,0,0,.45); }' +
        dp + '.afhub-shortcuts-modal-head { border-bottom-color:rgba(255,255,255,.08); }' +
        dp + '.afhub-shortcuts-modal-head h4 { color:#a1a1aa; }' +
        dp + '.afhub-shortcuts-close { color:#a1a1aa; }' +
        dp + '.afhub-shortcuts-close:hover { background:rgba(255,255,255,.08); color:#ececf1; }' +
        dp + '.afhub-shortcut-pill { background:#252530; border-color:rgba(255,255,255,.1); color:#d4d4d8; }' +
        dp + '.afhub-shortcut-pill:hover { background:#2d2d3a; border-color:' + brandHex + '55; color:#ececf1; box-shadow:0 2px 10px rgba(0,0,0,.25); }' +
        dp + '.afhub-pill-arrow { color:#71717a; }' +
        dp + '.afhub-chat.afhub-chat--fullscreen .afhub-input-composer,' +
        dp + '.afhub-chat.afhub-chat--fullscreen .afhub-input-composer:focus-within { background:' + composerShellBg + '; }'
      : '';
    return '' +
      '#' + rootId + ' { --afhub-beam-blur:' + beamBlurPx + 'px; --afhub-beam-speed-input:' + beamSpeedIn + 's; --afhub-beam-speed-msg:' + beamSpeedMsg + 's; --afhub-beam-intensity:' + beamIntensity + '; --afhub-beam-glow:' + beamGlow + '; --afhub-beam-bloom:' + beamBloomOpacity + '; }' +
      '#' + rootId + ',#' + rootId + ' *,#' + rootId + ' *::before,#' + rootId + ' *::after {' +
        'font-family:' + AFHUB_FONT_STACK + ' !important;' +
        '-webkit-font-smoothing:antialiased;' +
        '-moz-osx-font-smoothing:grayscale;' +
        'text-size-adjust:100%;' +
        '-webkit-text-size-adjust:100%;' +
      '}' +
      '#' + rootId + ' * { box-sizing:border-box; margin:0; padding:0; }' +
      '#' + rootId + ' { background:transparent !important; }' +
      '#' + rootId + ' .afhub-launcher,#' + rootId + ' .afhub-fab-wrap { background:transparent !important; }' +
      '#' + rootId + ' .afhub-msg,#' + rootId + ' .afhub-msg-rich .afhub-p,#' + rootId + ' .afhub-msg-text { font-weight:400; letter-spacing:.01em; color:inherit; }' +
      '#' + rootId + ' .afhub-msg.user { font-weight:500; }' +
      '#' + rootId + ' .afhub-msg-rich strong,#' + rootId + ' .afhub-header-info h3 { font-weight:600; }' +
      '#' + rootId + '.afhub-launcher-hidden { display:none !important; visibility:hidden !important; pointer-events:none !important; }' +
      '#' + rootId + ' .afhub-fab-wrap { position:relative; display:inline-flex; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-launcher-dismiss { width:20px; height:20px; padding:0; border-radius:50%; border:1px solid rgba(0,0,0,.14); background:#fff; color:#64748b; font-size:14px; line-height:1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.14); transition:background .15s,color .15s; }' +
      '#' + rootId + ' .afhub-launcher-dismiss:hover { background:#f8fafc; color:#0f172a; }' +
      '#' + rootId + ' .afhub-launcher-dismiss--orb { position:absolute; top:-2px; right:-2px; z-index:6; width:18px; height:18px; font-size:11px; }' +
      '#' + rootId + ' .afhub-launcher { display:flex; flex-direction:column; gap:12px; width:max-content; max-width:min(260px,calc(100vw - 40px)); }' +
      '#' + rootId + '[data-afhub-h="right"] .afhub-launcher { align-items:flex-end; }' +
      '#' + rootId + '[data-afhub-h="left"] .afhub-launcher { align-items:flex-start; }' +
      '#' + rootId + '[data-afhub-h="center"] .afhub-launcher { align-items:center; }' +
      '#' + rootId + ' .afhub-fab-hint-wrap { position:relative; transition:opacity .2s ease,max-height .3s ease; }' +
      '#' + rootId + ' .afhub-fab-hint-float { animation:afhub-hint-float-y 4.2s ease-in-out 2.45s infinite; }' +
      '#' + rootId + ' .afhub-fab-hint { position:relative; font-size:13px; line-height:1.38; padding:10px 14px 12px; border-radius:14px; background:#ffffff; color:#1c1c1e; max-width:240px; text-align:left; border:1px solid rgba(0,0,0,.06); box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06); opacity:0; transform:scale(0.1) translateY(48px); filter:blur(14px); animation:afhub-genie-hint 0.95s cubic-bezier(0.22,1.25,0.36,1.15) 1.5s forwards; }' +
      '#' + rootId + ' .afhub-fab-hint::after { content:""; position:absolute; bottom:-7px; width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-top:8px solid #ffffff; filter:drop-shadow(0 1px 0 rgba(0,0,0,.04)); }' +
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
        ' .afhub-thinking-cube,#' + rootId + ' .afhub-ic-crystal__core,#' + rootId + ' .afhub-ic-crystal__spark,#' + rootId + ' .afhub-ic-planet,#' + rootId + ' .afhub-ic-planet__ring,#' + rootId + ' .afhub-ic-orbit,#' + rootId + ' .afhub-ic-orbit__ring--a,#' + rootId + ' .afhub-ic-orbit__ring--b,#' + rootId + ' .afhub-ic-orbit__ring--c,#' + rootId + ' .afhub-ic-radar__sweep,#' + rootId + ' .afhub-ic-radar__blip { animation:none !important; } #' +
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
        ' .afhub-orb-avatar-halo { animation:none !important; opacity:.75 !important; } #' +
        rootId +
        ' .afhub-chat { transition:opacity .18s ease !important; filter:none !important; transform:scale(1) translateY(0) !important; } #' +
        rootId +
        ' .afhub-input-beam-ring { opacity:0 !important; } #' +
        rootId +
        ' .afhub-input-beam-spin,#' + rootId + ' .afhub-input-beam-bloom { animation:none !important; } #' +
        rootId +
        ' .afhub-thinking-beam-ring { opacity:.85 !important; } #' +
        rootId +
        ' .afhub-thinking-card::before,#' + rootId + ' .afhub-thinking-beam-spin { animation:none !important; opacity:.18 !important; } #' +
        rootId +
        ' .afhub-input-composer:focus-within .afhub-input-beam-ring { opacity:.65 !important; } }' +
      '#' + rootId + '.afhub-open .afhub-launcher { display:none !important; visibility:hidden !important; pointer-events:none !important; }' +
      '#' + rootId + '.afhub-open .afhub-fab { display:none !important; }' +
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
      '#' + rootId + ' .afhub-header.afhub-header--draggable { cursor:grab; }' +
      '#' + rootId + ' .afhub-header.afhub-header--dragging { cursor:grabbing !important; user-select:none; -webkit-user-select:none; }' +
      '#' + rootId + ' .afhub-header.afhub-header--draggable .afhub-header-actions,' +
      '#' + rootId + ' .afhub-header.afhub-header--draggable .afhub-header-icon-btn,' +
      '#' + rootId + ' .afhub-header.afhub-header--draggable .afhub-settings-wrap { cursor:pointer; }' +
      '#' + rootId + '.afhub-root--dragging .afhub-chat { transition:none !important; }' +
      '#' + rootId + ' .afhub-fab svg { width:26px; height:26px; transition:transform .3s; }' +
      '#' + rootId + ' .afhub-fab-inner { position:relative; z-index:2; width:36px; height:36px; display:flex; align-items:center; justify-content:center; }' +
      '#' + rootId + ' .afhub-orb { position:relative; width:32px; height:32px; display:flex; align-items:center; justify-content:center; }' +
      '#' + rootId + ' .afhub-orb-core { position:relative; z-index:2; width:12px; height:12px; border-radius:50%; background:radial-gradient(circle at 50% 48%,#fff,rgba(255,255,255,.92)); box-shadow:0 0 14px rgba(255,255,255,.85),inset 0 1px 2px rgba(255,255,255,.5); }' +
      '#' + rootId + ' .afhub-orb-wave { pointer-events:none; position:absolute; left:50%; top:50%; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; border:2px solid rgba(255,255,255,.42); animation:afhub-wave 2.5s cubic-bezier(.22,1,.36,1) infinite; }' +
      '#' + rootId + ' .afhub-orb-wave-b { animation-delay:1.2s; border-width:1px; border-color:rgba(255,255,255,.28); }' +
      '#' + rootId + ' .afhub-orb--avatar { width:36px; height:36px; display:flex; align-items:center; justify-content:center; position:relative; border-radius:0; background:transparent; overflow:visible; }' +
      '#' + rootId + ' .afhub-orb-avatar-halo { position:absolute; inset:-22%; border-radius:50%; pointer-events:none; z-index:0; background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.55) 0%,rgba(212,175,55,.22) 42%,transparent 72%); filter:blur(11px); opacity:.9; animation:afhub-avatar-halo 5.2s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-orb-avatar-img { width:36px; height:36px; border-radius:50%; object-fit:cover; object-position:center 18%; position:relative; z-index:2; display:block; border:2px solid rgba(255,255,255,.94); box-shadow:inset 0 2px 10px rgba(0,0,0,.16),inset 0 -1px 0 rgba(255,255,255,.28),0 4px 14px rgba(0,0,0,.18); filter:contrast(1.06) saturate(1.08); -webkit-backface-visibility:hidden; backface-visibility:hidden; transform:translateZ(0); }' +
      '#' + rootId + ' .afhub-orb-avatar-shine { position:absolute; inset:0; border-radius:50%; pointer-events:none; z-index:3; background:linear-gradient(145deg,rgba(255,255,255,.48) 0%,rgba(255,255,255,.12) 34%,transparent 56%,rgba(255,255,255,.06) 100%); mix-blend-mode:soft-light; }' +
      '#' + rootId + ' .afhub-orb-avatar-halo,#' + rootId + ' .afhub-orb-avatar-shine { display:none; }' +
      '#' + rootId + ' .afhub-orb--avatar-silhouette { border-radius:0; overflow:visible; background:transparent; box-shadow:none; }' +
      '#' + rootId + ' .afhub-orb--avatar-silhouette .afhub-orb-avatar-img { border-radius:0; object-fit:contain; object-position:center center; background:transparent; border:none; box-shadow:none; filter:drop-shadow(0 4px 10px rgba(15,23,42,.16)); image-rendering:auto; -webkit-backface-visibility:hidden; backface-visibility:hidden; transform:translateZ(0); }' +
      '#' + rootId + ' .afhub-orb--avatar-vector .afhub-orb-avatar-img { border-radius:0; object-fit:contain; object-position:center center; background:transparent; border:none; box-shadow:none; filter:drop-shadow(0 4px 10px rgba(15,23,42,.16)); }' +
      /* FAB con avatar — orbe flotante, sin disco #061018 ni anillo blanco */
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar { width:' + fabAvatarPx + 'px; height:' + fabAvatarPx + 'px; border-radius:0; background:transparent !important; background-blend-mode:normal; filter:none; padding:0; overflow:visible; box-shadow:none; transition:transform .28s cubic-bezier(.22,1,.36,1); appearance:none; -webkit-appearance:none; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar::before,#' + rootId + ' .afhub-fab.afhub-fab--avatar::after { display:none; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar .afhub-fab-inner { width:100%; height:100%; border-radius:0; overflow:visible; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar .afhub-orb--avatar { width:100%; height:100%; padding:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar .afhub-orb-avatar-img { width:100%; height:100%; border-radius:0; object-fit:contain; object-position:center center; box-shadow:none; display:block; image-rendering:auto; border:none; filter:drop-shadow(0 4px 10px rgba(15,23,42,.16)); background:transparent; -webkit-backface-visibility:hidden; backface-visibility:hidden; transform:translateZ(0); }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar-round .afhub-orb--avatar { border-radius:50%; overflow:hidden; background:transparent !important; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar-round .afhub-fab-inner { border-radius:50%; overflow:hidden; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar-round .afhub-orb-avatar-img { border-radius:50%; object-fit:cover; object-position:center center; filter:drop-shadow(0 4px 10px rgba(15,23,42,.16)); }' +
      '#' + rootId + '.afhub-open .afhub-fab.afhub-fab--avatar { width:' + fabAvatarPx + 'px; height:' + fabAvatarPx + 'px; background:transparent; box-shadow:none; opacity:1; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar:hover { transform:scale(1.07); filter:none; box-shadow:none; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar:hover .afhub-orb-avatar-img { filter:drop-shadow(0 6px 14px rgba(15,23,42,.22)); }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar:hover .afhub-orb--avatar { box-shadow:none; }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar:active { transform:scale(1.01); }' +
      '#' + rootId + ' .afhub-fab.afhub-fab--avatar.afhub-fab--dragging { box-shadow:none; }' +
      '@media (prefers-reduced-motion:reduce){ #' + rootId + ' .afhub-orb-wave { animation:none; opacity:.35; transform:scale(1.15); } }' +
      '#' + rootId + '[data-afhub-h="right"] .afhub-chat { transform-origin:100% 100%; }' +
      '#' + rootId + '[data-afhub-h="left"] .afhub-chat { transform-origin:0% 100%; }' +
      '#' + rootId + '[data-afhub-h="center"] .afhub-chat { transform-origin:50% 100%; }' +
      '#' + rootId + '[data-afhub-v="top"][data-afhub-h="right"] .afhub-chat { transform-origin:100% 0%; }' +
      '#' + rootId + '[data-afhub-v="top"][data-afhub-h="left"] .afhub-chat { transform-origin:0% 0%; }' +
      '#' + rootId + '[data-afhub-v="top"][data-afhub-h="center"] .afhub-chat { transform-origin:50% 0%; }' +
      '#' + rootId + ' .afhub-chat { position:absolute; width:392px; max-width:calc(100vw - 40px); height:540px; max-height:calc(100vh - 120px); background:' + shellBg + '; -webkit-backdrop-filter:' + chatGlassFilter + '; backdrop-filter:' + chatGlassFilter + '; border:1px solid rgba(255,255,255,.58); border-radius:' + macRadius + 'px; box-shadow:0 24px 64px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.88); display:flex; flex-direction:column; overflow:hidden; transform:scale(.92) translateY(12px); opacity:0; pointer-events:none; transition:transform .45s ' + macSpring + ',opacity .4s ' + macSpring + ',box-shadow .45s ' + macSpring + '; will-change:transform,opacity; isolation:isolate; }' +
      '#' + rootId + ' .afhub-chat::before { display:none; }' +
      '#' + rootId + ' .afhub-chat::after { display:none; }' +
      '#' + rootId + ' .afhub-chat > * { position:relative; }' +
      '#' + rootId + ' .afhub-header { z-index:30; }' +
      '#' + rootId + ' .afhub-messages-shell,' +
      '#' + rootId + ' .afhub-shortcuts-wrap,' +
      '#' + rootId + ' .afhub-input-area,' +
      '#' + rootId + ' .afhub-action-bar,' +
      '#' + rootId + ' .afhub-handoff-bar { z-index:1; }' +
      '#' + rootId + ' .afhub-chat.afhub-settings-open .afhub-messages-shell,' +
      '#' + rootId + ' .afhub-chat.afhub-settings-open .afhub-shortcuts-wrap { z-index:0; }' +
      '#' + rootId + '[data-afhub-v="top"] .afhub-chat { transform:scale(.84) translateY(-14px); }' +
      '#' + rootId + ' .afhub-chat.visible { transform:none; will-change:opacity; opacity:1; pointer-events:auto; box-shadow:0 16px 48px rgba(15,23,42,.14),0 4px 12px rgba(15,23,42,.08); }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--sidebar {' +
        'transition:' +
          'transform .28s cubic-bezier(.34,1.2,.64,1),' +
          'opacity .28s,' +
          'width .92s cubic-bezier(.22,.61,.36,1),' +
          'max-width .92s cubic-bezier(.22,.61,.36,1),' +
          'border-radius .92s cubic-bezier(.22,.61,.36,1),' +
          'left .92s cubic-bezier(.22,.61,.36,1),' +
          'right .92s cubic-bezier(.22,.61,.36,1),' +
          'background .7s ease,' +
          'box-shadow .7s ease,' +
          'border-color .7s ease;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--sidebar.visible { transform:none !important; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--sidebar.afhub-chat--fullscreen {' +
        'transition:' +
          'transform .28s cubic-bezier(.34,1.2,.64,1),' +
          'opacity .28s,' +
          'width 1.05s cubic-bezier(.19,.72,.28,1),' +
          'max-width 1.05s cubic-bezier(.19,.72,.28,1),' +
          'border-radius 1.05s cubic-bezier(.19,.72,.28,1),' +
          'left 1.05s cubic-bezier(.19,.72,.28,1),' +
          'right 1.05s cubic-bezier(.19,.72,.28,1),' +
          'background .85s ease,' +
          'box-shadow .85s ease,' +
          'border-color .85s ease;' +
      '}' +
      /* Pantalla completa: modo zen — accesos a la izquierda, chat sereno a la derecha */
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen {' +
        'display:grid !important;' +
        'grid-template-columns:minmax(0,1fr);' +
        'grid-template-rows:auto minmax(0,1fr) auto auto auto auto auto;' +
        'grid-template-areas:' +
          '"header"' +
          '"messages"' +
          '"flow"' +
          '"attach"' +
          '"input"' +
          '"policy"' +
          '"powered";' +
        'background:' + shellBg + ';' +
        'box-shadow:none;border:none;' +
      '}' +
      '@keyframes afhubCurtainReveal {' +
        'from{opacity:0;transform:translateY(10px);}' +
        'to{opacity:1;transform:none;}' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen::before { display:none; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-messages-shell,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-wrap,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-input-area,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-flow-options,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-powered,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-policy {' +
        'animation:afhubCurtainReveal .75s cubic-bezier(.22,.61,.36,1) .28s both;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen.afhub-chat--has-shortcuts {' +
        'grid-template-columns:minmax(232px,280px) minmax(0,1fr);' +
        'grid-template-areas:' +
          '"header header"' +
          '"side messages"' +
          '"side flow"' +
          '"side attach"' +
          '"side input"' +
          '"side policy"' +
          '"side powered";' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-header {' +
        'grid-area:header;padding:10px 26px;' +
        'background:' + chatSurfaceBg + ';' +
        'box-shadow:none;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-messages-shell {' +
        'grid-area:messages;min-height:0;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-messages {' +
        'gap:26px;' +
        'font-size:14.5px;line-height:1.58;' +
        'padding:36px max(32px,calc((100% - 640px) / 2)) 28px;' +
        'align-items:stretch;box-sizing:border-box;background:transparent;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-flow-options {' +
        'grid-area:flow;justify-content:stretch;background:transparent;border-top:none;' +
        'padding:8px max(28px,calc((100% - 640px) / 2)) 4px;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-attach-preview {' +
        'grid-area:attach;padding-left:max(28px,calc((100% - 640px) / 2));padding-right:max(28px,calc((100% - 640px) / 2));' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-input-area {' +
        'grid-area:input;justify-content:stretch;' +
        'padding:10px max(28px,calc((100% - 620px) / 2)) 14px;' +
        'border-top:none;background:transparent;' +
        '-webkit-backdrop-filter:none;backdrop-filter:none;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-input-composer {' +
        'max-width:none;width:100%;flex:1 1 auto;' +
        'background:#ffffff;border:none;' +
        'border-radius:999px;padding:2px;' +
        'overflow:hidden;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-input-composer:focus-within {' +
        'background:#ffffff;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-input-composer-inner {' +
        'padding:5px 8px 5px 6px;border:1px solid rgba(0,0,0,.06);box-shadow:' + composerInnerShadow + ';' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-policy {' +
        'grid-area:policy;padding-left:max(28px,calc((100% - 640px) / 2));padding-right:max(28px,calc((100% - 640px) / 2));' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-powered {' +
        'grid-area:powered;padding-left:max(28px,calc((100% - 640px) / 2));padding-right:max(28px,calc((100% - 640px) / 2));padding-bottom:8px;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-action-bar { grid-area:input; align-self:start; background:transparent; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-wrap {' +
        'grid-area:side;' +
        'display:flex;flex-direction:column;' +
        'min-height:0;height:100%;' +
        'border-top:none;border-right:1px solid rgba(0,0,0,.06);' +
        'background:' + shortcutsSidebarBg + ';' +
        'padding:0;box-shadow:inset -1px 0 0 rgba(255,255,255,.35);' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-toggle {' +
        'padding:22px 20px 12px;flex-shrink:0;cursor:default;pointer-events:none;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-toggle-label {' +
        'font-size:10.5px;letter-spacing:.12em;opacity:.75;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-toggle-chevron { display:none; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts {' +
        'display:flex !important;flex-direction:column;gap:10px;' +
        'padding:4px 16px 22px;flex:1 1 auto;min-height:0;' +
        'max-height:none;overflow-y:auto;scrollbar-width:none;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcut-pill {' +
        'padding:13px 14px;border-radius:14px;align-items:flex-start;' +
        'background:' + msgBubbleBg + ';border:' + msgBubbleBorder + ';' +
        'box-shadow:' + msgBubbleShadow + ';' +
        'font-size:12.5px;line-height:1.5;color:' + fsBotMsgColor + ';' +
        'transition:background .2s ease,border-color .2s ease,transform .18s ease;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcut-pill:hover {' +
        'border-color:' + cfg.color + '40;transform:none;' +
        'box-shadow:' + msgBubbleShadow + ', 0 4px 14px rgba(15,23,42,.08);' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-pill-icon { font-size:14px; opacity:.85; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-pill-arrow { opacity:.45; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg-row,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg-row--bot,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-human-wrap,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-date-divider {' +
        'width:100%;max-width:100%;align-self:stretch;box-sizing:border-box;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg-stack {' +
        'max-width:calc(100% - 36px);flex:1 1 auto;min-width:0;gap:7px;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg {' +
        'max-width:100%;padding:15px 19px;border-radius:20px;' +
        'font-size:14.5px;line-height:1.58;box-sizing:border-box;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg.user {' +
        'width:fit-content;max-width:min(420px,88%);' +
        'align-self:flex-end;margin-left:auto;' +
        'border-radius:20px 20px 6px 20px;' +
        'background:' + userBubbleBg + ';border:' + userBubbleBorder + ';' +
        'box-shadow:' + userBubbleShadow + ';' +
        '-webkit-backdrop-filter:none;backdrop-filter:none;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg.bot,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg-row--bot .afhub-msg {' +
        'max-width:100%;width:fit-content;' +
        'border-radius:20px 20px 20px 6px;' +
        'background:' + msgBubbleBg + ';border:' + msgBubbleBorder + ';' +
        'box-shadow:' + msgBubbleShadow + ';' +
        '-webkit-backdrop-filter:none;backdrop-filter:none;' +
        'color:' + fsBotMsgColor + ';' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg-avatar {' +
        'box-shadow:none;border-color:rgba(15,23,42,.06);' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg-time { opacity:.6; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-date-divider { text-align:center; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-date-divider span {' +
        'background:#ffffff;border:1px solid rgba(0,0,0,.06);box-shadow:none;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg.afhub-fb-card,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg.afhub-fb-offer {' +
        'max-width:min(460px,100%);width:min(460px,100%);align-self:center;margin-left:auto;margin-right:auto;' +
        'padding:20px 22px;border-radius:18px;' +
        'border:' + msgBubbleBorder + ';' +
        'box-shadow:' + msgBubbleShadow + ';background:' + msgBubbleBg + ';' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-fb-actions { justify-content:flex-start; margin-top:12px; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-fb-submit {' +
        'flex:0 0 auto;min-width:128px;padding:11px 22px;border-radius:12px;' +
        'box-shadow:0 6px 18px ' + cfg.color + '2e;' +
      '}' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-btn,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-overlay { display:none !important; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-handoff-overlay,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-ticket-overlay,' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-scrim-local {' +
        'grid-column:1 / -1;grid-row:1 / -1;z-index:30;' +
      '}' +
      '@media (max-width:820px){' +
        '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen.afhub-chat--has-shortcuts {' +
          'grid-template-columns:minmax(0,1fr);' +
          'grid-template-areas:' +
            '"header"' +
            '"side"' +
            '"messages"' +
            '"flow"' +
            '"attach"' +
            '"input"' +
            '"policy"' +
            '"powered";' +
        '}' +
        '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts-wrap {' +
          'max-height:160px;border-right:none;border-bottom:1px solid rgba(15,23,42,.08);' +
        '}' +
        '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-shortcuts { max-height:120px; }' +
      '}' +
      '#' + rootId + '-scrim,.afhub-scrim { display:none; position:fixed; inset:0; background:rgba(15,23,42,.28); z-index:9; backdrop-filter:blur(3px); opacity:0; transition:opacity .72s cubic-bezier(.22,.61,.36,1); }' +
      '#' +
        rootId +
        ' .afhub-header { padding:14px 18px 12px; color:#0f172a; display:flex; align-items:center; gap:12px; flex-shrink:0; background:' + chatSurfaceBg + '; position:relative; box-shadow:none; }' +
      '#' + rootId + ' .afhub-header::before { display:none; }' +
      '#' + rootId + ' .afhub-header > * { position:relative; z-index:1; }' +
      '#' + rootId + ' .afhub-avatar { width:40px; height:40px; border-radius:50%; background:transparent; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; border:none; box-shadow:none; }' +
      '#' + rootId + ' .afhub-avatar.afhub-avatar--silhouette { width:40px; height:40px; border-radius:50%; background:transparent; overflow:hidden; border:none; box-shadow:none; }' +
      '#' + rootId + ' .afhub-avatar img { width:100%; height:100%; object-fit:cover; }' +
      '#' + rootId + ' .afhub-avatar.afhub-avatar--silhouette img { object-fit:contain; object-position:center center; filter:drop-shadow(0 2px 5px rgba(15,23,42,.12)); }' +
      '#' + rootId + ' .afhub-avatar.afhub-avatar--vector { background:transparent; box-shadow:none; overflow:visible; }' +
      '#' + rootId + ' .afhub-avatar.afhub-avatar--vector img { object-fit:contain; object-position:center center; padding:0; width:110%; height:110%; filter:drop-shadow(0 2px 5px rgba(15,23,42,.12)); border-radius:0; }' +
      '#' + rootId + ' .afhub-avatar svg { width:18px; height:18px; opacity:.92; color:#64748b; }' +
      '#' + rootId + ' .afhub-header-info { flex:1; min-width:0; }' +
      '#' + rootId + ' .afhub-header-info h3 { font-size:15px; font-weight:700; letter-spacing:-.025em; line-height:1.25; color:#111111; }' +
      '#' + rootId + ' .afhub-header-status { display:flex; align-items:center; gap:5px; font-size:10.5px; font-weight:500; letter-spacing:-.005em; text-transform:none; opacity:.78; margin-top:2px; line-height:1.2; color:#737373; }' +
      '#' + rootId + ' .afhub-status-dot { width:6px; height:6px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 1px rgba(34,197,94,.28); flex-shrink:0; animation:none; }' +
      '#' + rootId + ' .afhub-header-actions { display:flex; align-items:center; gap:2px; flex-shrink:0; margin-left:auto; }' +
      '#' + rootId + ' .afhub-header-icon-btn { flex-shrink:0; width:28px; height:28px; min-width:28px; min-height:28px; background:transparent; border:none; color:#64748b; cursor:pointer; padding:0; border-radius:8px; opacity:1; display:inline-flex; align-items:center; justify-content:center; line-height:0; transition:background .14s ' + macSpring + ',color .14s; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none; }' +
      '#' + rootId + ' .afhub-header-icon-btn:hover { background:rgba(15,23,42,.06); color:#0f172a; transform:none; box-shadow:none; }' +
      '#' + rootId + ' .afhub-header-icon-btn:active { background:rgba(15,23,42,.1); color:#0f172a; }' +
      '#' + rootId + ' .afhub-header-icon-btn:disabled { opacity:.38; cursor:default; pointer-events:none; }' +
      '#' + rootId + ' .afhub-header-icon-btn svg { width:15px; height:15px; stroke-width:2.25; }' +
      '#' + rootId + ' .afhub-header-speaker--active { background:' + b12 + ' !important; color:' + cfg.color + ' !important; }' +
      '#' + rootId + ' .afhub-settings-wrap { position:relative; flex-shrink:0; display:inline-flex; z-index:2; }' +
      '#' + rootId + ' .afhub-settings-menu { position:absolute; top:calc(100% + 6px); right:0; min-width:220px; background:#ffffff; border:1px solid rgba(0,0,0,.08); border-radius:10px; box-shadow:0 16px 48px rgba(0,0,0,.12),0 4px 12px rgba(0,0,0,.06); padding:5px; z-index:100; }' +
      '#' + rootId + ' .afhub-settings-item { display:flex; align-items:center; gap:8px; width:100%; padding:7px 10px; background:transparent; border:none; border-radius:6px; color:#1c1c1e; font-size:13px; font-weight:400; letter-spacing:-.01em; cursor:pointer; text-align:left; min-height:28px; font-family:inherit; }' +
      '#' + rootId + ' .afhub-settings-item:hover { background:rgba(0,122,255,.12); color:#007aff; }' +
      '#' + rootId + ' .afhub-settings-item svg { width:16px; height:16px; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-settings-clear { color:#dc2626; }' +
      '#' + rootId + ' .afhub-settings-clear:hover { background:rgba(220,38,38,.08); }' +
      '#' + rootId + ' .afhub-history-search { flex:none; padding:8px 12px 0; background:transparent; z-index:3; }' +
      '#' + rootId + ' .afhub-history-search[hidden] { display:none !important; }' +
      '#' + rootId + ' .afhub-history-search-inner { display:flex; align-items:center; gap:8px; padding:6px 8px 6px 10px; border-radius:12px; background:rgba(255,255,255,.78); border:1px solid rgba(0,0,0,.08); box-shadow:0 1px 4px rgba(15,23,42,.04); }' +
      '#' + rootId + ' .afhub-history-search-input { flex:1; min-width:0; border:none; outline:none; background:transparent; font:inherit; font-size:13px; color:#111; }' +
      '#' + rootId + ' .afhub-history-search-meta { flex:none; font-size:10px; font-weight:600; color:#94a3b8; white-space:nowrap; max-width:88px; overflow:hidden; text-overflow:ellipsis; }' +
      '#' + rootId + ' .afhub-history-search-close { flex:none; width:26px; height:26px; border:none; border-radius:8px; background:transparent; color:#64748b; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }' +
      '#' + rootId + ' .afhub-history-search-close:hover { background:rgba(0,0,0,.06); color:#111; }' +
      '#' + rootId + ' .afhub-history-search-close svg { width:14px; height:14px; }' +
      '#' + rootId + ' .afhub-msg.afhub-msg--search-dim { opacity:.34; }' +
      '#' + rootId + ' .afhub-msg.afhub-msg--search-hit { outline:2px solid ' + colorRgba(cfg.color, 0.55) + '; outline-offset:2px; }' +
      '#' + rootId + ' .afhub-close-btn { margin-left:0; }' +
      '#' + rootId + ' .afhub-messages-shell { flex:1 1 0; min-height:0; position:relative; display:flex; flex-direction:column; overflow:hidden; z-index:1; }' +
      '#' + rootId + ' .afhub-scroll-halo { position:absolute; left:0; right:0; height:' + widgetScrollHaloHeight + 'px; pointer-events:none; z-index:12; opacity:0; transition:opacity .28s ease; }' +
      '#' + rootId + ' .afhub-scroll-halo--top { top:0; background:' + widgetScrollHaloGradient + '; }' +
      '#' + rootId + ' .afhub-scroll-halo--bottom { bottom:0; background:' + widgetScrollHaloGradientBottom + '; }' +
      '#' + rootId + ' .afhub-chat--scroll-top .afhub-scroll-halo--top { opacity:1; }' +
      '#' + rootId + ' .afhub-chat--scroll-bottom .afhub-scroll-halo--bottom { opacity:1; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-scroll-halo { display:none !important; opacity:0 !important; }' +
      '#' + rootId + ' .afhub-messages { flex:1 1 0; min-height:0; overflow-y:auto; padding:' + messagesPadTop + 'px 18px 18px; display:flex; flex-direction:column; gap:22px; scroll-behavior:smooth; background:transparent; font-size:14.5px; line-height:1.58; letter-spacing:-.012em; scrollbar-width:thin; scrollbar-color:rgba(0,0,0,.12) transparent; position:relative; box-shadow:none; }' +
      '#' + rootId + ' .afhub-messages::-webkit-scrollbar { width:5px; }' +
      '#' + rootId + ' .afhub-messages::-webkit-scrollbar-thumb { background:rgba(15,23,42,.14); border-radius:999px; }' +
      '#' + rootId + ' .afhub-msg-row { display:flex; gap:12px; align-items:flex-end; max-width:100%; width:100%; margin:0; }' +
      '#' + rootId + ' .afhub-msg-row--bot { align-self:flex-start; }' +
      '#' + rootId + ' .afhub-msg-stack { display:flex; flex-direction:column; gap:7px; min-width:0; max-width:calc(100% - 40px); flex:1; }' +
      '#' + rootId + ' .afhub-msg-row--bot .afhub-msg { max-width:100%; }' +
      '#' + rootId + ' .afhub-msg-avatar { width:32px; height:32px; border-radius:50%; flex-shrink:0; background:transparent; border:none; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:4px; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none; }' +
      '#' + rootId + ' .afhub-msg-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }' +
      '#' + rootId + ' .afhub-msg-avatar.afhub-msg-avatar--silhouette img { object-fit:contain; object-position:center center; filter:drop-shadow(0 1px 4px rgba(15,23,42,.1)); }' +
      '#' + rootId + ' .afhub-msg-avatar.afhub-msg-avatar--vector { background:transparent; box-shadow:none; overflow:visible; -webkit-backdrop-filter:none; backdrop-filter:none; }' +
      '#' + rootId + ' .afhub-msg-avatar.afhub-msg-avatar--vector img { object-fit:contain; width:110%; height:110%; padding:0; filter:drop-shadow(0 1px 4px rgba(15,23,42,.1)); border-radius:0; }' +
      '#' + rootId + ' .afhub-msg-avatar svg { width:14px; height:14px; color:#64748b; }' +
      '#' + rootId + ' .afhub-date-divider { align-self:center; text-align:center; margin:14px 0 10px; width:100%; }' +
      '#' + rootId + ' .afhub-date-divider span { display:inline-block; font-size:10px; font-weight:600; letter-spacing:.03em; text-transform:capitalize; color:#94a3b8; background:rgba(255,255,255,.42); padding:4px 11px; border-radius:999px; border:none; box-shadow:0 1px 4px rgba(15,23,42,.04); }' +
      '#' + rootId + ' .afhub-msg { max-width:86%; padding:13px 17px; border-radius:20px; font-size:14.5px; line-height:1.58; letter-spacing:-.012em; word-wrap:break-word; animation:afhub-msg-fade-in .28s ' + macSpring + ' both; position:relative; -webkit-backdrop-filter:none; backdrop-filter:none; }' +
      '#' + rootId + ' .afhub-msg--streaming { animation:none !important; opacity:1 !important; transform:none !important; }' +
      '#' + rootId + ' .afhub-msg.user { white-space:pre-wrap; background:' + userBubbleBg + '; color:' + userBubbleColor + '; align-self:flex-end; border-radius:20px 20px 6px 20px; border:' + userBubbleBorder + '; box-shadow:' + userBubbleShadow + '; }' +
      '#' + rootId + ' .afhub-msg-rich { white-space:normal; }' +
      '#' + rootId + ' .afhub-msg--streaming .afhub-msg-text::after { content:""; display:inline-block; width:2px; height:.95em; margin-left:2px; vertical-align:text-bottom; background:currentColor; opacity:.45; animation:afhub-stream-cursor 1.05s step-end infinite; }' +
      '#' + rootId + ' .afhub-msg.bot { background:' + msgBubbleBg + '; color:#111111; align-self:flex-start; border-radius:20px 20px 20px 6px; border:' + msgBubbleBorder + '; box-shadow:' + msgBubbleShadow + '; }' +
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
      '#' + rootId + ' .afhub-msg-rich .afhub-p { margin:0 0 .75em; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-p:last-child { margin-bottom:0; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-ul { margin:.35em 0 .55em; padding-left:1.15em; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-ul li { margin:.2em 0; }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-pre { margin:.5em 0; padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.45; overflow-x:auto; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:rgba(0,0,0,.06); border:1px solid rgba(0,0,0,.06); }' +
      '#' + rootId + ' .afhub-msg-rich .afhub-code { font-size:.9em; padding:2px 6px; border-radius:5px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:rgba(0,0,0,.07); }' +
      '#' + rootId + ' .afhub-msg-rich strong { font-weight:600; }' +
      '#' + rootId + ' .afhub-msg-rich em { font-style:italic; opacity:.95; }' +
      '#' + rootId + ' .afhub-msg-link { color:' + cfg.color + '; text-decoration:underline; word-break:break-all; }' +
      '#' + rootId + ' .afhub-msg-link:hover { filter:brightness(0.92); }' +
      '#' + rootId + ' .afhub-msg.user .afhub-msg-link { color:' + cfg.color + '; }' +
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
      '#' + rootId + ' .afhub-msg.bot.afhub-thinking-card { background:transparent !important; border:none !important; box-shadow:none !important; border-radius:14px !important; padding:1px !important; width:212px !important; max-width:100% !important; flex:none !important; align-self:flex-start !important; overflow:visible !important; clip-path:none !important; -webkit-clip-path:none !important; }' +
      '#' + rootId + ' .afhub-thinking-card { display:flex; flex-direction:column; align-items:stretch; justify-content:center; gap:0; padding:1px; width:212px; max-width:100%; min-width:0; flex:none; align-self:flex-start; border-radius:14px; border:none; background:transparent; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none; animation:afhub-thinking-in .28s ease-out; position:relative; isolation:isolate; overflow:visible; contain:none; clip-path:none; -webkit-clip-path:none; transition:opacity .22s ease; box-sizing:border-box; }' +
      '#' + rootId + ' .afhub-thinking-card.afhub-thinking-card--pulse { animation:afhub-thinking-caption-pulse .22s ease; }' +
      '#' + rootId + ' .afhub-thinking-card::before { content:""; position:absolute; inset:-1px; border-radius:inherit; pointer-events:none; z-index:0; opacity:var(--afhub-beam-glow,.22); filter:blur(4px) saturate(1.1); background:' + rainbowBeamVivid + '; animation:afhub-border-beam-spin var(--afhub-beam-speed-msg,6s) linear infinite; will-change:--afhub-beam-angle; }' +
      '#' + rootId + ' .afhub-thinking-beam-ring { position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:1; opacity:calc(var(--afhub-beam-intensity,1) * .72); box-sizing:border-box; padding:1px; overflow:hidden; -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; }' +
      '#' + rootId + ' .afhub-thinking-beam-spin { position:absolute; inset:0; border-radius:inherit; background:' + rainbowBeamVivid + '; filter:saturate(1.15) brightness(1.02); animation:afhub-border-beam-spin var(--afhub-beam-speed-msg,6s) linear infinite; will-change:--afhub-beam-angle; }' +
      '#' + rootId + '.afhub-ai-beam-scope-off .afhub-input-beam-ring,' +
      '#' + rootId + '.afhub-ai-beam-scope-off .afhub-thinking-beam-ring,' +
      '#' + rootId + '.afhub-ai-beam-scope-off .afhub-thinking-card::before { display:none !important; }' +
      '#' + rootId + '.afhub-ai-beam-scope-input .afhub-thinking-beam-ring,' +
      '#' + rootId + '.afhub-ai-beam-scope-input .afhub-thinking-card::before { display:none !important; }' +
      '#' + rootId + '.afhub-ai-beam-scope-messages .afhub-input-beam-ring { display:none !important; }' +
      '#' + rootId + ' .afhub-msg-row--typing .afhub-msg-stack { flex:0 1 auto; min-width:0; width:auto; max-width:100%; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg-row--typing .afhub-msg-stack { flex:0 1 auto; width:auto; max-width:100%; }' +
      '#' + rootId + ' .afhub-chat.afhub-chat--fullscreen .afhub-msg.bot.afhub-thinking-card { width:212px !important; max-width:100% !important; }' +
      '#' + rootId + ' .afhub-thinking-inner { position:relative; z-index:2; display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; gap:4px; padding:10px 12px; border-radius:13px; background:' + msgBubbleBg + '; border:' + msgBubbleBorder + '; box-shadow:' + msgBubbleShadow + '; min-width:0; width:100%; min-height:62px; box-sizing:border-box; overflow:visible; }' +
      '#' + rootId + ' .afhub-thinking-body { display:flex; flex-direction:column; gap:4px; min-width:0; }' +
      '#' + rootId + ' .afhub-thinking-row { display:flex; align-items:center; gap:8px; min-width:0; overflow:visible; }' +
      '#' + rootId + ' .afhub-thinking-glyph { flex:none; width:22px; height:22px; display:flex; align-items:center; justify-content:center; perspective:64px; overflow:visible; transform-style:preserve-3d; }' +
      '#' + rootId + ' .afhub-thinking-cube { width:17px; height:17px; position:relative; transform-style:preserve-3d; transform:rotateX(-26deg) rotateY(38deg); animation:afhub-rk-tumble 5.2s linear infinite; }' +
      '#' + rootId + ' .afhub-rk-spin { position:absolute; left:0; top:0; width:17px; height:17px; transform-style:preserve-3d; transform-origin:50% 50%; }' +
      '#' + rootId + ' .afhub-rk-cubie { position:absolute; left:50%; top:50%; width:4.9px; height:4.9px; margin:-2.45px 0 0 -2.45px; transform-style:preserve-3d; }' +
      '#' + rootId + ' .afhub-rk-tile { position:absolute; inset:0; box-sizing:border-box; background:#1a1a1e; border-radius:0.35px; backface-visibility:hidden; -webkit-backface-visibility:hidden; }' +
      '#' + rootId + ' .afhub-rk-sticker { position:absolute; inset:0.28px; border-radius:0.4px; box-shadow:inset 0 0.4px 0 rgba(255,255,255,.42), inset 0 -0.25px 0 rgba(0,0,0,.2); }' +
      '#' + rootId + ' .afhub-rk-tile--front { transform:rotateY(0deg) translateZ(2.48px); }' +
      '#' + rootId + ' .afhub-rk-tile--back { transform:rotateY(180deg) translateZ(2.48px); }' +
      '#' + rootId + ' .afhub-rk-tile--right { transform:rotateY(90deg) translateZ(2.48px); }' +
      '#' + rootId + ' .afhub-rk-tile--left { transform:rotateY(-90deg) translateZ(2.48px); }' +
      '#' + rootId + ' .afhub-rk-tile--top { transform:rotateX(90deg) translateZ(2.48px); }' +
      '#' + rootId + ' .afhub-rk-tile--bottom { transform:rotateX(-90deg) translateZ(2.48px); }' +
      '#' + rootId + ' .afhub-rk-tile--inner { background:#1a1a1e; }' +
      '#' + rootId + ' .afhub-rk-tile--w .afhub-rk-sticker { background:linear-gradient(160deg,rgba(255,255,255,.65) 0%,transparent 45%),#fff; }' +
      '#' + rootId + ' .afhub-rk-tile--y .afhub-rk-sticker { background:linear-gradient(160deg,rgba(255,255,255,.4) 0%,transparent 45%),#ffe600; }' +
      '#' + rootId + ' .afhub-rk-tile--r .afhub-rk-sticker { background:linear-gradient(160deg,rgba(255,255,255,.32) 0%,transparent 45%),#ff2b45; }' +
      '#' + rootId + ' .afhub-rk-tile--o .afhub-rk-sticker { background:linear-gradient(160deg,rgba(255,255,255,.32) 0%,transparent 45%),#ff8f1a; }' +
      '#' + rootId + ' .afhub-rk-tile--b .afhub-rk-sticker { background:linear-gradient(160deg,rgba(255,255,255,.32) 0%,transparent 45%),#2b7bff; }' +
      '#' + rootId + ' .afhub-rk-tile--g .afhub-rk-sticker { background:linear-gradient(160deg,rgba(255,255,255,.32) 0%,transparent 45%),#12c96a; }' +
      '#' + rootId + ' .afhub-thinking-glyph { color:' +
        (isHexColor(cfg.color) ? cfg.color : '#6366f1') +
        '; }' +
      '#' + rootId + ' .afhub-ic-crystal{width:18px;height:18px;display:grid;place-items:center;perspective:48px;}' +
      '#' + rootId + ' .afhub-ic-crystal__core{position:relative;width:12px;height:16px;transform-style:preserve-3d;animation:afhub-ic-crystal-spin 4.8s linear infinite;}' +
      '#' + rootId + ' .afhub-ic-crystal__facet{position:absolute;inset:0;clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);opacity:.92;}' +
      '#' + rootId + ' .afhub-ic-crystal__facet--n{background:linear-gradient(160deg,#fff 0%,currentColor 55%,#222 100%);transform:translateZ(2px);}' +
      '#' + rootId + ' .afhub-ic-crystal__facet--e{background:linear-gradient(220deg,#ccc,currentColor);transform:rotateY(90deg) translateZ(2px);opacity:.75;}' +
      '#' + rootId + ' .afhub-ic-crystal__facet--s{background:linear-gradient(20deg,#333,currentColor);transform:rotateY(180deg) translateZ(2px);opacity:.7;}' +
      '#' + rootId + ' .afhub-ic-crystal__facet--w{background:linear-gradient(300deg,#bbb,currentColor);transform:rotateY(-90deg) translateZ(2px);opacity:.8;}' +
      '#' + rootId + ' .afhub-ic-crystal__spark{position:absolute;top:2px;left:50%;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:#fff;box-shadow:0 0 6px #fff,0 0 10px currentColor;animation:afhub-ic-crystal-glint 2.4s ease-in-out infinite;transform:translateZ(4px);}' +
      '#' + rootId + ' .afhub-ic-planet{position:relative;width:18px;height:18px;display:grid;place-items:center;transform-style:preserve-3d;animation:afhub-ic-planet-float 3.2s ease-in-out infinite;}' +
      '#' + rootId + ' .afhub-ic-planet__glow{position:absolute;inset:1px;border-radius:50%;background:radial-gradient(circle,' + colorRgba(cfg.color, 0.45) + ',transparent 70%);filter:blur(2px);}' +
      '#' + rootId + ' .afhub-ic-planet__sphere{position:relative;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#fff 0%,' + colorRgba(cfg.color, 0.7) + ' 22%,currentColor 58%,#0a0a0c 100%);box-shadow:inset -2px -1px 3px rgba(0,0,0,.35),0 0 8px ' + colorRgba(cfg.color, 0.45) + ';overflow:hidden;z-index:1;}' +
      '#' + rootId + ' .afhub-ic-planet__shine{position:absolute;top:1.5px;left:2px;width:4px;height:3px;border-radius:50%;background:rgba(255,255,255,.85);}' +
      '#' + rootId + ' .afhub-ic-planet__band{position:absolute;left:-10%;top:42%;width:120%;height:3px;background:linear-gradient(90deg,transparent,rgba(0,0,0,.35),transparent);opacity:.55;transform:rotate(-18deg);}' +
      '#' + rootId + ' .afhub-ic-planet__ring{position:absolute;width:18px;height:6px;border:1.5px solid ' + colorRgba(cfg.color, 0.85) + ';border-radius:50%;transform:rotateX(68deg) rotateZ(-18deg);box-shadow:0 0 4px ' + colorRgba(cfg.color, 0.4) + ';animation:afhub-ic-planet-ring 5s linear infinite;z-index:2;}' +
      '#' + rootId + ' .afhub-ic-orbit{position:relative;width:18px;height:18px;transform-style:preserve-3d;animation:afhub-ic-orbit-tilt 8s linear infinite;}' +
      '#' + rootId + ' .afhub-ic-orbit__core{position:absolute;inset:6.5px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,currentColor 55%,#111);box-shadow:0 0 6px currentColor;z-index:2;}' +
      '#' + rootId + ' .afhub-ic-orbit__ring{position:absolute;inset:0;border:1.2px solid ' + colorRgba(cfg.color, 0.75) + ';border-radius:50%;transform-style:preserve-3d;}' +
      '#' + rootId + ' .afhub-ic-orbit__ring--a{animation:afhub-ic-orbit-spin-a 2.8s linear infinite;}' +
      '#' + rootId + ' .afhub-ic-orbit__ring--b{transform:rotateX(70deg);animation:afhub-ic-orbit-spin-b 3.6s linear infinite reverse;}' +
      '#' + rootId + ' .afhub-ic-orbit__ring--c{transform:rotateY(70deg) rotateZ(40deg);animation:afhub-ic-orbit-spin-c 4.4s linear infinite;}' +
      '#' + rootId + ' .afhub-ic-orbit__e{position:absolute;top:-2px;left:calc(50% - 2px);width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 4px currentColor;}' +
      '#' + rootId + ' .afhub-ic-radar{position:relative;width:18px;height:18px;border-radius:50%;overflow:hidden;}' +
      '#' + rootId + ' .afhub-ic-radar__disc{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 50%,' + colorRgba(cfg.color, 0.18) + ' 0%,transparent 62%),#0f141a;box-shadow:inset 0 0 0 1px ' + colorRgba(cfg.color, 0.35) + ';}' +
      '#' + rootId + ' .afhub-ic-radar__grid{position:absolute;inset:0;background:linear-gradient(' + colorRgba(cfg.color, 0.22) + ' 1px,transparent 1px),linear-gradient(90deg,' + colorRgba(cfg.color, 0.22) + ' 1px,transparent 1px);background-size:50% 50%;background-position:center;opacity:.35;border-radius:50%;}' +
      '#' + rootId + ' .afhub-ic-radar__ring{position:absolute;inset:2px;border:1px solid ' + colorRgba(cfg.color, 0.45) + ';border-radius:50%;}' +
      '#' + rootId + ' .afhub-ic-radar__ring--mid{inset:5px;opacity:.7;}' +
      '#' + rootId + ' .afhub-ic-radar__cross{position:absolute;inset:0;background:linear-gradient(currentColor,currentColor) center/100% 1px no-repeat,linear-gradient(currentColor,currentColor) center/1px 100% no-repeat;opacity:.28;}' +
      '#' + rootId + ' .afhub-ic-radar__sweep{position:absolute;inset:0;background:conic-gradient(from 0deg,transparent 0deg,' + colorRgba(cfg.color, 0.55) + ' 50deg,transparent 70deg);animation:afhub-ic-radar-sweep 2.4s linear infinite;border-radius:50%;}' +
      '#' + rootId + ' .afhub-ic-radar__blip{position:absolute;top:3px;right:4px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 5px currentColor;animation:afhub-ic-radar-blip 2.4s ease-in-out infinite;}' +
      '#' + rootId + ' .afhub-thinking-head,' +
      '#' + rootId + ' .afhub-thinking-pulse,' +
      '#' + rootId + ' .afhub-thinking-titles,' +
      '#' + rootId + ' .afhub-thinking-title,' +
      '#' + rootId + ' .afhub-thinking-skeleton,' +
      '#' + rootId + ' .afhub-skel-line,' +
      '#' + rootId + ' .afhub-skel-line--lg,' +
      '#' + rootId + ' .afhub-skel-line--md,' +
      '#' + rootId + ' .afhub-skel-line--sm,' +
      '#' + rootId + ' .afhub-thinking-dots { display:none !important; }' +
      '#' + rootId + ' .afhub-thinking-caption { display:block; margin:0; flex:1; min-width:0; font-size:13px; font-weight:600; letter-spacing:-.015em; color:#1c1c1e; text-align:left; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:opacity .2s ease; text-decoration:none; border:none; background:transparent; -webkit-text-fill-color:currentColor; -webkit-background-clip:border-box; background-clip:border-box; user-select:none; -webkit-user-select:none; }' +
      '#' + rootId + ' .afhub-thinking-sub { display:-webkit-box; margin:0; font-size:11px; font-weight:400; letter-spacing:.01em; color:#9ca3af; line-height:1.35; white-space:normal; overflow:hidden; -webkit-line-clamp:2; -webkit-box-orient:vertical; transition:opacity .2s ease; text-decoration:none; border:none; background:transparent; -webkit-text-fill-color:currentColor; -webkit-background-clip:border-box; background-clip:border-box; user-select:none; -webkit-user-select:none; }' +
      '#' + rootId + ' .afhub-thinking-footer { display:flex; align-items:center; min-height:14px; height:14px; padding-top:0; border-top:none; overflow:hidden; }' +
      '#' + rootId + ' .afhub-thinking-state { display:block; min-width:0; max-width:100%; font-size:11px; font-weight:500; letter-spacing:.02em; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.72; background:linear-gradient(90deg,#9ca3af 0%,#cbd5e1 42%,#9ca3af 84%); background-size:220% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; animation:afhub-thinking-shimmer 2.4s ease-in-out infinite; }' +
      '#' + rootId + ' .afhub-thinking-meta { display:none; }' +
      '#' + rootId + ' .afhub-thinking-elapsed { display:none; font-size:10px; font-weight:600; letter-spacing:.03em; color:#9ca3af; font-variant-numeric:tabular-nums; }' +
      '#' + rootId + '.afhub-widget--debug .afhub-thinking-card { border-radius:14px; padding:1.5px; width:212px; max-width:100%; min-width:0; clip-path:none; -webkit-clip-path:none; }' +
      '#' + rootId + '.afhub-widget--debug .afhub-thinking-inner { border-radius:13px; padding:10px 12px; gap:4px; min-height:62px; }' +
      '#' + rootId + '.afhub-widget--debug .afhub-thinking-caption,' +
      '#' + rootId + '.afhub-widget--debug .afhub-thinking-sub { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }' +
      '#' + rootId + '.afhub-widget--debug .afhub-thinking-meta { display:flex; justify-content:flex-start; min-height:14px; }' +
      '#' + rootId + '.afhub-widget--debug .afhub-thinking-elapsed { display:inline; margin-left:auto; -webkit-text-fill-color:#9ca3af; background:none; animation:none; }' +
      '#' + rootId + ' .afhub-multi-agent-tag { display:inline-flex; align-items:center; margin-bottom:8px; font-size:10px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; padding:3px 8px; border-radius:999px; color:' + cfg.color + '; background:' + cfg.color + '14; border:1px solid ' + cfg.color + '33; }' +
      '#' + rootId + ' .afhub-feedback-row { align-self:stretch; display:flex; gap:0; margin:0; align-items:center; max-width:100%; width:100%; padding-left:2px; }' +
      '#' + rootId + ' .afhub-feedback-btn { width:24px; height:24px; border-radius:999px; border:none; background:transparent; color:#6b7280; font-size:12px; line-height:1; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:background .12s ease,color .12s ease; padding:0; }' +
      '#' + rootId + ' .afhub-feedback-btn:hover { background:rgba(0,0,0,.06); color:#111827; }' +
      '#' + rootId + ' .afhub-feedback-btn[data-value="up"].active { color:#16a34a; background:rgba(34,197,94,.12); }' +
      '#' + rootId + ' .afhub-feedback-btn[data-value="down"].active { color:#dc2626; background:rgba(239,68,68,.12); }' +
      '#' + rootId + ' .afhub-msg-time { font-size:11px; color:#9ca3af; font-weight:500; line-height:1; white-space:nowrap; }' +
      '#' + rootId + ' .afhub-dot { width:8px; height:8px; background:#aaa; border-radius:50%; animation:afhub-bounce .6s infinite alternate; }' +
      '#' + rootId + ' .afhub-dot:nth-child(2) { animation-delay:.2s; }' +
      '#' + rootId + ' .afhub-dot:nth-child(3) { animation-delay:.4s; }' +
      '#' + rootId + ' .afhub-powered { text-align:center; font-size:8px; letter-spacing:.1em; text-transform:uppercase; color:#b8bcc4; padding:4px 0 8px; flex-shrink:0; font-weight:600; background:' + chatSurfaceBg + '; }' +
      '#' + rootId + ' .afhub-powered a { color:#9aa0ac; text-decoration:none; font-weight:700; }' +
      '#' + rootId + ' .afhub-powered a:hover { text-decoration:underline; }' +
      '#' + rootId + ' .afhub-persona-offer { align-self:flex-start; max-width:92%; padding:10px 14px; border-radius:12px; border:1px solid rgba(0,0,0,.08); background:rgba(0,0,0,.03); font-size:13px; line-height:1.45; }' +
      '#' + rootId + ' .afhub-persona-offer-inner { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }' +
      '#' + rootId + ' .afhub-persona-offer-hint { color:#5a5a6e; font-size:13px; }' +
      '#' + rootId + ' .afhub-persona-tag { display:inline-flex; align-items:center; justify-content:center; padding:4px 11px; border-radius:999px; font-size:11px; font-weight:700; letter-spacing:.03em; text-decoration:none; border:1px solid rgba(0,0,0,.1); background:rgba(0,0,0,.03); color:' + cfg.color + '; cursor:pointer; font-family:inherit; transition:background .15s; }' +
      '#' + rootId + ' .afhub-persona-tag:hover { background:rgba(0,0,0,.07); }' +
      '#' + rootId + ' .afhub-handoff-bar { flex-shrink:0; padding:6px 12px 4px; border-top:none; background:' + chatSurfaceBg + '; }' +
      '#' + rootId + ' .afhub-handoff-bar--disabled { opacity:.5; pointer-events:none; }' +
      '#' + rootId + ' .afhub-handoff-btn { width:100%; padding:8px 12px; border-radius:10px; border:1px solid ' + cfg.color + '44; background:' + cfg.color + '0c; color:' + cfg.color + '; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }' +
      '#' + rootId + ' .afhub-handoff-btn:hover { background:' + cfg.color + '18; }' +
      '#' + rootId + ' .afhub-handoff-btn:disabled { cursor:not-allowed; opacity:.6; }' +
      // Barra de acciones compacta (chips) — "Hablar con una persona"
      '#' + rootId + ' .afhub-nav-offer { margin-top:10px; display:flex; flex-direction:column; gap:8px; }' +
      '#' + rootId + ' .afhub-nav-prompt { font-size:12px; color:#5f6368; line-height:1.35; }' +
      '#' + rootId + ' .afhub-nav-actions { display:flex; gap:8px; flex-wrap:wrap; }' +
      '#' + rootId + ' .afhub-nav-loading-overlay { display:none; position:absolute; inset:0; z-index:40; background:rgba(255,255,255,.82); -webkit-backdrop-filter:blur(5px); backdrop-filter:blur(5px); align-items:center; justify-content:center; pointer-events:auto; }' +
      '#' + rootId + ' .afhub-nav-loading-overlay.visible { display:flex; }' +
      '#' + rootId + ' .afhub-nav-loading-inner { display:flex; flex-direction:column; align-items:center; gap:10px; padding:12px 16px; }' +
      '#' + rootId + ' .afhub-nav-spinner { width:28px; height:28px; border:3px solid rgba(15,23,42,.1); border-top-color:' + cfg.color + '; border-radius:50%; animation:afhubNavSpin .72s linear infinite; }' +
      '#' + rootId + ' .afhub-nav-loading-text { font-size:12px; font-weight:600; color:#5f6368; }' +
      '@keyframes afhubNavSpin { to { transform:rotate(360deg); } }' +
      '#' + rootId + ' .afhub-action-bar { flex-shrink:0; display:flex; gap:6px; padding:4px 10px 4px; border-top:none; background:transparent; }' +
      '#' + rootId + ' .afhub-action-btn { flex:1; min-width:0; padding:7px 12px; border-radius:8px; border:none !important; background:rgba(255,255,255,.42) !important; color:' + cfg.color + ' !important; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:background .14s,box-shadow .14s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; appearance:none; -webkit-appearance:none; box-shadow:0 1px 3px rgba(15,23,42,.04); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); }' +
      '#' + rootId + ' .afhub-action-btn:hover { background:rgba(255,255,255,.58) !important; }' +
      '#' + rootId + ' .afhub-action-btn:active { background:rgba(255,255,255,.58) !important; box-shadow:inset 0 1px 2px rgba(0,0,0,.08); }' +
      '#' + rootId + ' .afhub-action-btn--ghost { border-color:#e2e4e8; color:#80868b; }' +
      '#' + rootId + ' .afhub-action-btn--ghost:hover { background:#f5f6f7; color:#5f6368; }' +
      '#' + rootId + ' .afhub-action-btn--disabled { cursor:not-allowed; opacity:.5; pointer-events:none; }' +
      // Encuesta inline (tarjeta dentro del flujo de mensajes, no popup)
      '#' + rootId + ' .afhub-msg.afhub-fb-card,' +
      '#' + rootId + ' .afhub-msg.afhub-fb-offer {' +
        'align-self:stretch;max-width:100%;width:100%;box-sizing:border-box;' +
        'background:' + msgBubbleBg + ';border:none;border-radius:16px;padding:14px 14px 12px;' +
        'box-shadow:' + msgBubbleShadow + ';' +
        '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);' +
      '}' +
      '#' + rootId + ' .afhub-fb-inner { display:flex; flex-direction:column; gap:10px; }' +
      '#' + rootId + ' .afhub-fb-title {' +
        'font-family:inherit;' +
        'font-size:13px;font-weight:700;letter-spacing:-.01em;line-height:1.3;color:#111827;margin:0;' +
      '}' +
      '#' + rootId + ' .afhub-fb-q { display:flex; flex-direction:column; gap:5px; }' +
      '#' + rootId + ' .afhub-fb-label { font-size:11.5px; font-weight:600; color:#4b5563; line-height:1.3; }' +
      '#' + rootId + ' .afhub-fb-req { color:#ef4444; font-weight:700; }' +
      '#' + rootId + ' .afhub-fb-stars { display:flex; align-items:center; gap:0; }' +
      '#' + rootId + ' .afhub-fb-star {' +
        'appearance:none;-webkit-appearance:none;background:transparent;border:none;cursor:pointer;' +
        'padding:2px 3px;margin:0;line-height:1;border-radius:6px;color:#d1d5db;' +
        'transition:color .12s ease,transform .12s ease,background .12s ease;' +
      '}' +
      '#' + rootId + ' .afhub-fb-star:hover,' +
      '#' + rootId + ' .afhub-fb-star:focus-visible { background:rgba(245,179,1,.12); outline:none; transform:scale(1.06); }' +
      '#' + rootId + ' .afhub-fb-star-icon {' +
        'font-size:20px;line-height:1;display:block;font-family:system-ui,"Apple Color Emoji","Segoe UI Symbol",sans-serif;' +
      '}' +
      '#' + rootId + ' .afhub-fb-star.is-on { color:#f5b301; }' +
      '#' + rootId + ' .afhub-fb-star.is-on .afhub-fb-star-icon {' +
        'filter:drop-shadow(0 1px 1px rgba(245,179,1,.3));' +
      '}' +
      '#' + rootId + ' .afhub-fb-choices { display:flex; flex-wrap:wrap; gap:6px; }' +
      '#' + rootId + ' .afhub-fb-choices--stack { flex-direction:column; align-items:stretch; }' +
      '#' + rootId + ' .afhub-fb-choice { cursor:pointer; margin:0; position:relative; }' +
      '#' + rootId + ' .afhub-fb-choice input { position:absolute; opacity:0; pointer-events:none; width:0; height:0; }' +
      '#' + rootId + ' .afhub-fb-choice span {' +
        'display:inline-flex;align-items:center;justify-content:center;min-width:52px;padding:5px 12px;' +
        'border-radius:999px;font-size:11.5px;font-weight:600;color:#4b5563;' +
        'background:rgba(255,255,255,.65);border:none;' +
        'transition:background .12s,border-color .12s,color .12s,box-shadow .12s;' +
      '}' +
      '#' + rootId + ' .afhub-fb-choices--stack .afhub-fb-choice span { justify-content:flex-start; border-radius:8px; min-width:0; width:100%; box-sizing:border-box; }' +
      '#' + rootId + ' .afhub-fb-choice:hover span { border-color:rgba(15,23,42,.18); background:rgba(255,255,255,.85); }' +
      '#' + rootId + ' .afhub-fb-choice input:focus-visible + span { outline:2px solid ' + cfg.color + '; outline-offset:2px; }' +
      '#' + rootId + ' .afhub-fb-choice input:checked + span {' +
        'background:' + cfg.color + ';color:#fff;border-color:transparent;' +
        'box-shadow:0 2px 8px ' + cfg.color + '33;' +
      '}' +
      '#' + rootId + ' .afhub-fb-text {' +
        'width:100%;box-sizing:border-box;border:none;border-radius:8px;' +
        'padding:7px 9px;font-size:12px;font-family:inherit;resize:vertical;min-height:48px;' +
        'background:rgba(255,255,255,.75);color:#111827;line-height:1.35;' +
        'transition:border-color .12s,box-shadow .12s;' +
      '}' +
      '#' + rootId + ' .afhub-fb-text:focus { outline:none; border-color:' + cfg.color + '; box-shadow:0 0 0 2px ' + cfg.color + '22; }' +
      '#' + rootId + ' .afhub-fb-error { display:none; color:#dc2626; font-size:11px; font-weight:600; margin:0; }' +
      '#' + rootId + ' .afhub-fb-error:not([hidden]) { display:block; }' +
      '#' + rootId + ' .afhub-fb-actions { display:flex; align-items:center; gap:8px; margin-top:0; flex-wrap:wrap; }' +
      '#' + rootId + ' .afhub-fb-submit {' +
        'flex:0 0 auto;min-width:88px;background:' + cfg.color + ';color:#fff;border:none;border-radius:8px;' +
        'padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;line-height:1.2;font-family:inherit;' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 2px 8px ' + b16 + ';' +
        'transition:filter .12s,box-shadow .12s,transform .12s;' +
      '}' +
      '#' + rootId + ' .afhub-fb-submit:hover { filter:brightness(1.05); }' +
      '#' + rootId + ' .afhub-fb-submit:active { filter:brightness(.94); transform:translateY(1px); box-shadow:inset 0 1px 2px rgba(0,0,0,.12); }' +
      '#' + rootId + ' .afhub-fb-skip {' +
        'background:none;border:none;color:#6b7280;font-size:11.5px;cursor:pointer;padding:6px 6px;' +
        'font-weight:600;font-family:inherit;border-radius:6px;transition:color .12s,background .12s;' +
      '}' +
      '#' + rootId + ' .afhub-fb-skip:hover { color:#374151; background:rgba(15,23,42,.04); }' +
      '#' + rootId + ' .afhub-fb-thanks { display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600; color:#111827; }' +
      '#' + rootId + ' .afhub-fb-check {' +
        'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;' +
        'background:#22c55e;color:#fff;font-size:12px;line-height:1;flex-shrink:0;font-weight:700;' +
      '}' +
      '#' + rootId + ' .afhub-handoff-overlay { display:none; position:absolute; inset:0; z-index:30; background:rgba(0,0,0,.45); align-items:center; justify-content:center; padding:16px; box-sizing:border-box; }' +
      '#' + rootId + ' .afhub-handoff-overlay.visible { display:flex; }' +
      '#' + rootId + ' .afhub-handoff-modal { width:100%; max-width:320px; background:rgba(255,255,255,.88); border-radius:16px; padding:20px 18px; box-shadow:0 0 0 0.5px rgba(0,0,0,.08),0 24px 64px rgba(0,0,0,.22); font-family:inherit; color:#1c1c1e; -webkit-backdrop-filter:blur(28px) saturate(180%); backdrop-filter:blur(28px) saturate(180%); }' +
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
      '#' + rootId + ' .afhub-ticket-attach-row { margin-bottom:8px; }' +
      '#' + rootId + ' .afhub-ticket-attach-btn { width:100%; padding:8px; border-radius:8px; border:1px dashed #d1d5db !important; background:#fff !important; color:#374151 !important; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; appearance:none; -webkit-appearance:none; }' +
      '#' + rootId + ' .afhub-ticket-attach-btn:hover { background:#f3f4f6 !important; border-color:#9ca3af !important; }' +
      '#' + rootId + ' .afhub-ticket-attach-btn:disabled { opacity:.5; cursor:not-allowed; }' +
      '#' + rootId + ' .afhub-ticket-thumbs { display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap; }' +
      '#' + rootId + ' .afhub-ticket-thumb { position:relative; width:44px; height:44px; border-radius:8px; overflow:hidden; border:1px solid #d1d5db; }' +
      '#' + rootId + ' .afhub-ticket-thumb img { width:100%; height:100%; object-fit:cover; display:block; }' +
      '#' + rootId + ' .afhub-ticket-thumb-remove { position:absolute; top:0; right:0; width:16px; height:16px; line-height:14px; border:none; border-radius:0 0 0 6px; background:rgba(0,0,0,.6); color:#fff; font-size:11px; cursor:pointer; padding:0; }' +
      '#' + rootId + ' .afhub-shortcuts-wrap { display:none; flex-shrink:0; border-top:none; background:' + chatSurfaceBg + '; box-shadow:none; }' +
      '#' + rootId + ' .afhub-shortcuts-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; padding:4px 14px; background:transparent; border:none; cursor:default; font-family:inherit; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-shortcuts-toggle-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; opacity:1; }' +
      '#' + rootId + ' .afhub-shortcuts { display:flex; flex-direction:column; gap:6px; padding:2px 10px 8px; flex-shrink:0; max-height:112px; overflow-y:auto; scrollbar-width:none; }' +
      '#' + rootId + ' .afhub-shortcuts::-webkit-scrollbar { display:none; }' +
      '#' + rootId + ' .afhub-shortcuts-overlay { display:none; position:absolute; inset:0; z-index:35; background:rgba(15,23,42,.42); align-items:flex-end; justify-content:center; padding:10px 12px 14px; box-sizing:border-box; -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }' +
      '#' + rootId + ' .afhub-shortcuts-overlay.visible { display:flex; }' +
      '#' + rootId + ' .afhub-shortcuts-modal { width:100%; max-height:min(62vh,420px); background:#ffffff; border-radius:16px; border:1px solid rgba(0,0,0,.08); box-shadow:0 16px 48px rgba(15,23,42,.18); display:flex; flex-direction:column; overflow:hidden; animation:afhub-shortcuts-in .24s ease-out; }' +
      '#' + rootId + ' .afhub-shortcuts-modal-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 14px 8px; border-bottom:1px solid rgba(0,0,0,.06); flex-shrink:0; }' +
      '#' + rootId + ' .afhub-shortcuts-modal-head h4 { margin:0; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; }' +
      '#' + rootId + ' .afhub-shortcuts-close { width:28px; height:28px; border:none; border-radius:8px; background:transparent; color:#64748b; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-shortcuts-close:hover { background:rgba(0,0,0,.06); color:#0f172a; }' +
      '#' + rootId + ' .afhub-shortcuts-close svg { width:16px; height:16px; stroke-width:2.25; }' +
      '#' + rootId + ' .afhub-shortcuts-modal-list { display:flex; flex-direction:column; gap:6px; padding:10px 12px 12px; overflow-y:auto; max-height:min(52vh,360px); scrollbar-width:thin; }' +
      '@keyframes afhub-shortcuts-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }' +
      '#' + rootId + ' .afhub-shortcut-pill { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid rgba(0,0,0,.06); background:#ffffff; color:#1c1c1e; font-size:13px; font-weight:500; letter-spacing:-.012em; cursor:pointer; font-family:inherit; transition:background .2s ' + macSpring + ',box-shadow .2s ' + macSpring + ',border-color .2s ' + macSpring + '; text-align:left; width:100%; box-sizing:border-box; box-shadow:none; }' +
      '#' + rootId + ' .afhub-shortcut-pill:hover { background:#ffffff; box-shadow:0 2px 8px rgba(0,0,0,.06); color:#0f172a; border-color:' + cfg.color + '40; }' +
      '#' + rootId + ' .afhub-pill-icon { font-size:15px; flex-shrink:0; width:22px; text-align:center; }' +
      '#' + rootId + ' .afhub-pill-text { flex:1; line-height:1.4; white-space:normal; overflow-wrap:break-word; word-break:break-word; min-width:0; }' +
      '#' + rootId + ' .afhub-pill-arrow { font-size:16px; color:#cbd5e1; flex-shrink:0; font-weight:400; line-height:1; }' +
      // Aviso de privacidad / política (footer del chat)
      '#' + rootId + ' .afhub-policy { text-align:center; font-size:9px; line-height:1.35; color:#9aa0ac; padding:6px 14px 2px; flex-shrink:0; background:' + chatSurfaceBg + '; }' +
      '#' + rootId + ' .afhub-policy-link { color:' + cfg.color + '; text-decoration:underline; }' +
      '#' + rootId + ' a.afhub-policy-link { cursor:pointer; }' +
      '#' + rootId + ' a.afhub-policy-link:hover { filter:brightness(0.9); }' +
      '#' + rootId + ' .afhub-input-area { padding:8px 16px 10px; border-top:none; display:flex; gap:8px; flex-shrink:0; width:100%; box-sizing:border-box; background:' + chatSurfaceBg + '; align-items:flex-end; box-shadow:none; border-radius:0; overflow:hidden; }' +
      '#' + rootId + ' .afhub-flow-options { display:none; flex-wrap:wrap; gap:6px; padding:8px 12px 4px; border-top:none; background:' + chatSurfaceBg + '; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-flow-opt-btn { flex:1 1 calc(50% - 6px); min-width:120px; padding:8px 10px; border-radius:10px; border:none; background:rgba(255,255,255,.55); color:#0f172a; font-size:13px; font-weight:500; cursor:pointer; transition:background .15s,box-shadow .15s; text-align:left; line-height:1.35; box-shadow:0 1px 3px rgba(15,23,42,.04); }' +
      '#' + rootId + ' .afhub-flow-opt-btn:hover { background:rgba(255,255,255,.72); box-shadow:0 2px 8px rgba(15,23,42,.06); }' +
      '#' + rootId + ' .afhub-input-composer { flex:1 1 0; width:100%; min-width:0; max-width:100%; position:relative; isolation:isolate; display:block; padding:2px; border-radius:999px; background:' + composerShellBg + '; border:none; overflow:hidden; contain:paint; clip-path:inset(0 round 999px); -webkit-clip-path:inset(0 round 999px); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }' +
      '#' + rootId + ' .afhub-input-composer--agent-busy { flex:1 1 0; width:100%; max-width:100%; }' +
      '#' + rootId + ' .afhub-input-composer-inner { position:relative; z-index:1; display:flex; align-items:flex-end; gap:2px; width:100%; max-width:100%; box-sizing:border-box; padding:5px 8px 5px 6px; border-radius:999px; background:' + composerInnerBg + '; border:none; box-shadow:' + composerInnerShadow + '; -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); }' +
      /* Border beam: conic sobre el box real + mask anillo → borde continuo (sin elipses rotas). */
      '#' + rootId + ' .afhub-input-beam-ring {' +
        'position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;opacity:0;' +
        'box-sizing:border-box;padding:2px;overflow:hidden;' +
        /* salida (quita hover): suave */
        'transition:opacity .85s cubic-bezier(.22,.61,.36,1);' +
        '-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);' +
        '-webkit-mask-composite:xor;mask-composite:exclude;' +
      '}' +
      '#' + rootId + ' .afhub-input-beam-spin,' +
      '#' + rootId + ' .afhub-input-beam-bloom {' +
        'position:absolute;inset:0;border-radius:inherit;' +
        'background:' + rainbowBeam + ';' +
        'animation:afhub-border-beam-spin var(--afhub-beam-speed-input,4.8s) linear infinite;' +
        'will-change:--afhub-beam-angle;' +
        'transition:filter .7s cubic-bezier(.22,.61,.36,1),opacity .85s cubic-bezier(.22,.61,.36,1);' +
      '}' +
      '#' + rootId + ' .afhub-input-beam-bloom {' +
        'inset:1px;filter:blur(var(--afhub-beam-blur,3.5px));opacity:var(--afhub-beam-bloom,.42);' +
      '}' +
      '#' + rootId + ' .afhub-input-composer:hover .afhub-input-beam-ring,' +
      '#' + rootId + ' .afhub-input-composer:focus-within .afhub-input-beam-ring {' +
        'opacity:var(--afhub-beam-intensity,1);' +
        /* entrada (hover/click): misma duración y suavidad que la salida */
        'transition:opacity .85s cubic-bezier(.37,0,.2,1);' +
      '}' +
      '#' + rootId + ' .afhub-input-composer--agent-busy .afhub-input-beam-ring { opacity:0 !important; }' +
      '#' + rootId + ' .afhub-input-composer--agent-busy:hover .afhub-input-beam-ring,' +
      '#' + rootId + ' .afhub-input-composer--agent-busy:focus-within .afhub-input-beam-ring,' +
      '#' + rootId + ' .afhub-input-composer--agent-busy.afhub-input-composer--typing .afhub-input-beam-ring { opacity:1 !important; }' +
      '#' + rootId + ' .afhub-input-composer--typing .afhub-input-beam-ring {' +
        'opacity:var(--afhub-beam-intensity,1);' +
        'transition:opacity .85s cubic-bezier(.37,0,.2,1);' +
      '}' +
      '#' + rootId + ' .afhub-input-composer--typing .afhub-input-beam-bloom { opacity:calc(var(--afhub-beam-bloom,.42) * 1.3); }' +
      '#' + rootId + ' .afhub-input-composer--type-pulse .afhub-input-beam-ring { opacity:var(--afhub-beam-intensity,1); }' +
      '#' + rootId + ' .afhub-input-composer--type-pulse .afhub-input-beam-spin {' +
        'filter:brightness(1.35) saturate(1.25);' +
      '}' +
      '#' + rootId + ' .afhub-input-composer--type-pulse .afhub-input-beam-bloom {' +
        'opacity:.7;filter:blur(5px) brightness(1.15);' +
      '}' +
      '#' + rootId + ' .afhub-input-composer--voice-line .afhub-input-beam-ring {' +
        'opacity:var(--afhub-beam-intensity,1);' +
        'transition:opacity .85s cubic-bezier(.37,0,.2,1);' +
      '}' +
      '#' + rootId + ' .afhub-input-composer--voice-line .afhub-input-beam-spin,' +
      '#' + rootId + ' .afhub-input-composer--voice-line .afhub-input-beam-bloom { animation-duration:calc(var(--afhub-beam-speed-input,4.8s) * .75); }' +
      '#' + rootId + ' .afhub-input-composer--voice-line[data-voice="speaking"] .afhub-input-beam-spin,' +
      '#' + rootId + ' .afhub-input-composer--voice-line[data-voice="speaking"] .afhub-input-beam-bloom { animation-duration:calc(var(--afhub-beam-speed-input,4.8s) * .58); }' +
      '#' + rootId + ' .afhub-attach-input { position:absolute; width:0; height:0; opacity:0; pointer-events:none; overflow:hidden; }' +
      '#' + rootId + ' .afhub-attach { width:28px; height:28px; border-radius:50%; border:none; cursor:pointer; background:transparent; color:#8e8e93; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .14s,color .14s; padding:0; }' +
      '#' + rootId + ' .afhub-attach:hover { background:rgba(0,0,0,.06); color:#636366; }' +
      '#' + rootId + ' .afhub-attach:active { background:rgba(0,0,0,.1); }' +
      '#' + rootId + ' .afhub-attach svg { width:16px; height:16px; stroke-width:2.25; }' +
      '#' + rootId + ' .afhub-shortcuts-btn { width:28px; height:28px; border-radius:50%; border:none; cursor:pointer; background:transparent; color:#8e8e93; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .14s,color .14s; padding:0; }' +
      '#' + rootId + ' .afhub-shortcuts-btn:hover { background:rgba(0,0,0,.06); color:' + cfg.color + '; }' +
      '#' + rootId + ' .afhub-shortcuts-btn:active { background:rgba(0,0,0,.1); }' +
      '#' + rootId + ' .afhub-shortcuts-btn svg { width:16px; height:16px; stroke-width:2.25; }' +
      '#' + rootId + ' .afhub-shortcuts-btn:disabled { opacity:.45; cursor:not-allowed; }' +
      '#' + rootId + ' .afhub-attach-preview { flex-shrink:0; padding:6px 10px 0; background:' + chatSurfaceBg + '; border-top:none; }' +
      '#' + rootId + ' .afhub-attach-preview-inner { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:10px; background:rgba(255,255,255,.55); border:none; box-shadow:0 1px 3px rgba(15,23,42,.04); }' +
      '#' + rootId + ' .afhub-attach-preview-img { width:40px; height:40px; object-fit:cover; border-radius:8px; border:1px solid #e2e8f0; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-attach-preview-label { flex:1; font-size:12px; color:#64748b; font-weight:500; }' +
      '#' + rootId + ' .afhub-attach-preview-remove { width:26px; height:26px; border-radius:50%; border:none; background:#fee2e2; color:#dc2626; font-size:18px; line-height:1; cursor:pointer; flex-shrink:0; }' +
      '#' + rootId + ' .afhub-img-wrap--user { margin-top:8px; max-width:min(220px,100%); }' +
      '#' + rootId + ' .afhub-img-wrap--user .afhub-img-frame { display:inline-block; max-width:100%; vertical-align:top; }' +
      '#' + rootId + ' .afhub-img-wrap--user .afhub-widget-img { width:auto; max-width:100%; max-height:160px; object-fit:contain; background:rgba(255,255,255,.08); cursor:pointer; }' +
      '#' + rootId + ' .afhub-img-wrap--user .afhub-img-download-btn { display:none; }' +
      '#' + rootId + ' .afhub-input-wrap { flex:1; min-width:0; position:relative; display:flex; align-items:center; }' +
      '#' + rootId + ' .afhub-input-wrap .afhub-input { width:100%; padding-right:6px; }' +
      '#' + rootId + ' .afhub-input-wrap:has(.afhub-mic) .afhub-input { padding-right:36px; }' +
      '#' + rootId + ' .afhub-input-wrap .afhub-mic { position:absolute; right:4px; top:50%; transform:translateY(-50%); z-index:1; }' +
      '#' + rootId + ' .afhub-input { flex:1; min-width:0; border:none; border-radius:16px; padding:4px 8px; font-size:14px; font-weight:400; outline:none; resize:none; min-height:28px; max-height:88px; line-height:1.4; letter-spacing:-0.012em; font-family:inherit !important; color:#111111 !important; -webkit-text-fill-color:#111111; caret-color:' + cfg.color + '; background:transparent; box-shadow:none; overflow-y:auto; scrollbar-width:none; transition:none; }' +
      /* iOS/Safari: <16px en focus hace zoom de toda la página */
      '@media (hover:none),(max-width:768px){#' + rootId + ' .afhub-input{font-size:16px;line-height:1.32;min-height:28px;padding:4px 6px;}' +
      '#' + rootId + ' .afhub-handoff-input,#' + rootId + ' .afhub-fb-text{font-size:16px!important;}}' +
      '#' + rootId + ' .afhub-input::-webkit-scrollbar { display:none; width:0; height:0; }' +
      '#' + rootId + ' .afhub-input::placeholder { color:#94a3b8; opacity:1; font-weight:400; }' +
      '#' + rootId + ' .afhub-input:focus { box-shadow:none; }' +
      '#' + rootId + ' .afhub-send { width:28px; height:28px; border-radius:50%; border:none; cursor:pointer; background:#111111; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; position:relative; z-index:2; transition:background .14s,opacity .14s,transform .14s ' + macSpring + '; box-shadow:0 2px 8px rgba(0,0,0,.16); }' +
      '#' + rootId + ' .afhub-send:not(:disabled):hover { filter:none; background:#000000; transform:none; box-shadow:0 3px 12px rgba(0,0,0,.2); }' +
      '#' + rootId + ' .afhub-send:not(:disabled):active { filter:brightness(.94); box-shadow:inset 0 1px 2px rgba(0,0,0,.12); transform:scale(.96); }' +
      '#' + rootId + ' .afhub-send:disabled { opacity:1; cursor:default; background:#c7c7cc; color:rgba(255,255,255,.95); box-shadow:none; }' +
      '#' + rootId + ' .afhub-send svg { width:14px; height:14px; stroke-width:2.5; margin-left:1px; }' +
      '#' + rootId + ' .afhub-handoff-icon { width:28px; height:28px; border-radius:50%; border:none; cursor:pointer; background:transparent; color:#8e8e93; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .14s,color .14s; padding:0; appearance:none; -webkit-appearance:none; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none; }' +
      '#' + rootId + ' .afhub-handoff-icon:hover { background:rgba(0,0,0,.06); color:#636366; transform:none; box-shadow:none; }' +
      '#' + rootId + ' .afhub-handoff-icon:active { background:rgba(0,0,0,.1); }' +
      '#' + rootId + ' .afhub-handoff-icon svg { width:16px; height:16px; stroke-width:2.25; }' +
      '#' + rootId + ' .afhub-handoff-icon--disabled { opacity:.45; cursor:not-allowed; pointer-events:none; }' +
      '#' + rootId + ' .afhub-mic { width:28px; height:28px; border-radius:50%; border:none; cursor:pointer; background:transparent; color:#8e8e93; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .14s,color .14s; padding:0; }' +
      '#' + rootId + ' .afhub-mic:hover { background:rgba(0,0,0,.06); color:#636366; }' +
      '#' + rootId + ' .afhub-mic--active { background:rgba(255,59,48,.12) !important; color:#ff3b30 !important; animation:none; }' +
      '#' + rootId + ' .afhub-mic svg { width:16px; height:16px; stroke-width:2.25; }' +
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
      '@keyframes afhub-thinking-spark { 0%,100%{transform:rotate(0deg) scale(1)} 20%{transform:rotate(70deg) scale(1.08)} 40%{transform:rotate(0deg) scale(1)} 60%{transform:rotate(-55deg) scale(.94)} 80%{transform:rotate(0deg) scale(1)} }' +
      '@keyframes afhub-rk-tumble { from{transform:rotateX(-26deg) rotateY(38deg)} to{transform:rotateX(-26deg) rotateY(398deg)} }' +
      '@keyframes afhub-ic-crystal-spin{from{transform:rotateX(18deg) rotateY(0deg)}to{transform:rotateX(18deg) rotateY(360deg)}}' +
      '@keyframes afhub-ic-crystal-glint{0%,100%{opacity:.35;transform:translateZ(4px) scale(.7)}40%{opacity:1;transform:translateZ(4px) scale(1.2)}}' +
      '@keyframes afhub-ic-planet-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}' +
      '@keyframes afhub-ic-planet-ring{from{transform:rotateX(68deg) rotateZ(-18deg) rotateY(0deg)}to{transform:rotateX(68deg) rotateZ(-18deg) rotateY(360deg)}}' +
      '@keyframes afhub-ic-orbit-spin-a{to{transform:rotateZ(360deg)}}' +
      '@keyframes afhub-ic-orbit-spin-b{from{transform:rotateX(70deg) rotateZ(0deg)}to{transform:rotateX(70deg) rotateZ(360deg)}}' +
      '@keyframes afhub-ic-orbit-spin-c{from{transform:rotateY(70deg) rotateZ(40deg)}to{transform:rotateY(70deg) rotateZ(400deg)}}' +
      '@keyframes afhub-ic-orbit-tilt{from{transform:rotateZ(0deg)}to{transform:rotateZ(360deg)}}' +
      '@keyframes afhub-ic-radar-sweep{to{transform:rotate(360deg)}}' +
      '@keyframes afhub-ic-radar-blip{0%,70%,100%{opacity:.2;transform:scale(.7)}15%,35%{opacity:1;transform:scale(1.2)}}' +
      '@keyframes afhub-thinking-orb { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(.82);opacity:.72} }' +
      '@keyframes afhub-thinking-atom { from{transform:rotateY(0deg) rotateZ(18deg)} to{transform:rotateY(360deg) rotateZ(18deg)} }' +
      '@keyframes afhub-thinking-pulse-ring { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(2.8);opacity:0} }' +
      '@keyframes afhub-thinking-caption-pulse { 0% { opacity:.72; } 100% { opacity:1; } }' +
      '@keyframes afhub-thinking-shimmer { 0% { background-position:100% 50%; } 100% { background-position:0% 50%; } }' +
      '@keyframes afhub-msg-fade-in { from { opacity:0; transform:translateY(6px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }' +
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
      '@property --afhub-beam-angle{syntax:"<angle>";inherits:false;initial-value:0deg;}' +
      '@keyframes afhub-border-beam-spin{from{--afhub-beam-angle:0deg;}to{--afhub-beam-angle:360deg;}}' +
      '@keyframes afhub-thinking-glow-pulse{0%,100%{opacity:.38;}50%{opacity:.55;}}' +
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

  var hubApi = window.AgentFlowhub || {};
  hubApi.version = VERSION;
  hubApi.init = init;
  hubApi.updatePagePath = function (path) {
    var k;
    for (k in INSTANCES) {
      if (!Object.prototype.hasOwnProperty.call(INSTANCES, k)) continue;
      var inst = INSTANCES[k];
      if (inst && inst.api && typeof inst.api.updatePagePath === 'function') {
        inst.api.updatePagePath(path);
      }
    }
  };
  hubApi.showLauncher = function () {
    var k;
    for (k in INSTANCES) {
      if (!Object.prototype.hasOwnProperty.call(INSTANCES, k)) continue;
      var inst = INSTANCES[k];
      if (inst && inst.api && typeof inst.api.showLauncher === 'function') inst.api.showLauncher();
    }
  };
  hubApi.isLauncherHidden = function () {
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
  };
  window.AgentFlowhub = hubApi;

  autoInitFromScript();
})();


