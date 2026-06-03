/* js/progress.js — window.vbProgress. Bridges activities to the logic engine,
   persists to the active profile, fires celebrations. Safe no-op if no profile. */
(function () {
  'use strict';

  function defsApi() { return (window.vbDefs) || null; }
  function logic()   { return (window.vbLogic) || null; }

  function load() {
    var p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
    if (!p) return null;
    var L = logic();
    var state = p.achievements && p.achievements.unlocked
      ? p.achievements
      : (L ? L.emptyState() : null);
    return { profile: p, state: state };
  }

  function persist(profileId, state, unlocked) {
    var now = Date.now();
    (unlocked || []).forEach(function (d) {
      if (state.unlocked[d.id] && !state.unlocked[d.id].at) state.unlocked[d.id].at = now;
    });
    if (typeof updateProfile === 'function') updateProfile(profileId, { achievements: state });
  }

  function celebrate(unlocked) {
    if (unlocked && unlocked.length && window.vbCelebrate) window.vbCelebrate.show(unlocked);
  }

  // signature of the parts of state that aren't covered by `unlocked` — used to
  // skip a profile write (and the debounced cloud push) when nothing changed,
  // e.g. firstPlay on a repeat visit, mastery re-fire, or touchStreak same-day.
  function _sig(s) {
    return s.xp + '|' + s.rank + '|' + JSON.stringify(s.counters) +
           '|' + (s.streak ? s.streak.last + ',' + s.streak.current : '');
  }

  function run(fnName, args) {
    var ctx = load(), L = logic(), D = defsApi();
    if (!ctx || !ctx.state || !L || !D) return;
    var before = _sig(ctx.state);
    var res = L[fnName].apply(null, [ctx.state].concat(args, [D]));
    var changed = res.unlocked.length > 0 || _sig(res.state) !== before;
    if (changed) persist(ctx.profile.id, res.state, res.unlocked);
    if (res.unlocked.length) celebrate(res.unlocked);
  }

  function todayISO() {
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  window.vbProgress = {
    firstPlay: function (activityId) { run('firstPlay', [activityId]); },
    record:    function (counterKey, amount) { run('record', [counterKey, amount == null ? 1 : amount]); },
    mastery:   function (achievementId) { run('mastery', [achievementId]); },
    touchStreak: function () { run('touchStreak', [todayISO()]); },
    getState:  function () { var c = load(); return c ? c.state : null; }
  };
})();
