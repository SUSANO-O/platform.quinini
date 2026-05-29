// === Router para asesor financiero virtual ===
// Copia y pega ESTE script en el nodo "Code" del workflow n8n.
// Soporta 7 acciones encadenables + echo por defecto.

const body = $input.first().json.body || $input.first().json;
const payload = body.payload || body;
const action = payload.action || '';

// ── Helpers de mock data ──
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i); return Math.abs(h); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pickOne(arr) { return arr[rand(0, arr.length - 1)]; }

// ━━━ 1. BUSCAR CLIENTE — Punto de entrada del flujo ━━━
if (action === 'buscar_cliente') {
  const rut = payload.rut || payload.documento || '11.111.111-1';
  const h = hash(rut);
  const score = 350 + (h % 500); // 350-850
  const ciudades = ['Santiago', 'Valparaíso', 'Concepción', 'La Serena', 'Antofagasta'];
  const planes = ['premium', 'gold', 'standard'];

  return [{ json: {
    ok: true,
    cliente_id: 'CL_' + (h % 100000).toString().padStart(5, '0'),
    rut,
    nombre: pickOne(['Juan Pérez', 'María González', 'Carlos Soto', 'Ana Muñoz', 'Diego Castro']),
    edad: 28 + (h % 35),
    ciudad: pickOne(ciudades),
    email: 'cliente' + (h % 999) + '@correo.cl',
    telefono: '+569' + String(rand(10000000, 99999999)),

    // Perfil financiero — el agente debe analizar estos campos
    plan: planes[h % 3],
    estado: 'activo',
    cliente_desde: '20' + (15 + (h % 8)) + '-0' + ((h % 9) + 1) + '-15',
    score_crediticio: score,
    categoria_riesgo: score > 700 ? 'bajo' : score > 550 ? 'medio' : 'alto',
    saldo_disponible_clp: rand(500000, 5000000),
    deuda_total_clp: rand(0, 2000000),
    productos_contratados: [
      'cuenta_corriente',
      ...(h % 2 === 0 ? ['tarjeta_credito'] : []),
      ...(h % 3 === 0 ? ['seguro_vida'] : []),
      ...(h % 5 === 0 ? ['credito_hipotecario'] : [])
    ],
    alertas: score < 500 ? ['atraso_pago_reciente'] : (score < 600 ? ['cuota_proxima_a_vencer'] : []),
    elegible_credito: score > 600,
    monto_pre_aprobado_clp: score > 600 ? rand(1000000, 10000000) : 0,
    ultima_interaccion: new Date(Date.now() - rand(86400000, 30 * 86400000)).toISOString(),

    note: 'Analiza score, alertas, productos contratados y elegible_credito para decidir el siguiente paso.'
  }}];
}

// ━━━ 2. CONSULTAR PRODUCTOS DISPONIBLES ━━━
if (action === 'consultar_productos_disponibles') {
  const { cliente_id } = payload;
  if (!cliente_id) return [{ json: { ok: false, error: 'Falta cliente_id (obtenlo de buscar_cliente)' }}];

  return [{ json: {
    ok: true,
    cliente_id,
    productos_recomendados: [
      {
        id: 'prod_credito_consumo',
        nombre: 'Crédito de Consumo',
        tipo: 'credito',
        descripcion: 'Hasta $5M, plazo 6-48 meses, sin codeudor',
        tasa_anual_pct: 12.5,
        cae_pct: 14.2,
        monto_min_clp: 200000,
        monto_max_clp: 5000000,
        plazo_min_meses: 6,
        plazo_max_meses: 48,
        recomendado_para: 'liquidez inmediata, score > 600'
      },
      {
        id: 'prod_tarjeta_oro',
        nombre: 'Tarjeta Visa Oro',
        tipo: 'tarjeta',
        descripcion: 'Sin anualidad primer año, cashback 1%, seguro viaje',
        cupo_pre_aprobado_clp: 2500000,
        anualidad_segunda_clp: 45000,
        recomendado_para: 'cliente activo sin tarjeta crédito'
      },
      {
        id: 'prod_seguro_auto',
        nombre: 'Seguro Automotriz Todo Riesgo',
        tipo: 'seguro',
        descripcion: 'Cobertura total, asistencia 24/7, deducible bajo',
        prima_mensual_clp: 35000,
        cobertura_max_clp: 25000000,
        recomendado_para: 'cliente con vehículo'
      },
      {
        id: 'prod_deposito_plazo',
        nombre: 'Depósito a Plazo',
        tipo: 'inversion',
        descripcion: 'Tasa garantizada, capital protegido',
        tasa_anual_pct: 5.8,
        monto_min_clp: 500000,
        plazo_min_dias: 30,
        recomendado_para: 'cliente con saldo disponible alto'
      }
    ],
    note: 'Elige el producto adecuado segun el perfil del cliente (saldo, riesgo, productos ya contratados).'
  }}];
}

