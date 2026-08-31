// Serve the app locally over HTTP so a real browser can drive it.
//
// Opening index.html from disk does NOT work: service workers, fetch() and the
// sync layer all need a real http:// origin. This is the Launch step of
// docs/verify/VERIFYING.md.
//
//   node scripts/serve.mjs            -> http://localhost:8866
//   PORT=9000 node scripts/serve.mjs  -> http://localhost:9000
//
// No dependencies, on purpose: this repo has no build step and no runtime deps.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 8866);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    // Never serve anything outside the repo, and never serve secrets even from
    // inside it — this server is a test tool, not a web host.
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT) || /[\\/](secrets|\.git|node_modules)[\\/]/.test(file + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    await stat(file);
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // Always fresh: a stale cached copy is the classic false pass.
      'Cache-Control': 'no-store',
    }).end(body);
  } catch {
    // A real 404, unlike Cloudflare Pages which answers 200 for unknown paths.
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
