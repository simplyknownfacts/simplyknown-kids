// Song Hut sleep timer — set it, and the music puts itself to bed.
//
// Two rules shaped this file:
//
// 1. THE END TIME IS A WALL-CLOCK STAMP, never a number counted down in memory.
//    A tablet at bedtime gets its screen turned off and the tab backgrounded,
//    and browsers throttle or suspend JS timers when that happens — so
//    "subtract one every second" quietly drifts, stalls, or stops dead. Storing
//    the MOMENT it ends (Date.now() + minutes) means the answer is still right
//    after the tab has been asleep for ten minutes, and survives a reload.
//    Every progress calculation below re-reads the clock for the same reason.
//
// 2. IT FADES, IT DOES NOT CUT. Music dropping to silence wakes a nearly-asleep
//    child. Volume ramps to zero over a few seconds, then the media is paused
//    and its original volume restored, so the next play isn't mysteriously mute.
//
// Storage key: vb_sleep_timer. The vb_ prefix is mandatory (TECH-STACK.md →
// "Naming"), and like every other vb_ key it must never be renamed without a
// migration — renaming loses whatever the key holds on every device.
//
// The page owns the buttons and the wording; this file owns the clock. It talks
// back by dispatching a 'vb:sleep-timer' event on `document`, with
// detail.phase = 'set' | 'tick' | 'fading' | 'done' | 'off'.

(function () {
  'use strict';

  const KEY      = 'vb_sleep_timer';
  const OPTIONS  = [5, 10, 20, 30];   // minutes offered to a grown-up
  const FADE_MS  = 4000;              // gentle fade-out, not a cliff edge
  const TICK_MS  = 1000;
  const MAX_MIN  = 12 * 60;           // sanity clamp on anything read back

  // Media a page hands us explicitly. Detached `new Audio()` elements (the Yoto
  // mini-player uses one) are invisible to querySelectorAll, so they can only be
  // faded if the page registers them.
  const extra = [];

  let tickTimer = null;
  let fade      = null;    // { startedAt, timer, saved: [{ el, volume }] }
  let sleeping  = false;   // true from "music stopped" until the page dismisses it

  // ── storage ───────────────────────────────────────────────────────────────
  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw.endsAt !== 'number' || typeof raw.minutes !== 'number') return null;
      if (!isFinite(raw.endsAt) || raw.minutes <= 0 || raw.minutes > MAX_MIN) return null;
      return raw;
    } catch (e) { return null; }
  }

  function write(value) {
    try {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  }

  // ── talking to the page ───────────────────────────────────────────────────
  function emit(phase) {
    try {
      document.dispatchEvent(new CustomEvent('vb:sleep-timer', {
        detail: { phase: phase, minutes: minutes(), remainingMs: remainingMs(), sleeping: sleeping }
      }));
    } catch (e) {}
  }

  // ── the media we are responsible for ──────────────────────────────────────
  function mediaElements() {
    let list = [];
    try { list = Array.prototype.slice.call(document.querySelectorAll('audio, video')); } catch (e) {}
    extra.forEach(function (el) { if (el && list.indexOf(el) === -1) list.push(el); });
    return list;
  }

  // ── fade out, then pause ──────────────────────────────────────────────────
  function startFade() {
    if (fade) return;                       // already fading; let it finish
    const saved = mediaElements().map(function (el) {
      return { el: el, volume: (typeof el.volume === 'number' ? el.volume : 1) };
    });
    fade = { startedAt: Date.now(), saved: saved, timer: null };
    emit('fading');
    // setInterval, not requestAnimationFrame: rAF is frozen in a hidden tab,
    // which is exactly when this runs. Progress is measured off the clock, so a
    // throttled interval still finishes the fade — it just takes a tick longer.
    fade.timer = setInterval(stepFade, 200);
    stepFade();
  }

  function stepFade() {
    if (!fade) return;
    const progress = (Date.now() - fade.startedAt) / FADE_MS;
    if (progress < 1) {
      fade.saved.forEach(function (s) {
        try { s.el.volume = Math.max(0, Math.min(1, s.volume * (1 - progress))); } catch (e) {}
      });
      return;
    }
    finishFade();
  }

  function finishFade() {
    if (!fade) return;
    clearInterval(fade.timer);
    const saved = fade.saved;
    fade = null;
    saved.forEach(function (s) {
      try { s.el.pause(); } catch (e) {}
      try { s.el.volume = s.volume; } catch (e) {}   // restore: next play isn't silent
    });
    // A voice prompt mid-flight would blurt out after the music stopped.
    try { if (typeof cancelSpeak === 'function') cancelSpeak(); } catch (e) {}
    // The shared now-playing record is read by every other page's mini-player.
    // Leave it saying "playing" and the next screen resumes the tape we just
    // put to sleep.
    try {
      if (window.yotoPlayer && typeof window.yotoPlayer.getState === 'function') {
        const state = window.yotoPlayer.getState();
        if (state) { state.playing = false; window.yotoPlayer.publish(state); }
      }
    } catch (e) {}
    write(null);
    stopTick();
    sleeping = true;
    emit('done');
  }

  function cancelFade() {
    if (!fade) return;
    clearInterval(fade.timer);
    fade.saved.forEach(function (s) { try { s.el.volume = s.volume; } catch (e) {} });
    fade = null;
  }

  // ── the clock ─────────────────────────────────────────────────────────────
  function tick() {
    if (fade) return;                       // fading; nothing left to count
    const state = read();
    if (!state) { stopTick(); return; }
    if (Date.now() >= state.endsAt) { startFade(); return; }
    emit('tick');
  }

  function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(tick, TICK_MS);
  }

  function stopTick() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = null;
  }

  // ── public API ────────────────────────────────────────────────────────────
  function remainingMs() {
    const state = read();
    return state ? Math.max(0, state.endsAt - Date.now()) : 0;
  }

  function minutes() {
    const state = read();
    return state ? state.minutes : 0;
  }

  function set(mins) {
    const n = Number(mins);
    if (!isFinite(n) || n <= 0) return cancel();
    cancelFade();
    sleeping = false;
    write({ minutes: n, endsAt: Date.now() + n * 60000 });
    startTick();
    emit('set');
  }

  function cancel() {
    cancelFade();
    sleeping = false;
    write(null);
    stopTick();
    emit('off');
  }

  function dismiss() {          // page closing the "time to sleep" moment
    sleeping = false;
    emit('off');
  }

  function register(el) {
    if (el && extra.indexOf(el) === -1) extra.push(el);
  }

  window.vbSleepTimer = {
    KEY: KEY,
    OPTIONS: OPTIONS.slice(),
    FADE_MS: FADE_MS,
    set: set,
    cancel: cancel,
    dismiss: dismiss,
    register: register,
    minutes: minutes,
    remainingMs: remainingMs,
    isSleeping: function () { return sleeping; },
    isFading: function () { return !!fade; }
  };

  // ── waking up ─────────────────────────────────────────────────────────────
  // A timer found already expired on a FRESH page load ran out while the app was
  // closed. Nothing is playing on a page that just loaded, so staging a "time to
  // sleep" moment hours late would only confuse — clear it and start from off.
  // (A timer that expires while the page is merely backgrounded is caught by
  // tick() or the visibility handler below, and does fade + pause properly.)
  const startup = read();
  if (startup) {
    if (Date.now() >= startup.endsAt) { write(null); }
    else { startTick(); }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick();
  });
  window.addEventListener('pageshow', function () {
    if (read()) { startTick(); tick(); }
  });
})();
