// 8 developmental tiers, age-keyed in months. Labels match Scott's reorg
// (0-12mo Sensory, 12-24mo Explore, etc.) so parents see meaningful names in
// settings. ageRange is a human-friendly string for UI labels.
const TIERS = [
  { tier: 1, label: 'Sensory',      ageRange: '0-12 mo',  minMonths: 0,   maxMonths: 12  },
  { tier: 2, label: 'Explore',      ageRange: '1-2 yr',   minMonths: 12,  maxMonths: 24  },
  { tier: 3, label: 'Match',        ageRange: '2-3 yr',   minMonths: 24,  maxMonths: 36  },
  { tier: 4, label: 'Pre-K',        ageRange: '3-4 yr',   minMonths: 36,  maxMonths: 48  },
  { tier: 5, label: 'Pre-K+',       ageRange: '4-5 yr',   minMonths: 48,  maxMonths: 60  },
  { tier: 6, label: 'Kindergarten', ageRange: '5-6 yr',   minMonths: 60,  maxMonths: 72  },
  { tier: 7, label: 'Grade 1',      ageRange: '6-7 yr',   minMonths: 72,  maxMonths: 84  },
  { tier: 8, label: 'Grade 2',      ageRange: '7-8 yr',   minMonths: 84,  maxMonths: 96  },
  { tier: 9, label: 'Grade 3',      ageRange: '8-9 yr',   minMonths: 96,  maxMonths: 108 },
  { tier: 10, label: 'Grade 4+',    ageRange: '9+ yr',    minMonths: 108, maxMonths: 9999},
];

function getAgeMonths(birthday) {
  const now = new Date();
  const b = new Date(birthday);
  let months = (now.getFullYear() - b.getFullYear()) * 12
               + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months--;
  return Math.max(0, months);
}

function tierForAge(ageMonths) {
  const t = TIERS.find(t => ageMonths >= t.minMonths && ageMonths < t.maxMonths);
  return t ? t.tier : 10;
}

function tierLabel(tier) {
  return (TIERS.find(t => t.tier === tier) || {}).label || 'Grade 4+';
}

function tierAgeRange(tier) {
  return (TIERS.find(t => t.tier === tier) || {}).ageRange || '9+ yr';
}
