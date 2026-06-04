/* js/achievement-logic.js — pure achievement engine. No DOM, no storage. Dual-mode. */
(function () {
  'use strict';

  function emptyState() {
    return { unlocked:{}, counters:{}, repeats:{}, streak:{ last:null, current:0, best:0 }, xp:0, rank:'sprout' };
  }
  function clone(s) {
    return {
      unlocked: Object.assign({}, s.unlocked),
      counters: Object.assign({}, s.counters),
      repeats: Object.assign({}, s.repeats || {}),
      streak: Object.assign({}, s.streak || { last:null, current:0, best:0 }),
      xp: s.xp || 0,
      rank: s.rank || 'sprout'
    };
  }
  function rankForXp(xp, ranks) {
    var chosen = ranks[0];
    for (var i = 0; i < ranks.length; i++) if (xp >= ranks[i].minXp) chosen = ranks[i];
    return chosen;
  }
  function _apply(state, def, out) {
    if (!def || state.unlocked[def.id]) return false;
    state.unlocked[def.id] = { at: 0 };
    state.xp += (def.xp || 0);
    out.push(def);
    return true;
  }
  function _reconcileRank(state, defsApi, out) {
    var ranks = defsApi.VB_RANKS;
    var newRank = rankForXp(state.xp, ranks);
    state.rank = newRank.id;
    ranks.forEach(function (r) {
      if (r.minXp > 0 && state.xp >= r.minXp) {
        var rdef = defsApi.byId('rank.' + r.id);
        if (rdef) _apply(state, rdef, out);
      }
    });
  }
  function firstPlay(prev, activityId, defsApi) {
    var state = clone(prev), out = [];
    _apply(state, defsApi.byId(activityId + '.first'), out);
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }
  function record(prev, counterKey, amount, defsApi) {
    var state = clone(prev), out = [];
    var before = state.counters[counterKey] || 0;
    var after = before + (amount == null ? 1 : amount);
    state.counters[counterKey] = after;
    defsApi.byCounter(counterKey).forEach(function (def) {
      if (after >= def.threshold) _apply(state, def, out);
    });
    // repeatable "star" ribbon: one per `every` successes, tracked as a count
    // (bypasses the one-shot unlocked map so it can re-fire and show ×N).
    var rep = defsApi.byId(counterKey + '.repeat');
    if (rep && rep.every > 0) {
      var earnedN = Math.floor(after / rep.every);
      var haveN = state.repeats[counterKey] || 0;
      if (earnedN > haveN) {
        state.repeats[counterKey] = earnedN;
        state.xp += (rep.xp || 0) * (earnedN - haveN);
        out.push(Object.assign({}, rep, { count: earnedN, repeated: true }));
      }
    }
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }
  function mastery(prev, achievementId, defsApi) {
    var state = clone(prev), out = [];
    _apply(state, defsApi.byId(achievementId), out);
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }
  function _daysBetween(a, b) {
    var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / 86400000);
  }
  function touchStreak(prev, todayISO, defsApi) {
    var state = clone(prev), out = [];
    var st = state.streak;
    if (st.last === todayISO) {
      // same day, no change
    } else if (st.last && _daysBetween(st.last, todayISO) === 1) {
      st.current += 1;
    } else {
      st.current = 1;
    }
    st.last = todayISO;
    if (st.current > st.best) st.best = st.current;
    defsApi.VB_ACHIEVEMENTS.forEach(function (def) {
      if (def.type === 'streak' && st.current >= def.days) _apply(state, def, out);
    });
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }

  var API = {
    emptyState: emptyState, rankForXp: rankForXp,
    firstPlay: firstPlay, record: record, mastery: mastery, touchStreak: touchStreak
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else (typeof self !== 'undefined' ? self : this).vbLogic = API;
})();
