/**
 * Diagnóstico de credenciales Cloudinary.
 * Uso (en el servidor donde corre npm, con tu .env):
 *   node --env-file=.env scripts/test-cloudinary.mjs
 *
 * Imprime el motivo EXACTO si la subida falla (credenciales inválidas, red, etc.).
 */
import { v2 as cloudinary } from 'cloudinary';

const name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const key = process.env.CLOUDINARY_API_KEY?.trim();
const secret = process.env.CLOUDINARY_API_SECRET?.trim();

console.log('— Variables detectadas —');
console.log('CLOUDINARY_CLOUD_NAME :', name || '(VACÍO)');
console.log('CLOUDINARY_API_KEY    :', key ? `${key.slice(0, 4)}…${key.slice(-2)} (${key.length} chars)` : '(VACÍO)');
console.log('CLOUDINARY_API_SECRET :', secret ? `presente (${secret.length} chars)` : '(VACÍO)');

if (!name || !key || !secret) {
  console.error('\n❌ Faltan una o más variables CLOUDINARY_* en el entorno.');
  process.exit(1);
}

cloudinary.config({ cloud_name: name, api_key: key, api_secret: secret, secure: true });

// PNG 1x1 para la prueba
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

console.log('\n— Probando subida real a Cloudinary… —');
cloudinary.uploader
  .upload_stream(
    { folder: 'botiva/_diagnostic', resource_type: 'image', overwrite: true, public_id: 'diag-test' },
    (err, res) => {
      if (err || !res) {
        console.error('\n❌ FALLÓ la subida. Motivo real:');
        console.error('   ', err?.message || err);
        if (err?.http_code) console.error('    http_code:', err.http_code);
        console.error('\nCausas típicas: cloud_name/api_key/api_secret incorrectos,');
        console.error('o el servidor no tiene salida HTTPS hacia api.cloudinary.com.');
        process.exit(1);
      }
      console.log('\n✅ OK — Cloudinary funciona. URL de prueba:');
      console.log('   ', res.secure_url);
      process.exit(0);
    },
  )
  .end(png);
