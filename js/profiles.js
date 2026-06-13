const _PROFILES_KEY = 'vb_profiles';
const _ACTIVE_KEY   = 'vb_active_id';

// The kid's animal companion (mascot) IS their avatar — its emoji is the icon
// shown in the kid-chooser, home pill, and settings. Single source of truth =
// profile.mascot.id, so changing the mascot updates the icon everywhere.
const MASCOT_EMOJI = { dog:'🐶', tiger:'🐯', giraffe:'🦒', panda:'🐼', orca:'🐳', eagle:'🦅', axolotl:'🦎', tabby:'🐈',
  owl:'🦉', parrot:'🦜', dolphin:'🐬', octopus:'🐙', lion:'🦁', bunny:'🐰', fox:'🦊', penguin:'🐧' };
function mascotEmoji(profile) {
  return (profile && profile.mascot && MASCOT_EMOJI[profile.mascot.id]) || '🐾';
}

// minTier on each entry = the tier where this is age-appropriate. Used to:
//   - render "<age range>+" chips next to feature toggles in settings
//   - decide if a whole activity shows on a kid's home by default
//     (parent can still toggle it on/off)
// Activity-level `section` is the home category: 'games' | 'learn' | 'art'.
// `minTier` at the activity level = the kid's tier needed for this game to
// appear by default. Parent can override per-child in Parent Settings.
const ACTIVITY_FEATURES = [
  { id:'tap-pop',       name:'Tap & Pop',        icon:'🫧', file:'tap-pop.html',     section:'games', minTier:1, features:[] },
  { id:'peek-a-boo',    name:'Peek-a-boo',       icon:'🙈', file:'peek-a-boo.html', section:'games', minTier:1, features:[
    { key:'multiChoice',   label:'Multiple-choice mode',                    minTier:5 },
  ]},
  { id:'magic-touch',   name:'Magic Touch',      icon:'✨', file:'magic-touch.html', section:'games', minTier:1, features:[] },
  { id:'tap-a-tune',    name:'Tap-a-Tune',       icon:'🎹', file:'tap-a-tune.html', section:'games', minTier:1, features:[] },
  { id:'surprise-pop',  name:'Surprise Pop',     icon:'🥚', file:'surprise-pop.html', section:'games', minTier:1, features:[] },
  { id:'shape-match',   name:'Shape Match',      icon:'🔷', file:'shape-match.html', section:'games', minTier:1, features:[
    { key:'dragMode',      label:'Drag-to-match mode',                      minTier:1 },
  ]},
  { id:'tilt-drive',    name:'Tilt Drive',       icon:'🏎️', file:'tilt-drive.html', section:'games', minTier:1, features:[] },
  { id:'memory-match',  name:'Memory Match',     icon:'🃏', file:'memory-match.html', section:'games', minTier:2, features:[] },

  { id:'hello-colors',  name:'Hello Colors',     icon:'🌈', file:'hello-colors.html',  section:'learn', minTier:1, features:[
    { key:'colorQuiz',     label:'Color quiz mode',                         minTier:4 },
  ]},
  { id:'animal-sounds', name:'Animal Sounds',    icon:'🐘', file:'animal-sounds.html', section:'learn', minTier:1, features:[
    { key:'quizMode',      label:'Sound quiz mode',                         minTier:4 },
  ]},
  { id:'count-along',   name:'Count Along',      icon:'🔢', file:'count-along.html',   section:'learn', minTier:2, features:[
    { key:'quizMode',      label:'How-many quiz mode',                      minTier:4 },
  ]},
  { id:'abcs',          name:'ABCs',             icon:'🔤', file:'abcs.html',          section:'learn', minTier:2, features:[
    { key:'wordHints',     label:'Show "A is for Apple" word hints',        minTier:3 },
    { key:'spellMode',     label:'Spell short words',                       minTier:6 },
  ]},
  { id:'days',          name:'Days',             icon:'📅', file:'days.html',          section:'learn', minTier:3, features:[
    { key:'quizMode',      label:'Quiz mode (what comes after Monday?)',    minTier:5 },
  ]},
  { id:'math',          name:'Math Mountain',    icon:'➕', file:'math.html',          section:'learn', minTier:4, features:[
    { key:'subtract',      label:'Include subtraction',                     minTier:5 },
    { key:'multiply',      label:'Include multiplication',                  minTier:8 },
    { key:'divide',        label:'Include division',                        minTier:9 },
    { key:'missingNumber', label:'Missing-number problems (7 + _ = 12)',    minTier:10 },
  ]},
  { id:'clock',         name:'Clock Time',       icon:'🕒', file:'clock.html',         section:'learn', minTier:6, features:[] },
  { id:'spelling',      name:'Spelling Bee',     icon:'🐝', file:'spelling.html',      section:'learn', minTier:4, features:[
    { key:'spellMode',     label:'Spell from letter bank',                  minTier:6 },
  ]},
  { id:'money',         name:'Money',            icon:'💰', file:'money.html',         section:'learn', minTier:4, features:[
    { key:'countMode',     label:'Count coin + bill totals',                minTier:6 },
    { key:'makeChange',    label:'Make change (pay $1, get back…)',         minTier:9 },
  ]},
  { id:'body-parts',    name:'Body Parts',       icon:'👤', file:'body-parts.html',    section:'learn', minTier:2, features:[
    { key:'allParts',      label:'Include extra parts (hair, belly, etc.)', minTier:4 },
  ]},

  { id:'stamp-art',     name:'Stamp Art',     icon:'⭐',  file:'stamp-art.html',    section:'art', minTier:1, features:[
    { key:'stampPalette',  label:'Stamp picker',                            minTier:2 },
    { key:'themeSwitcher', label:'Theme switcher (farm/ocean/space)',       minTier:4 },
  ]},
  { id:'finger-paint',  name:'Finger Paint',  icon:'🖌️', file:'finger-paint.html', section:'art', minTier:1, features:[
    { key:'colorPalette',  label:'Color palette',                           minTier:2 },
    { key:'eraser',        label:'Eraser tool',                             minTier:4 },
  ]},
  { id:'color-splash',  name:'Color Splash',  icon:'💥',  file:'color-splash.html', section:'art', minTier:1, features:[
    { key:'colorPicker',   label:'Color picker',                            minTier:2 },
    { key:'clearButton',   label:'Clear button',                            minTier:3 },
  ]},
  { id:'color-in',      name:'Color In',      icon:'🖍️', file:'color-in.html',     section:'art', minTier:2, features:[
    { key:'extraPics',     label:'Show more coloring pages',                minTier:2 },
  ]},
];

