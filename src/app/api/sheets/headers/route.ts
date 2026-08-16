/**
 * GET /api/sheets/headers?url=...&gid=...
 * Primera fila de la pestaña (cabeceras) para el selector de filtro de la matriz.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import {
  extractGid,
  extractSpreadsheetId,
  fetchPublicSpreadsheetHeaders,
} from '@/lib/agent-sheets';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  }

  const rawUrl = req.nextUrl.searchParams.get('url')?.trim() || '';
  const spreadsheetId = extractSpreadsheetId(rawUrl);
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'URL de Google Sheets inválida.' }, { status: 400 });
  }
  const gid = req.nextUrl.searchParams.get('gid')?.trim() || extractGid(rawUrl) || '0';
  const { headers, error } = await fetchPublicSpreadsheetHeaders({ spreadsheetId, gid });
  if (error && headers.length === 0) {
    return NextResponse.json({ error, headers: [] }, { status: 422 });
  }
  return NextResponse.json({ spreadsheetId, gid, headers, ...(error ? { warning: error } : {}) });
}
