// Minimal static file server for the DejaView viewer (ES modules need HTTP).
// Usage: node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.djvu': 'image/vnd.djvu',
  '.djv': 'image/vnd.djvu',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    const full = normalize(join(root, path));
    if (!full.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
    const info = await stat(full);
    if (info.isDirectory()) { res.writeHead(403).end('Forbidden'); return; }
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, () => {
  console.log(`DejaView serving ${root}`);
  console.log(`→ http://localhost:${port}/         (open a file)`);
  console.log(`→ http://localhost:${port}/?demo     (auto-load the bundled sample)`);
});
