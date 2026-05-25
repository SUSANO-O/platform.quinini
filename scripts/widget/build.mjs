/**
 * Genera dos bundles desde scripts/widget/core.js:
 *   public/widget.js  — embed público (AgentFlowhub, afhub-*)
 *   public/assist.js    — asistente interno BotIvA (__BIV, biv-*)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const corePath = path.join(__dirname, 'core.js');
const outPublic = path.join(root, 'public', 'widget.js');
const outInternal = path.join(root, 'public', 'assist.js');

function stripHeaderComment(source) {
  return source.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
}

function applyInternalTransforms(source) {
  let s = stripHeaderComment(source);

  const pairs = [
    ['if (window.AgentFlowhub && window.AgentFlowhub.version) return;', 'if (window.__BIV && window.__BIV.version) return;'],
    ['window.AgentFlowhub', 'window.__BIV'],
    ['afhub:launcher-visibility', 'biv:assist-visibility'],
    ['afhub:show-launcher', 'biv:show-assist'],
    ['afhub-launcher-menu-hidden', 'biv-assist-menu-hidden'],
    ['afhub-launcher-hidden:', 'biv-assist-hidden:'],
    ['afhub-fab-pos:', 'biv-fab-pos:'],
    ['afhub:chat-session:', 'biv:chat-session:'],
    ['afhub-launcher-hidden', 'biv-assist-hidden'],
    ['afhub-launcher-shown', 'biv-assist-shown'],
    ['afhub_', 'biv_'],
    ['afhub-', 'biv-'],
    ['[AgentFlowhub Widget]', ''],
    ['AgentFlowhub Widget', ''],
    ['AgentFlowhub', '__BIV'],
    ['    showLauncher: function () {', '    show: function () {'],
    ['    isLauncherHidden: function () {', '    isHidden: function () {'],
    ['typeof inst.api.showLauncher === \'function\'', 'typeof inst.api.show === \'function\''],
    ['inst.api.showLauncher()', 'inst.api.show()'],
    ['      showLauncher: function () { showLauncher(true); },', '      show: function () { showLauncher(true); },'],
    ['      hideLauncher: function () { hideLauncher(true); },', '      hide: function () { hideLauncher(true); },'],
  ];

  for (const [from, to] of pairs) {
    s = s.split(from).join(to);
  }

  return s;
}

async function minify(inPath, outPath, label) {
  await esbuild.build({
    entryPoints: [inPath],
    outfile: outPath,
    bundle: false,
    minify: true,
    legalComments: 'none',
    target: ['es2018'],
    logLevel: 'warning',
  });
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[build:widget] ${label} → ${path.relative(root, outPath)} (${kb} KB)`);
}

async function main() {
  if (!fs.existsSync(corePath)) {
    console.error('[build:widget] Falta scripts/widget/core.js');
    process.exit(1);
  }

  const core = fs.readFileSync(corePath, 'utf8');
  const tmpDir = path.join(__dirname, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const tmpPublic = path.join(tmpDir, 'widget.public.js');
  const tmpInternal = path.join(tmpDir, 'assist.internal.js');

  fs.writeFileSync(tmpPublic, core, 'utf8');
  fs.writeFileSync(tmpInternal, applyInternalTransforms(core), 'utf8');

  await minify(tmpPublic, outPublic, 'public');
  await minify(tmpInternal, outInternal, 'internal');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('[build:widget] OK');
}

main().catch((err) => {
  console.error('[build:widget]', err);
  process.exit(1);
});
