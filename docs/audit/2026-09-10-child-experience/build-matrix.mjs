// Audit ledger generator, not a test or product code. Re-run only at a fresh
// baseline: it refuses to overwrite an existing coverage ledger.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const out = path.join(import.meta.dirname, 'coverage.json');
if (existsSync(out)) throw new Error('coverage.json already exists; preserve recorded observations');
const src = readFileSync(path.join(root, 'js/profiles.js'), 'utf8');
const activities = [...src.matchAll(/\{ id:'([^']+)',\s+name:'([^']+)',\s+icon:'[^']+',\s+file:'([^']+)',\s+section:'([^']+)',\s+minTier:(\d+)(?:,\s*maxTier:(\d+))?/g)]
  .map(m => ({id:m[1], name:m[2], route:`/${m[4]==='learn'?'learning':m[4]}/${m[3]}`, minTier:+m[5], maxTier:m[6]?+m[6]:10}));
if (activities.length !== 22) throw new Error('Registry changed; reconcile inventory first');
const dimensions = ['launch','instructions','input','progression','score','rewards','restart','back_home','rapid_double_input','wrong_answers','boundary_taps','drag_outside','keyboard_misuse','navigation_during_animation','reload_mid_round','resize_orientation','repeated_entry_exit','failed_media_network','offline','stale_corrupt_synthetic_state','empty_min_max_values','timer_expiry','interrupted_audio','long_repeated_play','visual_quality'];
const shared = ['index.html','home.html','games/index.html','learning/index.html','art/index.html','achievements.html','parent/settings.html','videos/index.html','listen/index.html','about.html','privacy.html'];
const rows=[];
for (const item of [...activities,...shared.map(route=>({id:route,route:'/'+route,minTier:1,maxTier:10,shared:true}))]) {
  for(let tier=1;tier<=10;tier++) for(const viewport of ['desktop','phone']) {
    rows.push({id:`${item.id}:T${tier}:${viewport}`,route:item.route,kind:item.shared?'shared':'activity',tier,viewport,
      defaultVisible:tier>=item.minTier&&tier<=item.maxTier,execution:'NOT_RUN',verdict:'BLK',
      reason:'Pending audit execution; no behavioral verdict yet',checks:Object.fromEntries(dimensions.map(key=>[key,'BLK'])),evidence:[]});
  }
}
writeFileSync(out, JSON.stringify({baseline:'c96cdbc15b1065f89575f6c3fc4c4ff4e0e92946',viewports:{desktop:{width:1280,height:900},phone:{width:390,height:844}},
  semantics:'BLK plus execution NOT_RUN/PARTIAL explicitly means unfinished, not a reproduced product blocker. PASS/FAIL require evidence per check; NA requires a reason. Hidden-by-default tiers remain queued for visibility plus parent-override/direct-route checks, not silently discarded.',activities,dimensions,rows},null,2)+'\n');
console.log(JSON.stringify({activities:activities.length,activityCombinations:rows.filter(r=>r.kind==='activity').length,sharedCombinations:rows.filter(r=>r.kind==='shared').length,defaultVisibleActivityCombinations:rows.filter(r=>r.kind==='activity'&&r.defaultVisible).length}));
