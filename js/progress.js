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

  // ---------------------------------------------------------------------
  // Trophy Joy pause-point logic (2026-08-31 spec, approved by master).
  //
  // Nothing here needs any of the 21 activity pages to change: this file and
  // celebrate.js already load on every one of them, so hooking the pause
  // signals here covers the whole app from two files.
  //
  // Every unlock still glints immediately (non-blocking, always safe). The
  // BIG celebration is batched and only fires at an actual pause:
  //   - tiers 3-10: after IDLE_MS of no further unlock (a round-based
  //     quiz's between-question pause and a continuous game's breather both
  //     naturally clear this; a tap-frenzy does not).
  //   - tiers 1-2: idle-firing is OFF entirely (master's ruling — littles
  //     pause constantly, and a timer would ambush a natural break). Only
  //     leaving the page or the next page's load fires it for them.
  //   - ANY tier, as a backstop: leaving the page (pagehide/hidden) hands
  //     the pending batch to sessionStorage instead of trying to render a
  //     UI mid-navigation; whatever page loads next (mirrors js/sync.js's
  //     existing flush-on-close pattern) picks it up and shows it on
  //     arrival — which is inherently a safe, non-interrupting moment,
  //     since the child hasn't started doing anything there yet.
  var IDLE_MS = 2500;
  var PENDING_KEY = 'vb_pending_celebration';
  var _pending = [];
  var _idleTimer = null;

  function _isLittle() {
    try {
      var p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
      return !!(p && typeof tierForAge === 'function' && tierForAge(getAgeMonths(p.birthday)) < 3);
    } catch (e) { return false; }
  }

  function _flushNow() {
    if (!_pending.length) return;
    var batch = _pending; _pending = [];
    clearTimeout(_idleTimer); _idleTimer = null;
    if (window.vbCelebrate) window.vbCelebrate.show(batch);
  }

  function _flushToStorage() {
    if (!_pending.length) return;
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(_pending)); } catch (e) {}
    _pending = [];
    clearTimeout(_idleTimer); _idleTimer = null;
  }

  function _showPendingFromStorage() {
    var raw;
    try { raw = sessionStorage.getItem(PENDING_KEY); } catch (e) { raw = null; }
    if (!raw) return;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
    var batch;
    try { batch = JSON.parse(raw); } catch (e) { return; }
    if (batch && batch.length && window.vbCelebrate) window.vbCelebrate.show(batch);
  }

  function _armIdleTimer() {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(_flushNow, IDLE_MS);
  }

  function celebrate(unlocked) {
    if (!unlocked || !unlocked.length) return;
    if (!window.vbCelebrate) return;
    unlocked.forEach(function (d) { window.vbCelebrate.glint(d); });
    _pending = _pending.concat(unlocked);
    if (_isLittle()) return; // no idle-fire for littles — leave/load only
    _armIdleTimer();
  }

  // Codex 0901-8: the idle timer used to reset ONLY on another unlock, so a
  // child who kept tapping/answering/dragging without earning anything else
  // for IDLE_MS got the celebration ambushed on them mid-play — the exact
  // interruption the pause-point design exists to avoid. Any real input
  // pushes the deadline back out too, as long as something is actually
  // pending; nothing to protect (or nowhere for it to fire, for littles)
  // means nothing to reset.
  function _onActivity() {
    if (!_pending.length) return;
    if (_isLittle()) return;
    _armIdleTimer();
  }

  // Runs once per page load — covers "next page's load" for the backstop
  // above, and doubles as "next Home arrival" since home.html loads this
  // file too. Deferred slightly so it never races the page's own on-load
  // setup for a beat.
  if (typeof window !== 'undefined') {
    document.addEventListener('pointerdown', _onActivity, true);
    document.addEventListener('keydown', _onActivity, true);
    if (document.readyState === 'complete') setTimeout(_showPendingFromStorage, 300);
    else window.addEventListener('load', function () { setTimeout(_showPendingFromStorage, 300); });
    window.addEventListener('pagehide', _flushToStorage);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') _flushToStorage();
    });
  }

  // signature of the parts of state that aren't covered by `unlocked` — used to
  // skip a profile write (and the debounced cloud push) when nothing changed,
  // e.g. firstPlay on a repeat visit, mastery re-fire, or touchStreak same-day.
  function _sig(s) {
    return s.xp + '|' + s.rank + '|' + JSON.stringify(s.counters) +
           '|' + JSON.stringify(s.repeats || {}) +
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
