// Serve the app locally over HTTP so a real browser can drive it.
//
// Opening index.html from disk does NOT work: service workers, fetch() and the
// sync layer all need a real http:// origin. This is the Launch step of
// docs/verify/VERIFYING.md.
//
//   node scripts/serve.mjs            -> http://localhost:8790
//   PORT=9000 node scripts/serve.mjs  -> http://localhost:9000
//
// Port 8790 per the fleet's Nomenclature Standard §1b (2026-09-01) -- was
// 8866 before that ruling.
//
// No dependencies, on purpose: this repo has no build step and no runtime deps.
import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { resolveSafePath, isWithinRoot } from './lib/safe-static-path.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 8790);

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
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    // Never serve anything outside the repo, and never serve secrets even from
    // inside it — this server is a test tool, not a web host. Full logic (and
    // its history: the 2026-09-01 dotfile fix, the 0902-3 sibling-directory-
    // prefix fix) lives in scripts/lib/safe-static-path.mjs, split out so it
    // can be unit tested against synthetic paths -- ROOT here is fixed to this
    // repo's own directory, so a test could never point a real server at a
    // scratch "sibling directory" to prove that bug.
    const file = resolveSafePath(ROOT, urlPath);
    if (!file) { res.writeHead(403).end('forbidden'); return; }
    await stat(file);
    // realpath AFTER stat confirms the file exists (realpath throws on a
    // missing path, which must 404 like any other miss, not fall through to
    // the same 403 as a real containment violation). Catches a symlink that
    // sits inside the repo but resolves somewhere outside it -- resolveSafePath
    // above only sees the symlink's own path, never its target.
    const real = await realpath(file);
    if (!isWithinRoot(ROOT, real)) { res.writeHead(403).end('forbidden'); return; }
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

// Refuse a busy port rather than quietly attaching to whatever is there.
// A sibling app's dev server answering on our port is how a verify pass ends up
// grading the wrong application and reporting a confident pass.
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('port ' + PORT + ' is already in use — something else is serving there.');
    console.error('Stop it, or pick another port:  PORT=8877 node scripts/serve.mjs');
    process.exit(1);
  }
  console.error('server failed:', e.message);
  process.exit(1);
});

// 2026-09-01 HIGH, found live: with no host argument, Node binds to ALL
// interfaces (0.0.0.0), so this file server -- meant only for this machine to
// talk to itself -- was reachable by anyone on the same wifi/LAN. Proved with
// `netstat`: 0.0.0.0:8866 LISTENING. Bound to loopback only now; nothing that
// uses this server (the local browser, the nightly-test-kids robot, this
// repo's own tests) needs anything more than 127.0.0.1.
server.listen(PORT, '127.0.0.1', () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
