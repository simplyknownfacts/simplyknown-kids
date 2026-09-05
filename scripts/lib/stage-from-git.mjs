// Codex 0903-3, HIGH fix, extracted so it's unit-testable against a scratch
// repo instead of only provable by running the real (interactive, network-
// touching) scripts/promote.mjs end to end.
//
// Builds a publish directory straight from git's own object database at a
// given commit -- never fs.copyFileSync from the working tree. `git show
// <sha>:<path>` reads a blob's exact committed bytes regardless of what
// disk currently says, so a file changing after the last clean-tree check
// -- mid-stage, mid-upload -- can no longer ship anything that was not
// actually reviewed. Returns a raw Buffer per file (no encoding forced),
// so binary assets (images, fonts, audio) come through byte-for-byte.
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function stageFromGitHead(cwd, outDir, commitSha, publishList) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  // Codex 0905-4, HIGH fix: enumerate from the TARGET COMMIT's own tree (`git ls-tree`), never
  // `git ls-files` (the mutable INDEX). The index can drift from that commit at any moment after
  // the promote gate's clean-tree check ran — a `git add`, a `git rm --cached`, a branch switch
  // in another window — with nothing re-checking it before this function reads bytes. Reading the
  // list from the commit's own tree object instead means there is no longer a second, independent
  // source of truth that can disagree with the commit being shipped.
  const tracked = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', commitSha, '--', ...publishList], { cwd, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  let files = 0;
  for (const rel of tracked) {
    let blob;
    try { blob = execFileSync('git', ['show', commitSha + ':' + rel], { cwd, maxBuffer: 256 * 1024 * 1024 }); }
    catch (e) {
      // The commit's own tree just named this path — a blob it cannot then be read for is not a
      // skippable oddity (a corrupt/incomplete object store, a shallow clone missing a blob). A
      // production build that silently omits a file it claims to ship is worse than one that
      // refuses outright, so this aborts the whole build and names the file, rather than
      // `continue`-ing past it into an incomplete site.
      rmSync(outDir, { recursive: true, force: true });
      throw new Error(`stageFromGitHead: commit ${commitSha} lists "${rel}" but its blob could not be read (${e.message}) — aborting, not shipping an incomplete site.`);
    }
    const dest = path.join(outDir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, blob);
    files++;
  }
  return { files, tracked };
}
