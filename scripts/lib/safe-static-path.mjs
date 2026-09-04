// Pure path-safety logic for scripts/serve.mjs, split out so it can be unit
// tested with synthetic root/file strings -- serve.mjs's real ROOT is fixed
// to this repo's own directory (no env override), so a test importing
// serve.mjs directly would start a real server as a side effect and could
// never point it at a scratch "sibling directory" to prove the bug below.
//
// Codex 0902-3, found live: the original check was `file.startsWith(ROOT)`,
// a plain TEXT prefix comparison -- a sibling directory whose name merely
// starts with this repo's name (e.g. Kids_App-old) has a path that ALSO
// starts with the string ROOT, even though it sits entirely outside ROOT.
import path from 'node:path';

// True containment: path.relative() from root to candidate never starts
// with ".." (or comes back absolute -- Windows' different-drive case) only
// when candidate is genuinely inside root.
export function isWithinRoot(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Everything scripts/serve.mjs refuses to serve, for reasons that have
// nothing to do with whether the file exists on disk. Returns the resolved
// absolute path if the URL passes every check, or null if it must be
// refused (caller answers 403 for null, 404 only for a real missing file).
export function resolveSafePath(root, urlPath) {
  let rel = urlPath;
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(root, '.' + rel);
  if (!isWithinRoot(root, file)) return null;
  const segments = file.slice(root.length).split(/[\\/]/);
  if (segments.some((s) => s.startsWith('.') && s !== '')) return null; // dotfiles (.env, .git, ...)
  if (/\.(key|pem|p12|pfx|crt)$/i.test(file)) return null; // credential-shaped extensions, wherever they sit
  if (/[\\/](secrets|node_modules)[\\/]/.test(file + path.sep)) return null;
  return file;
}
