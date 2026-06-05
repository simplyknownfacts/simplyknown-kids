export const meta = {
  name: 'e2e-v2-method-b',
  description: 'Agent-driven human-like E2E cross-check of live kids.simplyknown.co — one agent per age band drives the site and judges correctness by eye',
  phases: [{ title: 'Tier passes', detail: 'one agent per tier band clicks through the live site like a kid and reports findings' }],
};

const BASE = 'https://kids.simplyknown.co';
const BANDS = [
  { tiers: [1, 2], birthday: '2025-06-05', label: 'Sensory/Explore (0-2y)', focus: 'auto-play/sensory modes: tap-pop, magic-touch, hello-colors (auto-cycle), animal-sounds (garden), peek-a-boo, stamp-art/finger-paint/color-splash (auto), body-parts (6 parts), count-along (tier2 dots)' },
  { tiers: [3, 4], birthday: '2023-06-05', label: 'Match/Pre-K (2-4y)', focus: 'tap-to-match + early quizzes: shape-match, abcs (word hints), days (tap), math (+), body-parts (10 parts at t4), color-in, money (identify), animal-sounds' },
  { tiers: [5, 6], birthday: '2021-06-05', label: 'Pre-K+/Kindergarten (4-6y)', focus: 'quiz modes: hello-colors quiz, animal-sounds quiz, count-along quiz, days quiz, math (incl subtraction), spelling (spell mode), money (count mode), abcs' },
  { tiers: [7, 8], birthday: '2018-06-05', label: 'Grade 1-2 (6-8y)', focus: 'advanced: count-along skip-count, days ordinal/relative, math (incl multiplication), spelling (longer words), abcs (spell)' },
];

const SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          screen: { type: 'string' }, action: { type: 'string' }, expected: { type: 'string' },
          actual: { type: 'string' }, pass: { type: 'boolean' },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info'] },
        },
        required: ['screen', 'action', 'expected', 'actual', 'pass', 'severity'],
      },
    },
  },
  required: ['findings'],
};

const PROMPT = (b) => `You are a meticulous QA tester clicking through a toddler learning PWA like a real parent/child on a PHONE. Test the LIVE site ${BASE} for age band: ${b.label} (tiers ${b.tiers.join(' & ')}). Be a HARSH critic — the point is to find what's broken or looks off, not to confirm it works.

SETUP — use the Playwright MCP tools (load them first via ToolSearch query "playwright": browser_navigate, browser_resize, browser_evaluate, browser_take_screenshot, browser_snapshot, browser_click):
1. browser_resize to width 390 height 844 (a phone).
2. browser_navigate to ${BASE}/index.html , then browser_evaluate to seed a child of this age:
   () => { localStorage.setItem('vb_profiles', JSON.stringify([{id:'k',name:'Kid',birthday:'${b.birthday}',avatar:'🦊',color:'#4ECDC4',voice:'woman',mascot:null,tierOverrides:{},features:{math:{subtract:true,multiply:true},spelling:{spellMode:true},days:{quizMode:true},'count-along':{quizMode:true},'animal-sounds':{quizMode:true},'hello-colors':{colorQuiz:true},money:{countMode:true},abcs:{spellMode:true,wordHints:true},'body-parts':{allParts:true}},activitiesVisible:{},youtube:[]}])); localStorage.setItem('vb_active_id','k'); return 'seeded'; }
   (The features object turns on the modes that gate by tier — fine to have them on; test the modes relevant to this band per FOCUS below.)

TEST (focus for this band: ${b.focus}). For each relevant activity: browser_navigate to it (paths: /games/tap-pop.html, /games/magic-touch.html, /games/peek-a-boo.html, /games/surprise-pop.html, /games/tap-a-tune.html, /games/shape-match.html, /learning/hello-colors.html, /learning/animal-sounds.html, /learning/count-along.html, /learning/abcs.html, /learning/body-parts.html, /learning/days.html, /learning/math.html, /learning/spelling.html, /learning/money.html, /art/stamp-art.html, /art/finger-paint.html, /art/color-splash.html, /art/color-in.html, /parent/settings.html). Take a screenshot, then INTERACT like a kid: browser_click the play area / cards / choices. For quizzes, tap a WRONG answer then the RIGHT one and watch (screenshot between).
JUDGE BY WHAT YOU SEE (not just "no crash"):
- Correct tap → positive feedback (glow/match/advance). Wrong tap → does NOT advance, gentle "no".
- body-parts: when it says "tap the nose", tapping the nose must respond as the NOSE (not "ear"); zones should sit on the right body part on the figure. Try the wheelchair kid + a kid with big hair if they appear.
- Look hard for: misaligned tap targets, text cut off / overflowing the phone screen, tiny/overlapping buttons, anything visually broken or confusing for a toddler.
NEGATIVES (do once): (a) browser_evaluate to localStorage.clear() then browser_navigate to ${BASE}/home.html — it MUST redirect to the profile picker; (b) confirm ${BASE}/parent/settings.html shows a PIN gate.

Return a findings array (~12-20 items for this band). Each: screen, action, expected, actual, pass(boolean), severity. Include PASS items so coverage is visible, but prioritize real problems. Your final message MUST be the structured object.`;

phase('Tier passes');
const all = [];
for (const b of BANDS) {
  const r = await agent(PROMPT(b), { label: `tier ${b.tiers.join('-')} (${b.label})`, schema: SCHEMA });
  if (r && Array.isArray(r.findings)) all.push(...r.findings.map((f) => ({ ...f, band: b.label })));
}
return { totalFindings: all.length, fails: all.filter((f) => !f.pass).length, findings: all };
