import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('child-experience inventory follows every registry entry without a hard-coded count', () => {
  const profiles = read('js/profiles.js');
  const review = read('docs/child-experience-review-2026-09.md');
  const entries = [...profiles.matchAll(/\{ id:'([^']+)'[^\n]+file:'([^']+)'[^\n]+section:'([^']+)'/g)]
    .map(([, id, file, section]) => ({ id, file, section }));

  assert.ok(entries.length > 0, 'activity registry should be readable');
  for (const { id, file, section } of entries) {
    assert.match(review, new RegExp('`' + section.replace('learn', 'learning') + '/' + file.replace('.', '\\.') + '`'),
      `inventory is missing ${id}`);
  }
  assert.match(review, /Watch \(`videos\/index\.html`\)/);
  assert.match(review, /Listening Hut \(`listen\/index\.html`\)/);
  assert.match(review, /is restored in the redesigned Games menu/i);
});

test('animal sound quiz asks without announcing the answer and pet habitat answers are not farm claims', () => {
  const src = read('learning/animal-sounds.html');
  assert.match(src, /speakInstruction\(promptText\)/);
  assert.match(src, /Promise\.resolve\(promptPlayback\)[\s\S]+playAnimalSound\(items\[answerIdx\]\)/);
  assert.doesNotMatch(src, /if \(opts\.replay\) setTimeout\(\(\) => speakAnimal/);
  assert.match(src, /dog:\{g:'mammal'\}, cat:\{g:'mammal'\}/);
});

test('changed quiz pages protect essential prompts and one completion per round', () => {
  for (const path of [
    'learning/hello-colors.html', 'learning/animal-sounds.html', 'learning/days.html',
    'learning/math.html', 'learning/clock.html', 'learning/spelling.html', 'learning/money.html',
  ]) {
    const src = read(path);
    assert.match(src, /speakInstruction\(/, `${path} must protect an essential prompt`);
    assert.match(src, /roundSettled|let settled/, `${path} must close a completed round`);
  }
});

test('wrong answers teach or permit retry in the improved games', () => {
  const surprise = read('games/surprise-pop.html');
  assert.match(surprise, /b\.disabled = true;[\s\S]+does not match the hidden shape[\s\S]+speak\('Try again!'\)/);
  assert.doesNotMatch(surprise, /finishReveal\(s, ok\)/);

  const memory = read('games/memory-match.html');
  assert.match(memory, /Not a pair\. Remember where they are/);
  assert.match(memory, /matched} \/ \$\{PAIRS\}/);

  const tune = read('games/tap-a-tune.html');
  assert.match(tune, /That was \$\{NOTES\[i\]\.name\}/);
});

test('Hello Colors avoids ambiguous examples and scales toddler color choices', () => {
  const colors = read('learning/hello-colors.html');
  assert.doesNotMatch(colors, /🦄|Unicorn/, 'the pink-and-purple unicorn is not a clear purple example');
  assert.match(colors, /tier === 2 \? 2 : tier === 3 \? 3 : 4/, 'toddler choice count must scale from two to three');
  assert.match(colors, /dataset\.color/, 'color choices need explicit color identity');
  assert.doesNotMatch(colors, /bg\.style\.background\s*=/, 'rounds must not repaint the normal app background');
});
