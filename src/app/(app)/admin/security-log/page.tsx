'use client';

import { useEffect, useState, useCallback } from 'react';

type LogEntry = {
  _id: string;
  event: string;
  ip: string;
  origin: string;
  widgetId: string;
  agentId: string;
  userId: string;
  code: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

type Summary = { _id: string; count: number };

const EVENT_COLORS: Record<string, string> = {
  rate_limited:       'bg-yellow-100 text-yellow-800',
  origin_not_allowed: 'bg-orange-100 text-orange-800',
  token_invalid:      'bg-red-100 text-red-700',
  quota_exceeded:     'bg-purple-100 text-purple-800',
  injection_detected: 'bg-red-200 text-red-900 font-semibold',
  turn_limit:         'bg-blue-100 text-blue-800',
  message_too_long:   'bg-gray-100 text-gray-700',
  signature_invalid:  'bg-red-300 text-red-900 font-bold',
};

export default function SecurityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterIp, setFilterIp] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (filterEvent) params.set('event', filterEvent);
    if (filterIp)    params.set('ip', filterIp);
    const res = await fetch(`/api/admin/security-log?${params}`);
    if (res.ok) {
      const d = await res.json() as { logs: LogEntry[]; summary: Summary[] };
      setLogs(d.logs);
      setSummary(d.summary);
    }
    setLoading(false);
  }, [filterEvent, filterIp]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Log</h1>
          <p className="text-sm text-gray-500 mt-1">Eventos de seguridad del flujo de chat — últimas 24h en resumen, 200 más recientes en detalle</p>
        </div>
        <button
          onClick={() => void load()}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700"
        >
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {/* Summary */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {summary.map(s => (
            <div key={s._id} className="bg-white border rounded-xl p-4">
              <div className={`inline-block px-2 py-0.5 rounded text-xs mb-2 ${EVENT_COLORS[s._id] || 'bg-gray-100 text-gray-700'}`}>
                {s._id}
              </div>
              <div className="text-2xl font-bold text-gray-900">{s.count}</div>
              <div className="text-xs text-gray-400">últimas 24h</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterEvent}
          onChange={e => setFilterEvent(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Todos los eventos</option>
          {['rate_limited','origin_not_allowed','token_invalid','quota_exceeded','injection_detected','turn_limit','message_too_long','signature_invalid'].map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filtrar por IP…"
          value={filterIp}
          onChange={e => setFilterIp(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void load()}
          className="border rounded-lg px-3 py-2 text-sm flex-1"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Hora','Evento','IP','Origin','Widget/Agent','Código','Meta'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {loading ? 'Cargando…' : 'Sin eventos de seguridad registrados.'}
                  </td>
                </tr>
              )}
              {logs.map(log => (
                <tr key={log._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {new Date(log.createdAt).toLocaleString('es')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${EVENT_COLORS[log.event] || 'bg-gray-100 text-gray-700'}`}>
                      {log.event}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{log.ip || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate">{log.origin || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono max-w-[180px] truncate">
                    {log.widgetId || log.agentId || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{log.code || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                    {Object.keys(log.meta || {}).length > 0
                      ? JSON.stringify(log.meta)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
