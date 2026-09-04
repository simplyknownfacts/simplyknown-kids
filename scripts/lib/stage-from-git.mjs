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
  const tracked = execFileSync('git', ['ls-files', '-z', '--', ...publishList], { cwd, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  let files = 0;
  for (const rel of tracked) {
    let blob;
    try { blob = execFileSync('git', ['show', commitSha + ':' + rel], { cwd, maxBuffer: 256 * 1024 * 1024 }); }
    catch { continue; } // tracked in general but not part of this exact commit's tree — skip
    const dest = path.join(outDir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, blob);
    files++;
  }
  return { files, tracked };
}
