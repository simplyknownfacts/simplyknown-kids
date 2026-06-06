/* js/achievement-defs.js — definition data + builder + lookups. Dual-mode. */
(function () {
  'use strict';

  var ACTIVITIES = [
    { id:'tap-pop',      name:'Tap & Pop',    icon:'🫧', section:'games', noun:'bubbles popped', mastery:null },
    { id:'shape-match',  name:'Shape Match',  icon:'🔷', section:'games', noun:'shapes matched',
      mastery:{ title:'Shape Master', hint:'Finish a 6-shape round' } },
    { id:'peek-a-boo',   name:'Peek-a-Boo',   icon:'👀', section:'games', noun:'peeks', mastery:null },
    { id:'magic-touch',  name:'Magic Touch',  icon:'✨', section:'games', noun:'taps', mastery:null },
    { id:'tap-a-tune',   name:'Tap-a-Tune',   icon:'🎹', section:'games', noun:'notes played', mastery:null },
    { id:'surprise-pop', name:'Surprise Pop', icon:'🥚', section:'games', noun:'surprises', mastery:null },

    { id:'hello-colors', name:'Hello Colors', icon:'🌈', section:'learn', noun:'colors named',
      mastery:{ title:'Color Whiz', hint:'Win the color quiz' } },
    { id:'animal-sounds',name:'Animal Sounds',icon:'🐘', section:'learn', noun:'animals',
      mastery:{ title:'Animal Expert', hint:'Win the sound quiz' } },
    { id:'count-along',  name:'Count Along',  icon:'🔢', section:'learn', noun:'things counted',
      mastery:{ title:'Counting Champ', hint:'Win the how-many quiz' } },
    { id:'abcs',         name:'ABCs',         icon:'🔤', section:'learn', noun:'letters',
      mastery:{ title:'Word Builder', hint:'Spell a short word' } },
    { id:'days',         name:'Days',         icon:'📅', section:'learn', noun:'days right',
      mastery:{ title:'Calendar Kid', hint:'Win the days quiz' } },
    { id:'math',         name:'Math Mountain',icon:'➕', section:'learn', noun:'problems solved',
      mastery:{ title:'Math Master', hint:'Solve a take-away problem' } },
    { id:'spelling',     name:'Spelling Bee', icon:'🐝', section:'learn', noun:'words spelled',
      mastery:{ title:'Spelling Star', hint:'Spell from the letter bank' } },
    { id:'money',        name:'Money',        icon:'💰', section:'learn', noun:'coins known',
      mastery:{ title:'Money Smart', hint:'Count a coin total' } },
    { id:'body-parts',   name:'Body Parts',   icon:'👤', section:'learn', noun:'parts named',
      mastery:{ title:'Body Boss', hint:'Name an extra part' } },

    { id:'stamp-art',    name:'Stamp Art',    icon:'⭐', section:'art', noun:'stamps placed', mastery:null },
    { id:'finger-paint', name:'Finger Paint', icon:'🖌️', section:'art', noun:'strokes painted', mastery:null },
    { id:'color-splash', name:'Color Splash', icon:'💥', section:'art', noun:'splashes made', mastery:null },
    { id:'color-in',     name:'Color In',     icon:'🖍️', section:'art', noun:'areas colored', mastery:null }
  ];

  // Tuned 2026-06-04 to Scott's tap-pop calibration (successes are frequent there).
  // Milestone "trophy" tiers are intentionally rare; the repeatable ribbon
  // (REPEAT_EVERY) carries the frequent-reward / engagement loop. NOTE: this one
  // shared scale applies to every activity — for slow activities (math, spelling)
  // gold(1000) is aspirational; can be made per-activity if desired.
  var MILESTONE_TIERS = [
    { tier:'bronze',   threshold:50,    xp:1,  label:'Bronze' },
    { tier:'silver',   threshold:250,   xp:2,  label:'Silver' },
    { tier:'gold',     threshold:1000,  xp:3,  label:'Gold' },
    { tier:'sapphire', threshold:2500,  xp:5,  label:'Sapphire' },
    { tier:'ruby',     threshold:5000,  xp:7,  label:'Ruby' },
    { tier:'diamond',  threshold:10000, xp:10, label:'Diamond' }
  ];
  // A repeatable "star" ribbon, awarded once per this many successes per activity,
  // shown with a ×N count badge. Per-SPEED so fast tap/drag games don't spam it:
  // at the old flat 25, rapid tapping banked ★ ribbons and the celebrate queue
  // drained them ~every 2s. Fast = the 5 toddler games + 4 art canvases (a success
  // = one touch); slow = deliberate correct-answer activities (quizzes, shape-match).
  // Tunable.
  var REPEAT_FAST = 300;
  var REPEAT_SLOW = 120; // was 50 — too spammy on tap-driven 'slow' activities (e.g. Body Parts: a 6yo earned a ribbon every ~2 min). 120 ≈ a few-minute cadence.
  var SLOW_ACTIVITIES = {
    'shape-match':1, 'hello-colors':1, 'animal-sounds':1, 'count-along':1, 'abcs':1,
    'days':1, 'math':1, 'spelling':1, 'money':1, 'body-parts':1
  };
  function repeatEveryFor(id) { return SLOW_ACTIVITIES[id] ? REPEAT_SLOW : REPEAT_FAST; }

  var STREAKS = [
    { id:'streak.3', type:'streak', title:'3-Day Streak', hint:'Play 3 days in a row', icon:'🔥', xp:3, days:3 },
    { id:'streak.7', type:'streak', title:'7-Day Streak', hint:'Play 7 days in a row', icon:'⚡', xp:6, days:7 }
  ];

  var VB_RANKS = [
    { id:'sprout',     label:'Sprout',     minXp:0,   color:'#7BD389' },
    { id:'explorer',   label:'Explorer',   minXp:15,  color:'#4ECDC4' },
    { id:'star',       label:'Star',       minXp:40,  color:'#FFD93D' },
    { id:'superstar',  label:'Super Star', minXp:80,  color:'#FF9F43' },
    { id:'champion',   label:'Champion',   minXp:140, color:'#FF6B6B' },
    { id:'hero',       label:'Hero',       minXp:220, color:'#9B8CFF' },
    { id:'legend',     label:'Legend',     minXp:320, color:'#E0115F' }
  ];

  var VB_ACHIEVEMENTS = [];

  ACTIVITIES.forEach(function (a) {
    VB_ACHIEVEMENTS.push({
      id: a.id + '.first', activity: a.id, section: a.section, type:'first',
      title: 'First ' + a.name, hint: 'Open ' + a.name, icon: a.icon, xp: 1
    });
    MILESTONE_TIERS.forEach(function (m) {
      VB_ACHIEVEMENTS.push({
        id: a.id + '.milestone.' + m.tier, activity: a.id, section: a.section,
        type:'milestone', tier: m.tier, counter: a.id, threshold: m.threshold,
        title: a.name + ' ' + m.label, hint: 'Reach ' + m.threshold + ' ' + a.noun,
        icon: a.icon, xp: m.xp
      });
    });
    var rEvery = repeatEveryFor(a.id);
    VB_ACHIEVEMENTS.push({
      id: a.id + '.repeat', activity: a.id, section: a.section, type:'repeat',
      counter: a.id, every: rEvery,
      title: a.name + ' Star', hint: 'Earn 1 every ' + rEvery + ' ' + a.noun,
      icon: a.icon, xp: 1
    });
    if (a.mastery) {
      VB_ACHIEVEMENTS.push({
        id: a.id + '.mastery', activity: a.id, section: a.section, type:'mastery',
        title: a.mastery.title, hint: a.mastery.hint, icon: a.icon, xp: 8
      });
    }
  });
  STREAKS.forEach(function (s) { VB_ACHIEVEMENTS.push(Object.assign({ activity:'_streak', section:'all' }, s)); });
  VB_RANKS.forEach(function (r) {
    if (r.minXp === 0) return;
    VB_ACHIEVEMENTS.push({
      id:'rank.' + r.id, activity:'_rank', section:'all', type:'rank',
      title: r.label, hint:'Earn ' + r.minXp + ' XP', icon:'👑', color:r.color, xp:0, minXp:r.minXp
    });
  });

  function byCounter(key) {
    return VB_ACHIEVEMENTS
      .filter(function (d) { return d.type === 'milestone' && d.counter === key; })
      .sort(function (x, y) { return x.threshold - y.threshold; });
  }
  function byId(id) { return VB_ACHIEVEMENTS.filter(function (d) { return d.id === id; })[0] || null; }
  function byActivity(id) { return VB_ACHIEVEMENTS.filter(function (d) { return d.activity === id; }); }

  var API = {
    VB_ACHIEVEMENTS: VB_ACHIEVEMENTS, VB_RANKS: VB_RANKS,
    ACTIVITIES: ACTIVITIES, byCounter: byCounter, byId: byId, byActivity: byActivity
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else {
    var g = (typeof self !== 'undefined' ? self : this);
    g.VB_ACHIEVEMENTS = VB_ACHIEVEMENTS; g.VB_RANKS = VB_RANKS;
    g.vbDefs = API;
  }
})();
