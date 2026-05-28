/**
 * Genera un archivo HTML autocontenido con datos encriptados AES-256-GCM.
 * El HTML incluye el visor: el usuario abre el archivo en cualquier browser,
 * ingresa la clave y los datos se muestran — sin internet ni apps externas.
 */

import crypto from 'crypto';

const ITERATIONS = 200_000;
const KEY_LEN    = 32; // 256 bits
const HASH       = 'sha256';

export type EncryptedExportType =
  | 'gdpr'
  | 'widget-conversations'
  | 'widget-usage-csv';

function encryptAES(plaintext: string, password: string) {
  const salt = crypto.randomBytes(32);
  const iv   = crypto.randomBytes(12);
  const key  = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, HASH);

  const cipher    = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag(); // 16 bytes — appended al ciphertext para Web Crypto

  return {
    encryptedB64: Buffer.concat([encrypted, authTag]).toString('base64'),
    saltB64:      salt.toString('base64'),
    ivB64:        iv.toString('base64'),
  };
}

/** Construye el HTML autocontenido con los datos encriptados embebidos. */
export function buildEncryptedHtml(
  data:     string,
  password: string,
  opts: { type: EncryptedExportType; filename: string },
): string {
  const { encryptedB64, saltB64, ivB64 } = encryptAES(data, password);
  return renderHtml({ encryptedB64, saltB64, ivB64, ...opts });
}

// ─── HTML template ────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderHtml(p: {
  encryptedB64: string;
  saltB64:      string;
  ivB64:        string;
  type:         EncryptedExportType;
  filename:     string;
}): string {
  const { encryptedB64, saltB64, ivB64, type, filename } = p;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(filename)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
#lock{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:40px;width:100%;max-width:420px;text-align:center}
.icon{font-size:48px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;margin-bottom:8px}
.sub{font-size:13px;color:#94a3b8;margin-bottom:20px;line-height:1.5}
.fname{font-size:11px;color:#64748b;background:#0f172a;padding:8px 12px;border-radius:8px;font-family:monospace;word-break:break-all;margin-bottom:20px}
input{width:100%;padding:12px 16px;background:#0f172a;border:1px solid #334155;border-radius:10px;color:#e2e8f0;font-size:15px;outline:none;margin-bottom:10px}
input:focus{border-color:#6366f1}
button{width:100%;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#4f46e5}
button:disabled{opacity:.6;cursor:not-allowed}
#err{color:#f87171;font-size:13px;margin-top:10px;display:none}

#view{display:none;padding:24px;max-width:1100px;margin:0 auto}
.hdr{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #1e293b}
.hdr-title{font-size:16px;font-weight:700}
.hdr-sub{font-size:11px;color:#64748b;font-family:monospace}
.badge{font-size:11px;padding:3px 10px;border-radius:99px;background:#22c55e20;color:#22c55e;font-weight:700;white-space:nowrap}

.session{background:#1e293b;border:1px solid #334155;border-radius:12px;margin-bottom:14px;overflow:hidden}
.s-hdr{padding:12px 16px;background:#0f172a;display:flex;justify-content:space-between;align-items:center;cursor:pointer;gap:8px}
.s-hdr:hover{background:#1e293b}
.s-id{font-family:monospace;color:#94a3b8;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.s-meta{color:#64748b;font-size:11px;white-space:nowrap}
.s-body{padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.msg{max-width:78%;padding:9px 13px;border-radius:10px;font-size:13px;line-height:1.5}
.msg.user{align-self:flex-end;background:#6366f120;border:1px solid #6366f140;color:#c7d2fe}
.msg.assistant{align-self:flex-start;background:#0f172a;border:1px solid #334155}
.msg-role{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;color:#64748b}
.msg-time{font-size:10px;color:#475569;margin-top:3px}

pre{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;font-size:12px;overflow-x:auto;line-height:1.6;color:#94a3b8;white-space:pre-wrap;word-break:break-word}
table{width:100%;border-collapse:collapse;font-size:13px;background:#1e293b;border-radius:12px;overflow:hidden}
th{padding:10px 14px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:1px solid #334155;background:#0f172a}
td{padding:10px 14px;border-bottom:1px solid #0f172a;color:#e2e8f0}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1e293b80}
</style>
</head>
<body>

<div id="lock">
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Archivo protegido</h1>
    <div class="sub">Ingresa la clave para descifrar y ver los datos.<br>Todo ocurre en tu navegador — sin internet.</div>
    <div class="fname">${esc(filename)}</div>
    <input type="password" id="pw" placeholder="Clave de descifrado" autocomplete="current-password" />
    <button id="btn" onclick="run()">Descifrar →</button>
    <div id="err">Clave incorrecta. Intenta de nuevo.</div>
  </div>
</div>

<div id="view">
  <div class="hdr">
    <span class="badge">✓ Descifrado</span>
    <div>
      <div class="hdr-title">${esc(filename)}</div>
      <div class="hdr-sub">AES-256-GCM · PBKDF2-SHA256 · 200 000 iteraciones</div>
    </div>
  </div>
  <div id="content"></div>
</div>

<script>
var E="${encryptedB64}",S="${saltB64}",I="${ivB64}",T="${type}";

function b64(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
function he(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fd(s){try{return new Date(s).toLocaleString();}catch(e){return s;}}

async function run(){
  var pw=document.getElementById('pw').value;
  if(!pw)return;
  var btn=document.getElementById('btn');
  btn.disabled=true;btn.textContent='Descifrando…';
  document.getElementById('err').style.display='none';
  try{
    var km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
    var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(S),iterations:200000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
    var dec=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(I)},key,b64(E));
    var text=new TextDecoder().decode(dec);
    document.getElementById('lock').style.display='none';
    document.getElementById('view').style.display='block';
    render(text);
  }catch(e){
    document.getElementById('err').style.display='block';
    btn.disabled=false;btn.textContent='Descifrar →';
  }
}
document.getElementById('pw').addEventListener('keydown',function(e){if(e.key==='Enter')run();});

function render(text){
  var el=document.getElementById('content');
  if(T==='widget-usage-csv'){
    var rows=text.trim().split('\\n').map(function(r){return r.split(',').map(function(c){return c.replace(/^"|"$/g,'').replace(/""/g,'"');});});
    var head=rows[0],body=rows.slice(1);
    el.innerHTML='<table><thead><tr>'+head.map(function(h){return '<th>'+he(h)+'</th>';}).join('')+'</tr></thead><tbody>'+body.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+he(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';
    return;
  }
  try{
    var data=JSON.parse(text);
    if(T==='widget-conversations'&&data.sessions){
      el.innerHTML=data.sessions.map(function(s){
        return '<div class="session"><div class="s-hdr" onclick="var b=this.nextElementSibling;b.style.display=b.style.display===\'none\'?\'flex\':\'none\'"><span class="s-id">'+he(s.sessionId)+'</span><span class="s-meta">'+fd(s.startedAt)+' &middot; '+s.messageCount+' msg</span></div><div class="s-body" style="display:none">'+s.messages.map(function(m){return '<div class="msg '+m.role+'"><div class="msg-role">'+(m.role==='user'?'Usuario':'Agente')+'</div><div>'+he(m.content)+'</div><div class="msg-time">'+fd(m.at)+'</div></div>';}).join('')+'</div></div>';
      }).join('');
      return;
    }
    el.innerHTML='<pre>'+he(JSON.stringify(data,null,2))+'</pre>';
  }catch(ex){
    el.innerHTML='<pre>'+he(text)+'</pre>';
  }
}
</script>
</body>
</html>`;
}
