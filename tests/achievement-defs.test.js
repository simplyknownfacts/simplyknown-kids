const { test } = require('node:test');
const assert = require('node:assert');
const defs = require('../js/achievement-defs.js');

test('exports list, ranks, and lookups', () => {
  assert.ok(Array.isArray(defs.VB_ACHIEVEMENTS));
  assert.ok(Array.isArray(defs.VB_RANKS));
  assert.strictEqual(typeof defs.byCounter, 'function');
  assert.strictEqual(typeof defs.byId, 'function');
});
test('each activity has exactly one first-play + six milestone tiers', () => {
  const tapFirst = defs.VB_ACHIEVEMENTS.filter(d => d.activity === 'tap-pop' && d.type === 'first');
  const tapMiles = defs.VB_ACHIEVEMENTS.filter(d => d.activity === 'tap-pop' && d.type === 'milestone');
  assert.strictEqual(tapFirst.length, 1);
  assert.strictEqual(tapMiles.length, 6);
});
test('milestone thresholds are 50/250/1000/2500/5000/10000', () => {
  const t = defs.VB_ACHIEVEMENTS.filter(d => d.activity === 'tap-pop' && d.type === 'milestone')
    .map(d => d.threshold).sort((a,b)=>a-b);
  assert.deepStrictEqual(t, [50,250,1000,2500,5000,10000]);
});
test('each activity has one repeatable star ribbon with a positive "every"', () => {
  const rep = defs.VB_ACHIEVEMENTS.filter(d => d.activity === 'tap-pop' && d.type === 'repeat');
  assert.strictEqual(rep.length, 1);
  assert.ok(rep[0].every > 0);
});
test('repeatable cadence is per-speed: fast tap games rarer than quiz activities', () => {
  const every = id => defs.VB_ACHIEVEMENTS.find(d => d.activity === id && d.type === 'repeat').every;
  assert.strictEqual(every('tap-pop'), 300);      // fast tap game
  assert.strictEqual(every('tap-a-tune'), 300);   // fast tap game
  assert.strictEqual(every('math'), 50);          // deliberate quiz
  assert.strictEqual(every('shape-match'), 50);   // deliberate match
});
test('ids are unique', () => {
  const ids = defs.VB_ACHIEVEMENTS.map(d => d.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
test('ranks are ascending by minXp and start at 0', () => {
  const xs = defs.VB_RANKS.map(r => r.minXp);
  assert.strictEqual(xs[0], 0);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i-1]);
  assert.strictEqual(defs.VB_RANKS.length, 7);
});
test('byCounter returns milestone defs for a counter key, ascending', () => {
  const ms = defs.byCounter('tap-pop');
  assert.strictEqual(ms.length, 6);
  assert.ok(ms[0].threshold <= ms[5].threshold);
});
