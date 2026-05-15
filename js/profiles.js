const _PROFILES_KEY = 'vb_profiles';
const _ACTIVE_KEY   = 'vb_active_id';

function getProfiles() {
  return JSON.parse(localStorage.getItem(_PROFILES_KEY) || '[]');
}

function saveProfiles(list) {
  localStorage.setItem(_PROFILES_KEY, JSON.stringify(list));
}

function addProfile({ name, birthday, avatar, color }) {
  const list = getProfiles();
  const p = { id: Date.now().toString(), name, birthday, avatar, color, tierOverrides: {} };
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
