// Codex 0903-3, HIGH. scripts/promote.mjs used to stage for deploy via
// `npm run stage` -- fs.copyFileSync straight from the WORKING TREE
// (scripts/stage-site.mjs). Every check up to that point proves the tree
// was clean a MOMENT AGO; staging and the network upload after it take
// real wall-clock time, and nothing re-checked disk at the instant those
// bytes were actually read. A file changing after the last clean-tree
// check -- mid-stage, mid-upload -- could ship something nobody verified.
//
// scripts/lib/stage-from-git.mjs (stageFromGitHead) is the fix: it reads
// each file straight out of git's object database (`git show <sha>:<path>`)
// instead of off disk, so what actually gets staged is provably the
// committed content, immune to whatever the working tree says by the time
// staging runs. This proves it directly: commit a file, then dirty the
// SAME file on disk WITHOUT committing (this test's stand-in for "changed
// after the last check"), and confirm the staged output has the committed
// bytes, not the dirty ones.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stageFromGitHead } from '../scripts/lib/stage-from-git.mjs';

// The exact OLD logic (scripts/stage-site.mjs's runnable form, before this
// fix), kept here ONLY to prove what it used to ship -- never imported from
// the real script, which no longer stages this way for prod.
function oldCopyFromWorkingTree(dir, out, files) {
  for (const rel of files) {
    const dest = path.join(out, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(path.join(dir, rel), dest);
  }
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString('utf8').trim();
}

const scratchDirs = [];
after(() => { for (const d of scratchDirs) rmSync(d, { recursive: true, force: true }); });

function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kids-stage-from-git-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  mkdirSync(path.join(dir, 'js'), { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), '<html>committed v1</html>');
  writeFileSync(path.join(dir, 'js', 'app.js'), 'console.log("committed");');
  // A real binary file, to prove the extraction is byte-for-byte, not
  // mangled by an encoding (the old sh() helper this repo uses elsewhere
  // forces utf8, which corrupts binary content).
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  writeFileSync(path.join(dir, 'icon-192.png'), png);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'initial']);
  const headSha = git(dir, ['rev-parse', 'HEAD']);
  return { dir, headSha, png };
}

test('staged output matches the COMMITTED content, not a file dirtied on disk afterward', () => {
  const { dir, headSha } = makeScratchRepo();
  scratchDirs.push(dir);
  const out = path.join(dir, '.publish-test');

  // Simulate the exact race: something changes the working tree file AFTER
  // the commit this deploy is supposed to ship -- never committed.
  writeFileSync(path.join(dir, 'index.html'), '<html>DIRTY -- changed after the last check!</html>');

  // Sanity check: prove the OLD approach really did exhibit this bug --
  // the actual live gap, not just a hypothetical.
  const oldOut = path.join(dir, '.publish-old-test');
  oldCopyFromWorkingTree(dir, oldOut, ['index.html']);
  assert.equal(readFileSync(path.join(oldOut, 'index.html'), 'utf8'), '<html>DIRTY -- changed after the last check!</html>',
    'sanity check: the old copyFileSync-from-working-tree approach must actually ship the dirty content for this proof to mean anything');

  const { files } = stageFromGitHead(dir, out, headSha, ['index.html', 'js', 'icon-192.png']);
  assert.equal(files, 3);
  const staged = readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.equal(staged, '<html>committed v1</html>',
    'staged content must be the COMMITTED bytes, not what is currently sitting dirty on disk: got "' + staged + '"');
});

test('a binary file round-trips byte-for-byte (not corrupted by a forced text encoding)', () => {
  const { dir, headSha, png } = makeScratchRepo();
  scratchDirs.push(dir);
  const out = path.join(dir, '.publish-test');
  stageFromGitHead(dir, out, headSha, ['icon-192.png']);
  const staged = readFileSync(path.join(out, 'icon-192.png'));
  assert.ok(staged.equals(png), 'the staged binary file must be byte-for-byte identical to the committed blob');
});

test('an untracked file never makes it into the staged output, even inside an allowed directory', () => {
  const { dir, headSha } = makeScratchRepo();
  scratchDirs.push(dir);
  writeFileSync(path.join(dir, 'js', 'never-committed.js'), 'a stray untracked file');
  const out = path.join(dir, '.publish-test');
  stageFromGitHead(dir, out, headSha, ['js']);
  assert.throws(() => readFileSync(path.join(out, 'js', 'never-committed.js')),
    'an untracked file must never appear in the staged output');
});
