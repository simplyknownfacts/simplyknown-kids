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

// Codex 0905-4, HIGH. stageFromGitHead used to enumerate WHICH files to stage via
// `git ls-files` -- the mutable INDEX -- and only afterward read each surviving path's bytes out
// of the target commit. `git ls-files` can drift from the commit's own tree at any time (a `git
// add` or `git rm --cached` after the promote gate's clean-tree check, a branch switch), so a
// file present in the commit but no longer in the index would be silently missing from a
// production build that claims to ship "exactly commit X". This proves the drift directly: a
// file removed from the INDEX (never committed as a removal) must still be staged, because it is
// still part of the target commit's own tree, and a file added ONLY to the index (never
// committed) must never leak into the output.
test('staged output is complete even when the INDEX has been changed after the target commit (git add / git rm --cached without a commit)', () => {
  const { dir, headSha } = makeScratchRepo();
  scratchDirs.push(dir);

  // Simulate an index change AFTER headSha -- exactly the race this finding names: nothing
  // about headSha's own tree changes, but `git ls-files` right now would disagree with it.
  writeFileSync(path.join(dir, 'new-in-index-only.js'), 'staged into the index, never committed');
  git(dir, ['add', 'new-in-index-only.js']);
  git(dir, ['rm', '--cached', '-q', 'js/app.js']); // still present in headSha's tree, gone from the index

  const out = path.join(dir, '.publish-test');
  const { files, tracked } = stageFromGitHead(dir, out, headSha, ['index.html', 'js', 'icon-192.png']);

  assert.ok(tracked.includes('js/app.js'),
    'a file present in the TARGET COMMIT but removed from the index afterward must still be enumerated: ' + tracked.join(','));
  assert.equal(readFileSync(path.join(out, 'js', 'app.js'), 'utf8'), 'console.log("committed");',
    'the committed content must still be staged, not silently dropped');
  assert.ok(!tracked.includes('new-in-index-only.js'),
    'a file only ever staged in the index (never part of the target commit) must not be enumerated: ' + tracked.join(','));
  assert.equal(files, 3, 'exactly the 3 files really in the target commit under this publish list, no more, no fewer');
});

// Codex 0905-4: a path the enumeration step names for THIS commit that turns out unreadable must
// abort the whole build with the file name, never `continue` past it -- an index drift is one way
// to reach that state, but the abort itself must fire on the more general condition ("the commit's
// tree names a path whose blob cannot be read"), regardless of cause. Built with real git plumbing
// (git mktree --missing), not a mock: a tree entry that references a blob sha never written to the
// object database -- `git ls-tree` still lists it (listing a tree never needs the blob's content),
// but `git show <commit>:<path>` genuinely fails to read it, which is exactly the shape of a
// corrupt/incomplete object store or a shallow clone missing a blob.
test('a blob the target commit lists but cannot actually be read is a HARD failure, never a silent skip', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kids-stage-from-git-missing-blob-'));
  scratchDirs.push(dir);
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(path.join(dir, 'real.txt'), 'hello');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'base']);

  const realBlobSha = git(dir, ['hash-object', 'real.txt']);
  const bogusBlobSha = '1111111111111111111111111111111111111111'; // well-formed, never written
  const treeInput = `100644 blob ${realBlobSha}\treal.txt\n100644 blob ${bogusBlobSha}\tmissing.txt\n`;
  const treeSha = execFileSync('git', ['mktree', '--missing'], { cwd: dir, input: treeInput, encoding: 'utf8' }).trim();
  const commitSha = execFileSync('git', ['commit-tree', treeSha, '-m', 'a commit whose tree references a blob the object DB does not have'],
    { cwd: dir, encoding: 'utf8' }).trim();

  const out = path.join(dir, '.publish-test');
  assert.throws(
    () => stageFromGitHead(dir, out, commitSha, ['.']),
    /missing\.txt/,
    'staging must abort and name the unreadable path, not silently continue past it'
  );
});