// ━━━ 3. SIMULAR CRÉDITO ━━━
if (action === 'simular_credito') {
  const { monto_clp, plazo_meses } = payload;
  if (!monto_clp || !plazo_meses) return [{ json: { ok: false, error: 'Falta monto_clp o plazo_meses' }}];

  const tasaMensual = 0.0105;
  const cuota = (monto_clp * tasaMensual * Math.pow(1 + tasaMensual, plazo_meses)) / (Math.pow(1 + tasaMensual, plazo_meses) - 1);
  const total = cuota * plazo_meses;

  return [{ json: {
    ok: true,
    simulacion_id: 'SIM_' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    monto_solicitado_clp: monto_clp,
    plazo_meses,
    tasa_mensual_pct: 1.05,
    tasa_anual_pct: 12.6,
    cae_pct: 14.2,
    cuota_mensual_clp: Math.round(cuota),
    costo_total_clp: Math.round(total),
    intereses_totales_clp: Math.round(total - monto_clp),
    primera_cuota: '2026-07-05',
    ultima_cuota: new Date(Date.now() + plazo_meses * 30 * 86400000).toISOString().slice(0, 10),
    aprobacion_automatica: monto_clp <= 3000000,
    note: 'Presenta la cuota mensual al cliente. Si acepta, usa enviar_oferta.'
  }}];
}

// ━━━ 4. ENVIAR OFERTA ━━━
if (action === 'enviar_oferta') {
  const { cliente_id, producto_id, canal } = payload;
  if (!cliente_id || !producto_id) return [{ json: { ok: false, error: 'Falta cliente_id o producto_id' }}];

  return [{ json: {
    ok: true,
    oferta_id: 'OF_' + Math.random().toString(36).slice(2, 10).toUpperCase(),
    cliente_id,
    producto_id,
    canal: canal || 'WhatsApp',
    enviada_a: canal === 'email' ? 'cliente@correo.cl' : '+569 1234 5678',
    estado: 'enviada',
    valida_hasta: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    tracking_url: 'https://tracking.ejemplo.cl/of_' + Math.random().toString(36).slice(2, 8),
    timestamp_envio: new Date().toISOString(),
    note: 'Oferta enviada. Guarda oferta_id para consultar_estado_oferta despues.'
  }}];
}

// ━━━ 5. CONSULTAR ESTADO DE LA OFERTA ━━━
if (action === 'consultar_estado_oferta') {
  const { oferta_id } = payload;
  if (!oferta_id) return [{ json: { ok: false, error: 'Falta oferta_id' }}];

  const estados = ['enviada', 'vista', 'en_revision', 'aceptada', 'rechazada', 'expirada'];
  const estado = pickOne(estados);

  return [{ json: {
    ok: true,
    oferta_id,
    estado,
    vista_at: estado !== 'enviada' ? new Date(Date.now() - rand(3600000, 86400000)).toISOString() : null,
    aceptada_at: estado === 'aceptada' ? new Date(Date.now() - rand(3600000, 86400000)).toISOString() : null,
    interacciones: rand(0, 5),
    siguiente_accion_sugerida: estado === 'aceptada' ? 'enviar_documentos' : estado === 'rechazada' ? 'agendar_callback' : 'esperar_o_recordatorio'
  }}];
}

// ━━━ 6. AGENDAR CALLBACK ━━━
if (action === 'agendar_callback') {
  const { cliente_id, fecha, motivo } = payload;
  if (!cliente_id) return [{ json: { ok: false, error: 'Falta cliente_id' }}];

  return [{ json: {
    ok: true,
    callback_id: 'CB_' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    cliente_id,
    fecha_programada: fecha || new Date(Date.now() + 86400000).toISOString(),
    asesor_asignado: pickOne(['Carla Rodríguez', 'Miguel Torres', 'Sofía Vargas', 'Pedro Hernández']),
    motivo: motivo || 'seguimiento_general',
    canal: 'llamada_telefonica',
    estado: 'programado',
    confirmacion_enviada: true
  }}];
}

// ━━━ 7. DERIVAR A HUMANO ━━━
if (action === 'derivar_humano') {
  const { cliente_id, motivo, prioridad } = payload;
  if (!cliente_id) return [{ json: { ok: false, error: 'Falta cliente_id' }}];

  return [{ json: {
    ok: true,
    ticket_id: 'TK_' + Math.random().toString(36).slice(2, 10).toUpperCase(),
    cliente_id,
    motivo: motivo || 'consulta_general',
    prioridad: prioridad || 'media',
    cola: prioridad === 'alta' ? 'asesor_senior' : 'soporte_general',
    tiempo_estimado_respuesta_min: prioridad === 'alta' ? 5 : prioridad === 'baja' ? 60 : 20,
    asesor_disponible: 'Patricia López',
    estado: 'en_cola',
    note: 'Cliente derivado correctamente. Informa al usuario el tiempo estimado.'
  }}];
}

// ━━━ Default: echo + lista de acciones ━━━
return [{ json: {
  ok: true,
  receivedAt: new Date().toISOString(),
  payloadEcho: payload,
  acciones_disponibles: [
    'buscar_cliente',
    'consultar_productos_disponibles',
    'simular_credito',
    'enviar_oferta',
    'consultar_estado_oferta',
    'agendar_callback',
    'derivar_humano'
  ],
  hint: 'Incluye payload.action con una de las acciones listadas para enrutar a la respuesta correcta.'
}}];
