/**
 * Modo flujo guiado para widget.js (inyectado en build).
 */
function createFlowController(deps) {
  var cfg = deps.cfg;
  var state = {
    loaded: false,
    loading: false,
    done: false,
    failed: false,
    flow: null,
    graph: null,
    currentNodeId: null,
    sessionId: null,
    messageCount: 0,
    answers: [],
    started: false,
  };

  var flowBar = document.createElement('div');
  flowBar.className = 'afhub-flow-options';
  flowBar.style.display = 'none';
  deps.chat.insertBefore(flowBar, deps.inputArea);

  var defaultPlaceholder = (deps.input && deps.input.placeholder) || 'Escribe un mensaje...';

  function host() {
    return String(cfg.host || '').replace(/\/$/, '');
  }

  function nodeConfig(node) {
    return (node && node.config) || {};
  }

  function buildGraph(nodes, connections) {
    var nodeMap = {};
    var i;
    for (i = 0; i < nodes.length; i++) nodeMap[nodes[i].id] = nodes[i];
    var outEdges = {};
    for (i = 0; i < connections.length; i++) {
      var c = connections[i];
      if (!outEdges[c.fromNodeId]) outEdges[c.fromNodeId] = [];
      outEdges[c.fromNodeId].push(c);
    }
    return { nodeMap: nodeMap, outEdges: outEdges };
  }

  function nextNodeId(fromId, handle) {
    var edges = state.graph.outEdges[fromId] || [];
    if (!edges.length) return null;
    if (handle) {
      for (var i = 0; i < edges.length; i++) {
        if (edges[i].fromHandle === handle) return edges[i].toNodeId;
      }
      return null;
    }
    for (var j = 0; j < edges.length; j++) {
      if (edges[j].fromHandle === 'output') return edges[j].toNodeId;
    }
    return edges[0].toNodeId;
  }

  function clearOptions() {
    flowBar.innerHTML = '';
    flowBar.style.display = 'none';
  }

  function setInputPlaceholder(text) {
    if (!deps.input) return;
    deps.input.placeholder = text || defaultPlaceholder;
  }

  function answerKey(node) {
    var c = nodeConfig(node);
    return c.variableKey || node.id;
  }

  function getAnswerValue(key) {
    if (!key) return '';
    for (var i = state.answers.length - 1; i >= 0; i--) {
      if (state.answers[i].key === key) return String(state.answers[i].value ?? '');
    }
    return '';
  }

  function pushAnswer(node, value, label) {
    state.answers.push({
      nodeId: node.id,
      key: answerKey(node),
      value: value,
      label: label || value,
    });
  }

  function record(status) {
    state.messageCount += 1;
    return fetch(host() + '/api/flows/' + encodeURIComponent(cfg.flowId) + '/conversations/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-flow-token': String(cfg.flowToken) },
      body: JSON.stringify({
        sessionId: state.sessionId,
        status: status,
        messageCount: state.messageCount,
        currentNodeId: state.currentNodeId,
        answers: state.answers,
        widgetId: cfg.widgetId || '',
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.sessionId) state.sessionId = d.sessionId;
      })
      .catch(function () { /* noop */ });
  }

  function shufflePairs(pairs) {
    var a = pairs.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function showOptions(node) {
    clearOptions();
    if (!node.options || !node.options.length) return;
    flowBar.style.display = 'flex';
    var pairs = [];
    for (var i = 0; i < node.options.length; i++) {
      pairs.push({ opt: node.options[i], idx: i });
    }
    if (nodeConfig(node).randomizeOptions) pairs = shufflePairs(pairs);
    for (var k = 0; k < pairs.length; k++) {
      (function (opt, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'afhub-flow-opt-btn';
        btn.textContent = opt.label || opt.value;
        btn.addEventListener('click', function () {
          pickOption(node, opt, idx);
        });
        flowBar.appendChild(btn);
      })(pairs[k].opt, pairs[k].idx);
    }
  }

  function showBooking(node) {
    clearOptions();
    var c = nodeConfig(node);
    var url = String(c.bookingUrl || '').trim();
    var label = c.buttonLabel || (node.type === 'calendly_booking' ? 'Abrir Calendly' : 'Reservar cita');
    flowBar.style.display = 'flex';

    if (url) {
      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'afhub-flow-opt-btn';
      openBtn.textContent = label;
      openBtn.addEventListener('click', function () {
        try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { /* noop */ }
        if (c.required === false) return;
        deps.addMessage('user', label);
        deps.historyPush({ role: 'user', content: label });
        pushAnswer(node, url, label);
        clearOptions();
        setInputPlaceholder(defaultPlaceholder);
        var nextId = nextNodeId(node.id, 'output');
        void record('active');
        if (nextId) goToNode(nextId);
        else state.done = true;
        deps.syncSendButtonState();
      });
      flowBar.appendChild(openBtn);
    } else {
      var hint = document.createElement('button');
      hint.type = 'button';
      hint.className = 'afhub-flow-opt-btn';
      hint.textContent = 'Continuar';
      hint.addEventListener('click', function () {
        pushAnswer(node, 'skipped', 'Continuar');
        clearOptions();
        var nextId = nextNodeId(node.id, 'output');
        void record('active');
        if (nextId) goToNode(nextId);
        else state.done = true;
        deps.syncSendButtonState();
      });
      flowBar.appendChild(hint);
    }

    if (c.required === false && url) {
      var skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'afhub-flow-opt-btn';
      skip.textContent = 'Continuar sin reservar';
      skip.addEventListener('click', function () {
        deps.addMessage('user', 'Continuar sin reservar');
        deps.historyPush({ role: 'user', content: 'Continuar sin reservar' });
        pushAnswer(node, 'skipped', 'Continuar sin reservar');
        clearOptions();
        setInputPlaceholder(defaultPlaceholder);
        var nextId = nextNodeId(node.id, 'output');
        void record('active');
        if (nextId) goToNode(nextId);
        else state.done = true;
        deps.syncSendButtonState();
      });
      flowBar.appendChild(skip);
    }
  }

  function evalCondition(node) {
    var c = nodeConfig(node);
    var left = getAnswerValue(c.sourceVariable || '');
    var right = String(c.compareValue ?? '');
    var op = c.operator || 'eq';
    if (op === 'empty') return !String(left).trim();
    if (op === 'not_empty') return Boolean(String(left).trim());
    if (op === 'contains') return String(left).toLowerCase().indexOf(right.toLowerCase()) !== -1;
    if (op === 'gt') return Number(left) > Number(right);
    if (op === 'lt') return Number(left) < Number(right);
    if (op === 'neq') return String(left) !== right;
    return String(left) === right;
  }

  function validateInput(node, text) {
    var c = nodeConfig(node);
    var t = String(text || '').trim();
    var required = c.required !== false;

    if (!t) {
      if (!required) return { ok: true, value: '' };
      return { ok: false, msg: 'Escribe una respuesta para continuar.' };
    }

    var nodeType = node.type;
    if (nodeType === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
        return { ok: false, msg: 'Introduce un email válido.' };
      }
    }
    if (nodeType === 'phone') {
      if (t.replace(/\D/g, '').length < 8) {
        return { ok: false, msg: 'Introduce un teléfono válido.' };
      }
    }
    if (nodeType === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(t)) {
        return { ok: false, msg: 'Introduce un número válido.' };
      }
      var num = Number(t);
      if (typeof c.min === 'number' && num < c.min) {
        return { ok: false, msg: 'El número debe ser al menos ' + c.min + '.' };
      }
      if (typeof c.max === 'number' && num > c.max) {
        return { ok: false, msg: 'El número no puede ser mayor que ' + c.max + '.' };
      }
    }
    if (nodeType === 'text') {
      if (typeof c.minLength === 'number' && t.length < c.minLength) {
        return { ok: false, msg: 'Escribe al menos ' + c.minLength + ' caracteres.' };
      }
      if (typeof c.maxLength === 'number' && t.length > c.maxLength) {
        return { ok: false, msg: 'Máximo ' + c.maxLength + ' caracteres.' };
      }
    }
    return { ok: true, value: t };
  }

  function goToNode(nodeId) {
    clearOptions();
    var node = state.graph.nodeMap[nodeId];
    if (!node) return;
    state.currentNodeId = nodeId;

    if (node.type === 'start') {
      var n = nextNodeId('start', 'output');
      if (n) goToNode(n);
      return;
    }

    if (node.type === 'condition') {
      var passed = evalCondition(node);
      var branch = nextNodeId(nodeId, passed ? 'true' : 'false');
      if (!branch) branch = nextNodeId(nodeId, 'output');
      if (branch) goToNode(branch);
      else state.done = true;
      return;
    }

    if (node.type === 'set_variable') {
      var setCfg = nodeConfig(node);
      pushAnswer(node, setCfg.setValue != null ? String(setCfg.setValue) : '');
      var afterSet = nextNodeId(nodeId, 'output');
      if (afterSet) goToNode(afterSet);
      else state.done = true;
      return;
    }

    if (node.type === 'goto') {
      var gotoCfg = nodeConfig(node);
      var target = String(gotoCfg.targetNodeId || '').trim() || 'start';
      if (!state.graph.nodeMap[target]) target = 'start';
      goToNode(target);
      return;
    }

    if (node.type === 'random') {
      var opts = node.options || [];
      if (!opts.length) {
        var afterEmpty = nextNodeId(nodeId, 'output');
        if (afterEmpty) goToNode(afterEmpty);
        else state.done = true;
        return;
      }
      var rIdx = Math.floor(Math.random() * opts.length);
      var rOpt = opts[rIdx];
      pushAnswer(node, rOpt.value, rOpt.label || rOpt.value);
      var rNext = null;
      var rEdges = state.graph.outEdges[node.id] || [];
      for (var ri = 0; ri < rEdges.length; ri++) {
        if (rEdges[ri].fromHandle === 'option:' + rIdx) {
          rNext = rEdges[ri].toNodeId;
          break;
        }
      }
      if (!rNext) rNext = nextNodeId(node.id, 'output');
      if (rNext) goToNode(rNext);
      else state.done = true;
      return;
    }

    if (node.type === 'end') {
      var endCfg = nodeConfig(node);
      var endMsg = node.question || state.flow.completionMessage || '¡Gracias!';
      deps.addMessage('bot', endMsg);
      state.done = true;
      setInputPlaceholder(defaultPlaceholder);
      void record('completed');
      if (endCfg.redirectUrl) {
        try { window.open(String(endCfg.redirectUrl), '_blank', 'noopener,noreferrer'); } catch (e) { /* noop */ }
      }
      return;
    }

    var c = nodeConfig(node);
    deps.addMessage('bot', node.question || '…');
    if (c.helpText) deps.addMessage('bot', c.helpText);

    if (node.type === 'multiple_choice') {
      setInputPlaceholder(defaultPlaceholder);
      showOptions(node);
      return;
    }

    if (node.type === 'message') {
      setInputPlaceholder(defaultPlaceholder);
      if (c.autoContinue) {
        var msgDelay = typeof c.delayMs === 'number' ? Math.max(0, c.delayMs) : 800;
        setTimeout(function () {
          if (state.currentNodeId !== node.id || state.done) return;
          var nextMsg = nextNodeId(node.id, 'output');
          void record('active');
          if (nextMsg) goToNode(nextMsg);
          else state.done = true;
          deps.syncSendButtonState();
        }, msgDelay);
        return;
      }
      clearOptions();
      flowBar.style.display = 'flex';
      var contBtn = document.createElement('button');
      contBtn.type = 'button';
      contBtn.className = 'afhub-flow-opt-btn';
      contBtn.textContent = c.buttonLabel || 'Continuar';
      contBtn.addEventListener('click', function () {
        clearOptions();
        var nextMsg = nextNodeId(node.id, 'output');
        void record('active');
        if (nextMsg) goToNode(nextMsg);
        else state.done = true;
        deps.syncSendButtonState();
      });
      flowBar.appendChild(contBtn);
      return;
    }

    if (node.type === 'delay') {
      setInputPlaceholder(defaultPlaceholder);
      var waitMs = typeof c.delayMs === 'number' ? Math.max(0, c.delayMs) : 1500;
      setTimeout(function () {
        if (state.currentNodeId !== node.id || state.done) return;
        var nextDelay = nextNodeId(node.id, 'output');
        void record('active');
        if (nextDelay) goToNode(nextDelay);
        else state.done = true;
        deps.syncSendButtonState();
      }, waitMs);
      return;
    }

    if (node.type === 'calendar_booking' || node.type === 'calendly_booking') {
      setInputPlaceholder(defaultPlaceholder);
      showBooking(node);
      return;
    }

    setInputPlaceholder(c.placeholder || defaultPlaceholder);
  }

  function pickOption(node, opt, idx) {
    if (state.done) return;
    var label = opt.label || opt.value;
    deps.addMessage('user', label);
    deps.historyPush({ role: 'user', content: label });
    pushAnswer(node, opt.value, label);
    clearOptions();
    var handle = 'option:' + idx;
    var edges = state.graph.outEdges[node.id] || [];
    var nextId = null;
    for (var i = 0; i < edges.length; i++) {
      if (edges[i].fromHandle === handle) {
        nextId = edges[i].toNodeId;
        break;
      }
    }
    if (!nextId) nextId = nextNodeId(node.id, 'output');
    if (nextId) goToNode(nextId);
    else state.done = true;
    void record('active');
    deps.syncSendButtonState();
  }

  function handleTextInput(text) {
    if (state.done || state.failed) return true;
    var node = state.graph && state.currentNodeId
      ? state.graph.nodeMap[state.currentNodeId]
      : null;
    if (!node) return false;
    if (
      node.type === 'multiple_choice' ||
      node.type === 'start' ||
      node.type === 'end' ||
      node.type === 'condition' ||
      node.type === 'message' ||
      node.type === 'delay' ||
      node.type === 'set_variable' ||
      node.type === 'goto' ||
      node.type === 'random' ||
      node.type === 'calendar_booking' ||
      node.type === 'calendly_booking'
    ) {
      return false;
    }
    var v = validateInput(node, text);
    if (!v.ok) {
      deps.addMessage('bot', v.msg);
      return true;
    }
    if (v.value === '' && nodeConfig(node).required === false) {
      pushAnswer(node, '', '');
    } else {
      deps.addMessage('user', v.value);
      deps.historyPush({ role: 'user', content: v.value });
      pushAnswer(node, v.value);
    }
    setInputPlaceholder(defaultPlaceholder);
    var nextId = nextNodeId(node.id, 'output');
    void record('active');
    if (nextId) goToNode(nextId);
    else state.done = true;
    deps.syncSendButtonState();
    return true;
  }

  function loadAndStart() {
    if (state.loading || state.loaded || state.failed) return;
    state.loading = true;
    var url = host() + '/api/flows/' + encodeURIComponent(cfg.flowId)
      + '/embed?token=' + encodeURIComponent(cfg.flowToken);
    fetch(url)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        state.loading = false;
        if (!res.ok || !res.d || !res.d.flow) {
          state.failed = true;
          deps.addMessage('bot', (res.d && res.d.error) || 'No se pudo cargar el flujo.');
          return;
        }
        state.loaded = true;
        state.flow = res.d.flow;
        state.graph = buildGraph(state.flow.nodes || [], state.flow.connections || []);
        state.started = true;
        void record('active').then(function () {
          goToNode('start');
        });
      })
      .catch(function () {
        state.loading = false;
        state.failed = true;
        deps.addMessage('bot', 'Error de red al cargar el flujo.');
      });
  }

  return {
    isActive: function () {
      return Boolean(cfg.flowId && cfg.flowToken);
    },
    onEmptyHistory: function () {
      if (!state.started) loadAndStart();
      return true;
    },
    onSend: function (textArg) {
      if (state.failed) return true;
      if (!state.loaded) return true;
      if (state.done) return true;
      var text = typeof textArg === 'string' ? textArg.trim() : deps.getInputValue().trim();
      if (!text) return true;
      deps.clearInput();
      if (handleTextInput(text)) return true;
      return false;
    },
    reset: function () {
      state.loaded = false;
      state.loading = false;
      state.done = false;
      state.failed = false;
      state.flow = null;
      state.graph = null;
      state.currentNodeId = null;
      state.sessionId = null;
      state.messageCount = 0;
      state.answers = [];
      state.started = false;
      setInputPlaceholder(defaultPlaceholder);
      clearOptions();
    },
  };
}
