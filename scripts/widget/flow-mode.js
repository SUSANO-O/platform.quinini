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

  function host() {
    return String(cfg.host || '').replace(/\/$/, '');
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

  function showOptions(node) {
    clearOptions();
    if (!node.options || !node.options.length) return;
    flowBar.style.display = 'flex';
    for (var i = 0; i < node.options.length; i++) {
      (function (opt, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'afhub-flow-opt-btn';
        btn.textContent = opt.label || opt.value;
        btn.addEventListener('click', function () {
          pickOption(node, opt, idx);
        });
        flowBar.appendChild(btn);
      })(node.options[i], i);
    }
  }

  function validateInput(nodeType, text) {
    var t = String(text || '').trim();
    if (!t) return { ok: false, msg: 'Escribe una respuesta para continuar.' };
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

    if (node.type === 'end') {
      var endMsg = node.question || state.flow.completionMessage || '¡Gracias!';
      deps.addMessage('bot', endMsg);
      state.done = true;
      void record('completed');
      return;
    }

    deps.addMessage('bot', node.question || '…');
    if (node.type === 'multiple_choice') {
      showOptions(node);
    }
  }

  function pickOption(node, opt, idx) {
    if (state.done) return;
    var label = opt.label || opt.value;
    deps.addMessage('user', label);
    deps.historyPush({ role: 'user', content: label });
    state.answers.push({ nodeId: node.id, value: opt.value, label: label });
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

  function handleTextInput(text, origSend) {
    if (state.done || state.failed) return true;
    var node = state.graph && state.currentNodeId
      ? state.graph.nodeMap[state.currentNodeId]
      : null;
    if (!node || node.type === 'multiple_choice' || node.type === 'start' || node.type === 'end') {
      return false;
    }
    var v = validateInput(node.type, text);
    if (!v.ok) {
      deps.addMessage('bot', v.msg);
      return true;
    }
    deps.addMessage('user', v.value);
    deps.historyPush({ role: 'user', content: v.value });
    state.answers.push({ nodeId: node.id, value: v.value });
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
    onSend: function (textArg, origSend) {
      if (state.failed) return true;
      if (!state.loaded) return true;
      if (state.done) return true;
      var text = typeof textArg === 'string' ? textArg.trim() : deps.getInputValue().trim();
      if (!text) return true;
      deps.clearInput();
      if (handleTextInput(text, origSend)) return true;
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
      clearOptions();
    },
  };
}
