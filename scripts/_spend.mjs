// Pull today's Replicate predictions to quantify the dog-build spend.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let TOKEN = '';
for (const p of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../../.env')]) {
  if (!fs.existsSync(p)) continue;
  const m = fs.readFileSync(p, 'utf8').match(/^\s*REPLICATE_API_TOKEN\s*=\s*"?([^"\r\n]+)"?/m);
  if (m) { TOKEN = m[1]; break; }
}
if (!TOKEN) { console.log('no token'); process.exit(1); }

let url = 'https://api.replicate.com/v1/predictions';
const today = ['2026-06-02', '2026-06-03'];
let preds = [], pages = 0;
while (url && pages < 8) {
  const r = await fetch(url, { headers: { Authorization: `Token ${TOKEN}` } });
  if (!r.ok) { console.log('API ' + r.status + ': ' + (await r.text()).slice(0, 200)); process.exit(1); }
  const j = await r.json();
  preds.push(...(j.results || []));
  // stop paging once we're past today's window
  const last = j.results?.[j.results.length - 1]?.created_at || '';
  url = j.next; pages++;
  if (last && !today.some(d => last.startsWith(d)) && last < today[0]) break;
}
const todays = preds.filter(p => today.some(d => (p.created_at || '').startsWith(d)));
const byModel = {};
let totalPredict = 0, withCost = 0, costSum = 0;
for (const p of todays) {
  const key = p.model || (p.version || '').slice(0, 12);
  byModel[key] = byModel[key] || { n: 0, predict: 0 };
  byModel[key].n++;
  const pt = p.metrics?.predict_time || 0;
  byModel[key].predict += pt; totalPredict += pt;
  // some responses expose metrics.cost or a top-level cost
  const c = p.metrics?.cost ?? p.cost;
  if (typeof c === 'number') { withCost++; costSum += c; }
}
console.log('Total predictions fetched:', preds.length, '| today:', todays.length);
console.log('By model (today):');
for (const [k, v] of Object.entries(byModel)) console.log(`  ${k}: ${v.n} runs, ${v.predict.toFixed(1)}s compute`);
console.log('Total predict compute:', totalPredict.toFixed(1), 's');
console.log('Predictions exposing a cost field:', withCost, '| summed cost: $' + costSum.toFixed(2));
