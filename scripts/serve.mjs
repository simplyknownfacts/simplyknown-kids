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
    //
    // 2026-09-01 HIGH, found live: this used to only block secrets/, .git/ and
    // node_modules/ as DIRECTORY segments -- a root-level dotfile like .env
    // (which holds the ElevenLabs key, the Cloudflare token and the Gemini
    // key) matched none of those patterns and was served in full. Proved with
    // curl before this fix landed. Now: any path with a segment that starts
    // with "." is refused outright -- the same default real static-file
    // servers use (deny dotfiles unless explicitly allowed), so a future
    // secret file needs no new pattern added here to stay covered.
    const file = path.resolve(ROOT, '.' + rel);
    const segments = file.slice(ROOT.length).split(/[\\/]/);
    const hasDotfile = segments.some(s => s.startsWith('.') && s !== '');
    if (!file.startsWith(ROOT) || hasDotfile
        || /[\\/](secrets|node_modules)[\\/]/.test(file + path.sep)) {
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