function getProfiles() {
  return JSON.parse(localStorage.getItem(_PROFILES_KEY) || '[]');
}

function saveProfiles(list) {
  localStorage.setItem(_PROFILES_KEY, JSON.stringify(list));
  localStorage.setItem('vb_local_updated_at', String(Date.now()));
  // If cloud sync is loaded + user is signed in, debounced push will fire
  if (window.cloudSync && typeof window.cloudSync.onLocalChange === 'function') {
    window.cloudSync.onLocalChange();
  }
}

function _newProfileId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// One-time migration: ensure all profiles have unique IDs.
// Old seed code used Date.now() — two rapid addProfile calls could collide.
(function _migrateDuplicateIds() {
  const list = getProfiles();
  if (list.length < 2) return;
  const seen = new Set();
  let changed = false;
  for (const p of list) {
    if (!p.id || seen.has(p.id)) {
      p.id = _newProfileId();
      changed = true;
    }
    seen.add(p.id);
  }
  if (changed) saveProfiles(list);
})();

function addProfile({ name, birthday, color, voice, mascot }) {
  const list = getProfiles();
  const p = { id: _newProfileId(), name, birthday, color, voice: voice || 'woman', mascot: mascot || null, tierOverrides: {}, features: {}, youtube: [] };
  list.push(p);
  saveProfiles(list);
  return p;
}

function updateProfile(id, changes) {
  const list = getProfiles().map(p => p.id === id ? { ...p, ...changes } : p);
  saveProfiles(list);
}

function deleteProfile(id) {
  saveProfiles(getProfiles().filter(p => p.id !== id));
  if (localStorage.getItem(_ACTIVE_KEY) === id) localStorage.removeItem(_ACTIVE_KEY);
}

function getActiveProfile() {
  const id = localStorage.getItem(_ACTIVE_KEY);
  return getProfiles().find(p => p.id === id) || null;
}

function setActiveProfile(id) {
  localStorage.setItem(_ACTIVE_KEY, id);
}

function getActivityTier(profile, activityId) {
  if (profile.tierOverrides && profile.tierOverrides[activityId] != null) {
    return profile.tierOverrides[activityId];
  }
  return tierForAge(getAgeMonths(profile.birthday));
}

function setActivityTierOverride(profileId, activityId, tier) {
  const profile = getProfiles().find(p => p.id === profileId);
  if (!profile) return;
  profile.tierOverrides = profile.tierOverrides || {};
  profile.tierOverrides[activityId] = tier;
  updateProfile(profileId, { tierOverrides: profile.tierOverrides });
}

function getProfileFeature(profile, activityId, featureKey) {
  return !!(profile.features && profile.features[activityId] &&
            profile.features[activityId][featureKey]);
}

function setProfileFeature(profileId, activityId, featureKey, enabled) {
  const profile = getProfiles().find(p => p.id === profileId);
  if (!profile) return;
  profile.features = profile.features || {};
  profile.features[activityId] = profile.features[activityId] || {};
  profile.features[activityId][featureKey] = enabled;
  updateProfile(profileId, { features: profile.features });
}

// Activity visibility — should this game show on the kid's home?
// Decision order:
//   1) explicit per-profile override in profile.activitiesVisible[activityId]
//   2) default: kid's tier >= activity.minTier
function isActivityVisible(profile, activityId) {
  const override = profile.activitiesVisible && profile.activitiesVisible[activityId];
  if (override === true || override === false) return override;
  const activity = (typeof ACTIVITY_FEATURES !== 'undefined')
    ? ACTIVITY_FEATURES.find(a => a.id === activityId) : null;
  const minTier = (activity && activity.minTier) || 1;
  const kidTier = tierForAge(getAgeMonths(profile.birthday));
  return kidTier >= minTier;
}

function setActivityVisible(profileId, activityId, visible) {
  const profile = getProfiles().find(p => p.id === profileId);
  if (!profile) return;
  profile.activitiesVisible = profile.activitiesVisible || {};
  if (visible === null) delete profile.activitiesVisible[activityId];
  else profile.activitiesVisible[activityId] = visible;
  updateProfile(profileId, { activitiesVisible: profile.activitiesVisible });
}
