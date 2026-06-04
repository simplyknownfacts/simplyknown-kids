const { test } = require('node:test');
const assert = require('node:assert');
const defs = require('../js/achievement-defs.js');
const logic = require('../js/achievement-logic.js');

const RANKS = defs.VB_RANKS;
function fresh() { return logic.emptyState(); }

test('emptyState is well-formed', () => {
  const s = fresh();
  assert.deepStrictEqual(s.unlocked, {});
  assert.deepStrictEqual(s.counters, {});
  assert.strictEqual(s.xp, 0);
  assert.strictEqual(s.rank, 'sprout');
});
test('firstPlay unlocks once and adds xp', () => {
  let { state, unlocked } = logic.firstPlay(fresh(), 'tap-pop', defs);
  assert.strictEqual(unlocked.length, 1);
  assert.strictEqual(unlocked[0].id, 'tap-pop.first');
  assert.strictEqual(state.xp, 1);
  const again = logic.firstPlay(state, 'tap-pop', defs);
  assert.strictEqual(again.unlocked.length, 0);
  assert.strictEqual(again.state.xp, 1);
});
test('record crosses exactly the tiers passed', () => {
  const { state, unlocked } = logic.record(fresh(), 'tap-pop', 12, defs);
  const ids = unlocked.map(d => d.id).sort();
  assert.deepStrictEqual(ids, ['tap-pop.milestone.bronze','tap-pop.milestone.silver']);
  assert.strictEqual(state.counters['tap-pop'], 12);
});
test('record does not re-unlock already-earned tiers', () => {
  let s = logic.record(fresh(), 'tap-pop', 12, defs).state;
  const r2 = logic.record(s, 'tap-pop', 1, defs);
  assert.strictEqual(r2.unlocked.length, 0);
  assert.strictEqual(r2.state.counters['tap-pop'], 13);
});
test('mastery unlocks a specific ribbon once', () => {
  const r1 = logic.mastery(fresh(), 'math.mastery', defs);
  assert.strictEqual(r1.unlocked.length, 1);
  assert.strictEqual(r1.state.xp, 8);
  const r2 = logic.mastery(r1.state, 'math.mastery', defs);
  assert.strictEqual(r2.unlocked.length, 0);
});
test('streak increments on consecutive day, no double same-day', () => {
  let s = logic.touchStreak(fresh(), '2026-06-01', defs).state;
  assert.strictEqual(s.streak.current, 1);
  s = logic.touchStreak(s, '2026-06-01', defs).state;
  assert.strictEqual(s.streak.current, 1);
  s = logic.touchStreak(s, '2026-06-02', defs).state;
  assert.strictEqual(s.streak.current, 2);
});
test('streak resets after a gap', () => {
  let s = logic.touchStreak(fresh(), '2026-06-01', defs).state;
  s = logic.touchStreak(s, '2026-06-05', defs).state;
  assert.strictEqual(s.streak.current, 1);
});
test('3-day streak unlocks the streak ribbon', () => {
  let s = fresh(); let unlocked = [];
  ['2026-06-01','2026-06-02','2026-06-03'].forEach(d => {
    const r = logic.touchStreak(s, d, defs); s = r.state; unlocked = r.unlocked;
  });
  assert.ok(unlocked.some(d => d.id === 'streak.3'));
});
test('rank flips at threshold and awards rank ribbon once', () => {
  let s = fresh();
  s = logic.firstPlay(s, 'tap-pop', defs).state;
  s = logic.record(s, 'tap-pop', 100, defs).state;
  assert.ok(s.xp >= 15);
  assert.strictEqual(s.rank, 'explorer');
  assert.ok(Object.keys(s.unlocked).includes('rank.explorer'));
});
test('rankForXp picks the highest threshold not exceeding xp', () => {
  assert.strictEqual(logic.rankForXp(0, RANKS).id, 'sprout');
  assert.strictEqual(logic.rankForXp(14, RANKS).id, 'sprout');
  assert.strictEqual(logic.rankForXp(15, RANKS).id, 'explorer');
  assert.strictEqual(logic.rankForXp(999, RANKS).id, 'legend');
});
