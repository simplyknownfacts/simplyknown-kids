const TIERS = [
  { tier: 1, label: 'Watch',     minMonths: 0,   maxMonths: 6   },
  { tier: 2, label: 'Discovery', minMonths: 6,   maxMonths: 12  },
  { tier: 3, label: 'Tap',       minMonths: 12,  maxMonths: 18  },
  { tier: 4, label: 'Drag',      minMonths: 18,  maxMonths: 24  },
  { tier: 5, label: 'Games',     minMonths: 24,  maxMonths: 36  },
  { tier: 6, label: 'Learning',  minMonths: 36,  maxMonths: 48  },
  { tier: 7, label: 'Advanced',  minMonths: 48,  maxMonths: 60  },
  { tier: 8, label: 'School',    minMonths: 60,  maxMonths: 9999},
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
  return t ? t.tier : 8;
}

function tierLabel(tier) {
  return (TIERS.find(t => t.tier === tier) || {}).label || 'School';
}
