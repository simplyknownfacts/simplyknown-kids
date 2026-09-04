// Shared PIN-lockout state.
//
// Codex 0825-9: the exit-PIN flow (home.html's exitApp()) had NO lockout at
// all while parent/settings.html's gate did -- a kid locked out of settings
// could just walk over to the exit button and brute-force the same PIN
// there instead. Both doors now share ONE counter under this single key, so
// trying "the other door" can never reset or dodge the count.
//
// 5 wrong attempts -> 5 min lock. 10 wrong -> 30 min lock. Never auto-clears
// on lock expiry -- only a correct PIN (or the recovery phrase, where that
// exists) clears the attempt count, matching parent/settings.html's
// original behavior this was extracted from.
(function () {
  'use strict';
  const KEY = 'vb_pin_lockout';

  function getLockout() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { attempts: 0, lockedUntil: 0 }; }
    catch (e) { return { attempts: 0, lockedUntil: 0 }; }
  }
  function setLockout(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function clearLockout() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  function isLocked() {
    return getLockout().lockedUntil > Date.now();
  }
  function remainingSec() {
    return Math.max(0, Math.ceil((getLockout().lockedUntil - Date.now()) / 1000));
  }
  function recordFailedAttempt() {
    const l = getLockout();
    l.attempts = (l.attempts || 0) + 1;
    if (l.attempts >= 10) l.lockedUntil = Date.now() + 30 * 60 * 1000;
    else if (l.attempts >= 5) l.lockedUntil = Date.now() + 5 * 60 * 1000;
    setLockout(l);
    return l;
  }

  window.vbPinLockout = {
    KEY: KEY,
    getLockout: getLockout,
    setLockout: setLockout,
    clearLockout: clearLockout,
    isLocked: isLocked,
    remainingSec: remainingSec,
    recordFailedAttempt: recordFailedAttempt,
  };
})();
