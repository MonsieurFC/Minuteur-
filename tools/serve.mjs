// Mini-serveur statique pour tester la PWA (localhost = contexte sécurisé).
// Usage : node tools/serve.mjs [port]   →   http://localhost:8321
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = normalize(decodeURIComponent(url.pathname));
    if (p === '/' || p === '\\') p = '/index.html';
    const file = join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const st = await stat(file).catch(() => null);
    const target = st && st.isDirectory() ? join(file, 'index.html') : file;
    const data = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(port, () => {
  console.log(`Minuteur Totoro → http://localhost:${port}`);
  console.log('Sur le téléphone (même Wi-Fi) : http://<IP-du-pc>:' + port + ' — nécessite HTTPS pour installer la PWA.');
});
