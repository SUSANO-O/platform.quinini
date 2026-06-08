/**
 * GET /api/sheets/tabs?url=...
 * Lista pestañas de un Google Spreadsheet público (para el selector en el editor de agentes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import {
  extractSpreadsheetId,
  fetchPublicSpreadsheetTabs,
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

  const { tabs, error } = await fetchPublicSpreadsheetTabs(spreadsheetId);
  if (error && tabs.length === 0) {
    return NextResponse.json({ error, tabs: [] }, { status: 422 });
  }

  return NextResponse.json({
    spreadsheetId,
    tabs,
    ...(error ? { warning: error } : {}),
  });
}
