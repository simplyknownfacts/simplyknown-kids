const _PROFILES_KEY = 'vb_profiles';
const _ACTIVE_KEY   = 'vb_active_id';

// minTier maps to the tier where this feature is age-appropriate. Used to
// render "Recommended: <age range>+" hints in Parent Settings. Tier numbers
// match TIERS in js/tiers.js (1=0-12mo Sensory, ..., 8=7+ yr Grade 2+).
const ACTIVITY_FEATURES = [
  { id:'stamp-art',     name:'Stamp Art',     features:[
    { key:'stampPalette',  label:'Stamp picker',                            minTier:2 },
    { key:'themeSwitcher', label:'Theme switcher (farm/ocean/space)',       minTier:4 },
  ]},
  { id:'finger-paint',  name:'Finger Paint',  features:[
    { key:'colorPalette',  label:'Color palette',                           minTier:2 },
    { key:'eraser',        label:'Eraser tool',                             minTier:4 },
  ]},
  { id:'color-splash',  name:'Color Splash',  features:[
    { key:'colorPicker',   label:'Color picker',                            minTier:2 },
    { key:'clearButton',   label:'Clear button',                            minTier:3 },
  ]},
  { id:'tap-pop',       name:'Tap & Pop',     features:[
    { key:'scoreCounter',  label:'Score counter',                           minTier:4 },
    { key:'floatMode',     label:'Floating bubbles (race mode)',            minTier:3 },
  ]},
  { id:'shape-match',   name:'Shape Match',   features:[
    { key:'dragMode',      label:'Drag-to-match mode',                      minTier:2 },
  ]},
  { id:'hello-colors',  name:'Hello Colors',  features:[
    { key:'colorQuiz',     label:'Color quiz mode',                         minTier:4 },
  ]},
  { id:'animal-sounds', name:'Animal Sounds', features:[
    { key:'quizMode',      label:'Sound quiz mode',                         minTier:4 },
  ]},
  { id:'count-along',   name:'Count Along',   features:[
    { key:'quizMode',      label:'How-many quiz mode',                      minTier:4 },
  ]},
  { id:'abcs',          name:'ABCs',          features:[
    { key:'wordHints',     label:'Show "A is for Apple" word hints',        minTier:3 },
    { key:'spellMode',     label:'Spell short words',                       minTier:6 },
  ]},
  { id:'days',          name:'Days of the Week', features:[
    { key:'quizMode',      label:'Quiz mode (what comes after Monday?)',    minTier:5 },
  ]},
  { id:'math',          name:'Math Mountain', features:[
    { key:'subtract',      label:'Include subtraction',                     minTier:5 },
    { key:'multiply',      label:'Include multiplication',                  minTier:8 },
  ]},
  { id:'spelling',      name:'Spelling Bee',  features:[
    { key:'spellMode',     label:'Spell from letter bank',                  minTier:6 },
  ]},
  { id:'money',         name:'Money Matters', features:[
    { key:'countMode',     label:'Count coin + bill totals',                minTier:6 },
  ]},
  { id:'body-parts',    name:'Body Parts',    features:[
    { key:'allParts',      label:'Include extra parts (hair, belly, etc.)', minTier:4 },
  ]},
  { id:'color-in',      name:'Color In',      features:[
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

function addProfile({ name, birthday, avatar, color }) {
  const list = getProfiles();
  const p = { id: _newProfileId(), name, birthday, avatar, color, voice: 'girl', mascot: null, tierOverrides: {}, features: {}, youtube: [] };
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
