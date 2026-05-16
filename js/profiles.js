const _PROFILES_KEY = 'vb_profiles';
const _ACTIVE_KEY   = 'vb_active_id';

const ACTIVITY_FEATURES = [
  { id:'stamp-art',     name:'Stamp Art',     features:[
    { key:'stampPalette',  label:'Stamp picker' },
    { key:'themeSwitcher', label:'Theme switcher (farm/ocean/space)' },
  ]},
  { id:'finger-paint',  name:'Finger Paint',  features:[
    { key:'colorPalette',  label:'Color palette' },
    { key:'eraser',        label:'Eraser tool' },
  ]},
  { id:'color-splash',  name:'Color Splash',  features:[
    { key:'colorPicker',   label:'Color picker' },
    { key:'clearButton',   label:'Clear button' },
  ]},
  { id:'tap-pop',       name:'Tap & Pop',     features:[
    { key:'scoreCounter',  label:'Score counter' },
    { key:'floatMode',     label:'Floating bubbles (race mode)' },
  ]},
  { id:'shape-match',   name:'Shape Match',   features:[
    { key:'dragMode',      label:'Drag-to-match mode' },
  ]},
  { id:'hello-colors',  name:'Hello Colors',  features:[
    { key:'colorQuiz',     label:'Color quiz mode' },
  ]},
  { id:'animal-sounds', name:'Animal Sounds', features:[
    { key:'quizMode',      label:'Sound quiz mode' },
  ]},
  { id:'count-along',   name:'Count Along',   features:[
    { key:'quizMode',      label:'How-many quiz mode' },
  ]},
  { id:'abcs',          name:'ABCs',          features:[
    { key:'wordHints',     label:'Show "A is for Apple" word hints' },
    { key:'spellMode',     label:'Spell short words (advanced)' },
  ]},
  { id:'days',          name:'Days of the Week', features:[
    { key:'quizMode',      label:'Quiz mode (what comes after Monday?)' },
  ]},
  { id:'math',          name:'Math Mountain', features:[
    { key:'subtract',      label:'Include subtraction' },
    { key:'multiply',      label:'Include multiplication (advanced)' },
  ]},
  { id:'spelling',      name:'Spelling Bee',  features:[
    { key:'spellMode',     label:'Spell from letter bank (advanced)' },
  ]},
  { id:'money',         name:'Money Matters', features:[
    { key:'countMode',     label:'Count coin totals (advanced)' },
  ]},
  { id:'body-parts',    name:'Body Parts',    features:[
    { key:'allParts',      label:'Include extra parts (hair, belly, etc.)' },
  ]},
  { id:'color-in',      name:'Color In',      features:[
    { key:'extraPics',     label:'Show more coloring pages' },
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
