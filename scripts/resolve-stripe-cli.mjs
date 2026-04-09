/**
 * Resuelve la ruta al ejecutable `stripe` aunque no esté en el PATH (p. ej. terminal de Cursor tras winget).
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

function findStripeInWinGetPackages() {
  const local = process.env.LOCALAPPDATA || '';
  const packages = path.join(local, 'Microsoft', 'WinGet', 'Packages');
  if (!fs.existsSync(packages)) return null;
  try {
    const dirs = fs.readdirSync(packages);
    const stripeDir = dirs.find((d) => d.startsWith('Stripe.StripeCli'));
    if (stripeDir) {
      const exe = path.join(packages, stripeDir, 'stripe.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveStripeExecutable() {
  if (process.platform === 'win32') {
    // 1) Instalación típica winget (sin llamar a `where`, evita mensaje en español en stderr)
    const fromPackages = findStripeInWinGetPackages();
    if (fromPackages) return fromPackages;

    const local = process.env.LOCALAPPDATA || '';
    const link = path.join(local, 'Microsoft', 'WinGet', 'Links', 'stripe.exe');
    if (fs.existsSync(link)) return link;

    // 2) PATH — sin imprimir salida de `where` si falla
    try {
      const out = execFileSync(
        process.env.SystemRoot
          ? path.join(process.env.SystemRoot, 'System32', 'where.exe')
          : 'where.exe',
        ['stripe'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      for (const line of out.split(/\r?\n/)) {
        const p = line.trim();
        if (p && fs.existsSync(p)) return p;
      }
    } catch {
      /* no en PATH */
    }
  } else {
    try {
      const out = execFileSync('which', ['stripe'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const line = out.trim().split('\n')[0];
      if (line && fs.existsSync(line)) return line;
    } catch {
      /* ignore */
    }
  }

  throw new Error(
    'Stripe CLI no encontrado. Instálalo y reinicia la terminal:\n' +
      '  winget install -e --id Stripe.StripeCli',
  );
}
