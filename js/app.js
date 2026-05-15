// Navigation
function goTo(path) { window.location.href = path; }
function goHome()    { goTo(rootPath() + 'home.html'); }
function goProfiles(){ goTo(rootPath() + 'index.html'); }

function rootPath() {
  // Works from both root and sub-folders (games/, learning/, art/)
  const depth = window.location.pathname.split('/').length - 2;
  return depth > 0 ? '../'.repeat(depth) : './';
}

// Audio context (lazy init — must be after user gesture on iOS)
let _ctx = null;
function audioCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

function playTone(freq, duration = 0.2, vol = 0.25, type = 'sine') {
  const ctx = audioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + duration);
}

function playPop() {
  const ctx = audioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(700, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.15);
}

function playSuccess() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.3, 0.2), i * 120);
  });
}

function playChime() { playTone(880, 0.4, 0.2); }
function playBoop()  { playTone(330, 0.1, 0.2, 'square'); }

function speak(text, rate = 0.85, pitch = 1.2) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate; u.pitch = pitch;
  window.speechSynthesis.speak(u);
}

// Render a standard back button
function renderBackBtn(dest) {
  const btn = document.createElement('button');
  btn.className = 'back-btn'; btn.textContent = '←';
  btn.setAttribute('aria-label', 'Go back');
  btn.addEventListener('click', () => dest ? goTo(dest) : history.back());
  document.body.appendChild(btn);
}

// Splash a color burst at a point (x, y) on a canvas ctx
function colorBurst(ctx, x, y, color, radius = 60) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}
