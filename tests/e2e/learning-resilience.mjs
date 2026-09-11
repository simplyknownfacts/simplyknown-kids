// Negative/failure/recovery audit scaffold for all ten Learning routes at T1-T10.
// Synthetic profiles only. The runner owns and health-checks its localhost
// server before every row so a vanished preview cannot become product evidence.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'learning-resilience');
const APP_BASELINE = 'd6687a38b2a466e13de00f9553efeb23e9f84d8f';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const LESSONS = [
  { id: 'hello-colors', route: '/learning/hello-colors.html', ready: '.thing-card', alive: '#screen', instruction: '#quizLabel, #colorLabel' },
  { id: 'animal-sounds', route: '/learning/animal-sounds.html', ready: '#garden .animal-float, #quizStage .choice-btn', alive: '#garden, #quizArea', instruction: '#instruction' },
  { id: 'count-along', route: '/learning/count-along.html', ready: '#stage .dot, #stage .num-btn', alive: '#stage', instruction: '#instruction' },
  { id: 'abcs', route: '/learning/abcs.html', ready: '#body .abc-choice', alive: '#stage', instruction: '#prompt' },
  { id: 'days', route: '/learning/days.html', ready: '#body .day-tile', alive: '#stage', instruction: '#hint' },
  { id: 'math', route: '/learning/math.html', ready: '#body .num-btn', alive: '#stage', instruction: '#hint' },
  { id: 'clock', route: '/learning/clock.html', ready: '#choices .num-btn', alive: '#stage', instruction: '#hint' },
  { id: 'spelling', route: '/learning/spelling.html', ready: '#body .word-card, #body .letter-tile', alive: '#stage', instruction: '#hint' },
  { id: 'money', route: '/learning/money.html', ready: '#body .coin-svg, #body .bill-svg, #body .num-btn', alive: '#stage', instruction: '#hint' },
  { id: 'body-parts', route: '/learning/body-parts.html', ready: '#figure .hit', alive: '#stage', instruction: '#hint' },
];
const COLOR_BY_EMOJI = {
  '🍎':'Red','🌹':'Red','🚒':'Red','❤️':'Red', '🫐':'Blue','🌊':'Blue','🐬':'Blue','💙':'Blue',
  '🌻':'Yellow','🍋':'Yellow','⭐':'Yellow','🐝':'Yellow', '🐸':'Green','🌿':'Green','🥦':'Green','🐢':'Green',
  '🍇':'Purple','🟣':'Purple','🪻':'Purple','💜':'Purple', '🍊':'Orange','🎃':'Orange','🦊':'Orange','🥕':'Orange',
  '🐷':'Pink','🌸':'Pink','🦩':'Pink','🩷':'Pink', '🐻':'Brown','🍫':'Brown','🪵':'Brown','🥔':'Brown',
  '🐘':'Gray','🌫️':'Gray','🦈':'Gray','🪨':'Gray', '🦇':'Black','🐈‍⬛':'Black','🎩':'Black','🕷️':'Black',
  '☁️':'White','🦢':'White','🥛':'White','❄️':'White',
};
const COLOR_MIX = { 'Red+Blue':'Purple', 'Red+Yellow':'Orange', 'Blue+Yellow':'Green', 'Red+White':'Pink', 'Black+White':'Gray' };
const ANIMAL_META = {
  cow:{g:'mammal',h:'farm'}, dog:{g:'mammal'}, cat:{g:'mammal'}, frog:{g:'amphibian',h:'wild'},
  lion:{g:'mammal',h:'wild'}, elephant:{g:'mammal',h:'wild'}, sheep:{g:'mammal',h:'farm'},
  rooster:{g:'bird',h:'farm'}, duck:{g:'bird',h:'farm'}, horse:{g:'mammal',h:'farm'}, pig:{g:'mammal',h:'farm'},
  bear:{g:'mammal',h:'wild'}, owl:{g:'bird',h:'wild'}, snake:{g:'reptile',h:'wild'}, bee:{g:'insect',h:'wild'},
  monkey:{g:'mammal',h:'wild'}, chicken:{g:'bird',h:'farm'}, goat:{g:'mammal',h:'farm'}, donkey:{g:'mammal',h:'farm'},
  mouse:{g:'mammal',h:'wild'}, tiger:{g:'mammal',h:'wild'}, wolf:{g:'mammal',h:'wild'}, whale:{g:'mammal',h:'ocean'},
  dolphin:{g:'mammal',h:'ocean'}, seal:{g:'mammal',h:'ocean'}, bird:{g:'bird',h:'wild'}, crow:{g:'bird',h:'wild'},
  turkey:{g:'bird',h:'farm'}, rabbit:{g:'mammal',h:'wild'}, fox:{g:'mammal',h:'wild'},
};
const MONEY_CENTS = { penny:1, nickel:5, dime:10, quarter:25, dollar:100, five:500, ten:1000 };
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const selectedTiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const selectedViewports = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const selectedLessons = process.env.LEARNING ? process.env.LEARNING.split(',') : LESSONS.map(lesson => lesson.id);

for (const tier of selectedTiers) if (!TIERS.includes(tier)) throw new Error(`unknown tier ${tier}`);
for (const viewport of selectedViewports) if (!VIEWPORTS[viewport]) throw new Error(`unknown viewport ${viewport}`);
for (const lesson of selectedLessons) if (!LESSONS.some(candidate => candidate.id === lesson)) throw new Error(`unknown Learning route ${lesson}`);

const pass = note => ({ status: 'PASS', note });
const fail = note => ({ status: 'FAIL', note });
const na = note => ({ status: 'NA', note });
const blk = note => ({ status: 'BLK', note });

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function birthdayForTier(tier) {
  const months = { 1: 6, 2: 18, 3: 30, 4: 42, 5: 54, 6: 66, 7: 78, 8: 90, 9: 102, 10: 114 }[tier];
  const date = new Date(); date.setDate(15); date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function seed() {
  return ({ lesson, tier, birthday }) => {
    let randomState = (2166136261 ^ tier) >>> 0;
    for (const char of lesson) randomState = Math.imul(randomState ^ char.charCodeAt(0), 16777619) >>> 0;
    Math.random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    const profile = {
      id: `learning-resilience-t${tier}`, name: `Test${tier}`, birthday,
      color: '#4ECDC4', voice: 'girl', mascot: { id: 'dog' },
      tierOverrides: {}, features: {},
      activitiesVisible: { [lesson]: true }, youtube: [],
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    localStorage.removeItem('vb_pin_lockout');
    window.__auditMediaPlay = 0;
    window.__auditAudioUrls = [];
    try {
      const NativeAudio = window.Audio;
      window.Audio = function (src) {
        if (src) window.__auditAudioUrls.push(String(src));
        return new NativeAudio(src);
      };
      window.Audio.prototype = NativeAudio.prototype;
      HTMLMediaElement.prototype.play = function () {
        window.__auditMediaPlay++;
        queueMicrotask(() => { try { if (typeof this.onended === 'function') this.onended(); } catch {} });
        return Promise.resolve();
      };
    } catch {}
    try { navigator.vibrate = () => true; } catch {}
  };
}

async function health(base) {
  const response = await fetch(base + '/__health.json');
  if (!response.ok) throw new Error(`local server health failed: ${response.status}`);
  const identity = await response.json();
  if (identity.app !== 'kids') throw new Error(`wrong local app: ${identity.app || 'missing identity'}`);
}

async function alive(page, lesson) {
  return page.url().endsWith(lesson.route) && await page.locator(lesson.alive).count() > 0;
}

async function visibleInstruction(page, lesson) {
  return page.locator(lesson.instruction).evaluateAll(nodes => {
    const node = nodes.find(candidate => {
      const style = getComputedStyle(candidate); const rect = candidate.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && candidate.textContent.trim();
    });
    return node ? node.textContent.trim() : '';
  });
}

async function geometry(page, lesson) {
  return page.evaluate(({ ready, aliveSelector }) => {
    const visible = selector => [...document.querySelectorAll(selector)].find(node => {
      const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const intersects = node => { const r = node?.getBoundingClientRect(); return !!r && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
    const readyNode = visible(ready);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      verticalScroll: document.documentElement.scrollHeight - innerHeight,
      ready: intersects(readyNode), readyPresent: !!readyNode, alive: intersects(visible(aliveSelector)),
      nav: intersects(visible('.nav-chrome')),
    };
  }, { ready: lesson.ready, aliveSelector: lesson.alive });
}

async function visit(page, base, lesson) {
  await page.goto(base + lesson.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
}

async function rapidAndBoundaryProbe(page, lesson) {
  const target = page.locator(lesson.ready).first();
  const box = await target.boundingBox();
  if (!box) return false;
  const x = Math.max(1, box.x + Math.min(2, box.width / 2));
  const y = Math.max(1, box.y + Math.min(2, box.height / 2));
  await page.mouse.dblclick(x, y, { delay: 10 });
  await page.mouse.click(x, y);
  return true;
}

async function counter(page, id) {
  return page.evaluate(activityId => (window.vbProgress && vbProgress.getState().counters[activityId]) || 0, id).catch(() => 0);
}

async function wrongFeedback(locator) {
  return locator.evaluate(node => {
    const color = getComputedStyle(node).backgroundColor;
    return node.classList.contains('wrong') || /255\s*,\s*107\s*,\s*107/.test(color);
  }).catch(() => false);
}

async function reachability(locator) {
  const before = await locator.evaluate(node => {
    const rect = node.getBoundingClientRect(); const scroller = node.closest('.screen');
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight }, scrollTop: scroller?.scrollTop || 0, scrollHeight: scroller?.scrollHeight || 0, clientHeight: scroller?.clientHeight || 0 };
  });
  await locator.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'center' }));
  const after = await locator.evaluate(node => {
    const rect = node.getBoundingClientRect(); const scroller = node.closest('.screen');
    return { reachable: rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, scrollTop: scroller?.scrollTop || 0 };
  });
  return { before, after };
}

async function recoverWithChoice(page, lesson, candidates, correctIndex, note) {
  const count = await candidates.count();
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= count || count < 2) return blk(`${note}; deterministic answer could not be identified`);
  const wrongIndex = Array.from({ length: count }, (_, index) => index).find(index => index !== correctIndex);
  const before = await counter(page, lesson.id);
  const wrong = candidates.nth(wrongIndex);
  await wrong.click({ timeout: 4000 });
  await page.waitForTimeout(80);
  const rejected = await wrongFeedback(wrong)
    || /not (the answer|\w+)|try again|find the/i.test((await page.locator(`${lesson.instruction}, .vb-caption`).allTextContents()).join(' '));
  await candidates.nth(correctIndex).click({ timeout: 4000 });
  const recovered = await page.waitForFunction(({ id, beforeCount }) => {
    return !!window.vbProgress && (vbProgress.getState().counters[id] || 0) > beforeCount;
  }, { id: lesson.id, beforeCount: before }, { timeout: 1500 }).then(() => true).catch(() => false);
  if (!rejected) return fail(`${note}; known wrong choice was not visibly rejected`);
  if (!recovered) return fail(`${note}; correct retry did not record progress`);
  return pass(`${note}; wrong choice rejected and correct retry recorded progress`);
}

function parseMoney(text) {
  const value = String(text || '').trim();
  if (/¢/.test(value)) return Math.round(Number(value.replace(/[^\d.]/g, '')));
  if (/\$/.test(value)) return Math.round(Number(value.replace(/[^\d.]/g, '')) * 100);
  return NaN;
}

async function wrongAnswerRecovery(page, lesson, tier) {
  if (lesson.id === 'abcs') {
    const prompt = (await page.locator('#prompt').textContent() || '').trim();
    const wrong = page.locator('.abc-choice[data-answer="false"]').first();
    const answers = page.locator('.abc-choice[data-answer="true"]');
    const before = await counter(page, lesson.id);
    await wrong.click({ timeout: 4000 });
    await page.waitForTimeout(80);
    const rejected = await wrongFeedback(wrong) && await counter(page, lesson.id) === before;
    for (let index = 0; index < await answers.count(); index++) await answers.nth(index).click({ timeout: 4000 });
    const recovered = await page.waitForFunction(({ id, beforeCount }) => {
      return !!window.vbProgress && (vbProgress.getState().counters[id] || 0) === beforeCount + 1;
    }, { id: lesson.id, beforeCount: before }, { timeout: 1800 }).then(() => true).catch(() => false);
    if (!rejected) return fail(`ABC Quest prompt "${prompt}" did not visibly reject a known wrong choice`);
    if (!recovered) return fail(`ABC Quest prompt "${prompt}" did not record the correct retry exactly once`);
    return pass(`ABC Quest prompt "${prompt}" rejected a wrong choice and recorded the correct retry`);
  }

  if ((lesson.id === 'hello-colors' && tier === 1)
    || (lesson.id === 'animal-sounds' && tier <= 4) || (lesson.id === 'count-along' && tier <= 4)
    || (lesson.id === 'days' && tier <= 4)) return na('this age/mode has no wrong-answer mechanic');

  if (lesson.id === 'hello-colors') {
    const prompt = (await page.locator('#quizLabel').textContent() || '').trim();
    const cards = page.locator('#thingsRow .thing-card');
    const info = await cards.evaluateAll(nodes => nodes.map(node => ({
      name: node.querySelector('.thing-name')?.textContent.trim() || '',
      emoji: node.querySelector('.thing-emoji')?.textContent.trim() || '',
    })));
    let answer = '';
    const mix = prompt.match(/^(\w+) \+ (\w+) = \?$/);
    const odd = prompt.match(/^Which one is NOT (\w+)\?$/i);
    const identify = prompt.match(/^Tap the (\w+)(?: ([^!]+))?!$/i);
    if (mix) answer = COLOR_MIX[`${mix[1]}+${mix[2]}`] || '';
    let correctIndex;
    if (mix) correctIndex = info.findIndex(item => item.name === answer);
    else if (odd) correctIndex = info.findIndex(item => COLOR_BY_EMOJI[item.emoji] !== odd[1]);
    else if (identify) {
      const thing = identify[2] && identify[2].toLowerCase() !== 'thing' ? identify[2] : null;
      correctIndex = info.findIndex(item => COLOR_BY_EMOJI[item.emoji] === identify[1] && (!thing || item.name.toLowerCase() === thing.toLowerCase()));
    }
    return recoverWithChoice(page, lesson, cards, correctIndex, `colour quiz prompt "${prompt}"`);
  }

  if (lesson.id === 'animal-sounds') {
    const prompt = (await page.locator('#instruction').textContent() || '').trim();
    const choices = page.locator('#quizStage .choice-btn');
    const items = await choices.evaluateAll(nodes => nodes.map(node => node.querySelector('.cname')?.textContent.trim() || ''));
    const manifest = await page.evaluate(() => Object.fromEntries(
      (typeof VOICE_MANIFEST !== 'undefined' ? VOICE_MANIFEST.animals : []).map(animal => [animal.name, animal.id]),
    ));
    let answerId = '';
    if (/makes this sound/i.test(prompt)) {
      await page.waitForTimeout(100);
      const urls = await page.evaluate(() => window.__auditAudioUrls || []);
      answerId = ((urls.findLast(url => /\/audio\/sounds\//.test(url)) || '').match(/\/([^/]+)\.mp3(?:\?|$)/) || [])[1] || '';
    } else {
      const group = (prompt.match(/Which one is (?:a|an) (mammal|bird|reptile|amphibian|insect)/i) || [])[1];
      const habitat = (prompt.match(/lives (on a farm|in the ocean|in the wild)/i) || [])[1];
      const habitatKey = { 'on a farm':'farm', 'in the ocean':'ocean', 'in the wild':'wild' }[habitat?.toLowerCase()];
      answerId = items.map(name => manifest[name]).find(id => (group && ANIMAL_META[id]?.g === group.toLowerCase()) || (habitatKey && ANIMAL_META[id]?.h === habitatKey)) || '';
    }
    const correctIndex = items.findIndex(name => manifest[name] === answerId);
    return recoverWithChoice(page, lesson, choices, correctIndex, `animal quiz prompt "${prompt}"`);
  }

  if (lesson.id === 'count-along') {
    const prompt = (await page.locator('#instruction').textContent() || '').trim();
    const choices = page.locator('#stage .num-btn');
    let answer;
    if (/How many/i.test(prompt)) answer = await page.locator('#stage .dot.counted').count();
    else {
      const relation = prompt.match(/comes (after|before) (\d+)/i);
      if (relation) answer = Number(relation[2]) + (relation[1].toLowerCase() === 'after' ? 1 : -1);
      else {
        const step = Number((prompt.match(/Counting by (\d+)s/i) || [])[1]);
        const values = ((await page.locator('#stage .number-big').textContent().catch(() => '')) || '').match(/\d+/g)?.map(Number) || [];
        if (step && values.length) answer = values.at(-1) + step;
      }
    }
    const labels = await choices.allTextContents();
    return recoverWithChoice(page, lesson, choices, labels.findIndex(label => Number(label) === answer), `counting prompt "${prompt}"`);
  }

  if (lesson.id === 'days') {
    const prompt = (await page.locator('#hint').textContent() || '').trim();
    const choices = page.locator('#body .day-tile');
    const labels = (await choices.allTextContents()).map(label => label.replace('TODAY', '').trim());
    let answer = '';
    const month = prompt.match(/month comes after (\w+)/i);
    const day = prompt.match(/day comes after (\w+)|day before (\w+)/i);
    if (month) answer = MONTHS[(MONTHS.indexOf(month[1]) + 1) % 12];
    else if (day) {
      const base = day[1] || day[2];
      answer = DAYS[(DAYS.indexOf(base) + (day[1] ? 1 : 6)) % 7];
    }
    return recoverWithChoice(page, lesson, choices, labels.findIndex(label => label.includes(answer)), `calendar prompt "${prompt}"`);
  }

  if (lesson.id === 'math') {
    const equation = await page.locator('#body .eq-row').evaluate(row => {
      const children = [...row.children];
      const op = children.find(node => node.classList.contains('op') && node.textContent !== '=')?.textContent || '';
      const equalsIndex = children.findIndex(node => node.textContent === '=');
      const boxIndex = children.findIndex(node => node.classList.contains('answer-box'));
      const values = children.map(node => node.classList.contains('pile') ? node.querySelectorAll('.item').length : Number(node.textContent)).filter(Number.isFinite);
      return { op, missing: boxIndex >= 0 && boxIndex < equalsIndex, values };
    });
    let answer;
    const [a, b] = equation.values;
    if (equation.missing) answer = equation.op === '−' ? a - b : b - a;
    else answer = equation.op === '−' ? a - b : equation.op === '×' ? a * b : equation.op === '÷' ? a / b : a + b;
    const choices = page.locator('#body .num-btn');
    const labels = await choices.allTextContents();
    return recoverWithChoice(page, lesson, choices, labels.findIndex(label => Number(label) === answer), `math ${equation.values.join(',')} ${equation.op}`);
  }

  if (lesson.id === 'clock') {
    const answer = await page.locator('#clockWrap svg').evaluate(svg => {
      const hand = stroke => svg.querySelector(`line[stroke="${stroke}"]`);
      const angle = line => (Math.atan2(Number(line.getAttribute('y2')) - 100, Number(line.getAttribute('x2')) - 100) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      const minute = Math.round(angle(hand('#e2574c')) / (Math.PI * 2) * 60) % 60;
      let hour = Math.round(angle(hand('#1a3149')) / (Math.PI * 2) * 12 - minute / 60) % 12;
      if (hour <= 0) hour += 12;
      return `${hour}:${String(minute).padStart(2, '0')}`;
    });
    const choices = page.locator('#choices .num-btn');
    const labels = await choices.allTextContents();
    return recoverWithChoice(page, lesson, choices, labels.findIndex(label => label.trim() === answer), `clock face ${answer}`);
  }

  if (lesson.id === 'spelling') {
    const slots = page.locator('#body .spelled-slot');
    if (await slots.count()) {
      const target = await slots.evaluateAll(nodes => nodes.map(node => node.dataset.target));
      const letters = page.locator('#body .letter-tile');
      const labels = await letters.allTextContents();
      const visible = await letters.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
      }));
      const before = await counter(page, lesson.id);
      const wrongIndex = labels.findIndex((label, index) => label.trim() !== target[0] && visible[index]);
      if (wrongIndex < 0) return fail(`no visible wrong-answer letter among ${labels.join('')}`);
      const wrongTile = letters.nth(wrongIndex);
      const wrongReachable = await reachability(wrongTile);
      if (!wrongReachable.after.reachable) return fail(`wrong-answer letter is unreachable after scroll: ${JSON.stringify(wrongReachable)}`);
      await wrongTile.click({ timeout: 4000 }); await page.waitForTimeout(80);
      const rejected = await wrongFeedback(wrongTile);
      for (const letter of target) {
        const tile = letters.filter({ hasText: new RegExp(`^${letter}$`, 'i') }).first();
        const reachable = await reachability(tile);
        if (!reachable.after.reachable) return fail(`target letter ${letter} is unreachable after scroll: ${JSON.stringify(reachable)}`);
        await tile.click({ timeout: 4000 });
        await page.waitForTimeout(60);
      }
      const recovered = await counter(page, lesson.id) > before;
      return rejected && recovered ? pass(`wrong first letter rejected; retry spelled ${target.join('')}`)
        : fail(`spelling recovery failed: rejected=${rejected} progressed=${recovered}`);
    }
    const choices = page.locator('#body .word-card');
    const target = ((await page.locator('.vb-caption').textContent().catch(() => '')) || '').trim();
    const labels = await choices.allTextContents();
    return recoverWithChoice(page, lesson, choices, labels.findIndex(label => label.trim() === target), `picture-word target "${target}"`);
  }

  if (lesson.id === 'money') {
    const prompt = (await page.locator('#hint').textContent() || '').trim();
    const numberChoices = page.locator('#body .num-btn');
    if (await numberChoices.count()) {
      let answer;
      if (/How much change/i.test(prompt)) {
        const values = [...prompt.matchAll(/(?:\$[\d.]+|\d+¢)/g)].map(match => parseMoney(match[0]));
        if (values.length >= 2) answer = values[1] - values[0];
      } else {
        const ids = await page.locator('#body .money-row .coin-svg, #body .money-row .bill-svg').evaluateAll(nodes => nodes.map(node => node.dataset.id));
        answer = ids.reduce((sum, id) => sum + (MONEY_CENTS[id] || 0), 0);
      }
      const labels = await numberChoices.allTextContents();
      return recoverWithChoice(page, lesson, numberChoices, labels.findIndex(label => parseMoney(label) === answer), `money prompt "${prompt}"`);
    }
    const targetName = (prompt.match(/^Tap the (.+)!$/i) || [])[1] || '';
    const idsByName = { Penny:'penny', Nickel:'nickel', Dime:'dime', Quarter:'quarter', 'Dollar Bill':'dollar', 'Five Dollar Bill':'five', 'Ten Dollar Bill':'ten' };
    const choices = page.locator('#body .coin-svg, #body .bill-svg');
    const ids = await choices.evaluateAll(nodes => nodes.map(node => node.dataset.id));
    return recoverWithChoice(page, lesson, choices, ids.findIndex(id => id === idsByName[targetName]), `money identification "${targetName}"`);
  }

  if (lesson.id === 'body-parts') {
    const targetWord = ((await page.locator('#hint').textContent() || '').match(/(?:the|Where's the)\s+([a-z]+)/i) || [])[1] || '';
    const singular = { eyes:'eye', ears:'ear', hands:'hand', feet:'foot', arms:'arm', legs:'leg' }[targetWord.toLowerCase()] || targetWord.toLowerCase().replace(/s$/, '');
    const zones = page.locator('#figure .hit');
    const names = await zones.evaluateAll(nodes => nodes.map(node => node.dataset.name));
    const correctIndex = names.findIndex(name => name === singular);
    const wrongIndex = names.findIndex(name => name !== singular);
    if (correctIndex < 0 || wrongIndex < 0) return blk(`body prompt "${targetWord}" could not be mapped to a hit zone`);
    const tap = async index => {
      const box = await zones.nth(index).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    const before = await counter(page, lesson.id);
    await tap(wrongIndex); await page.waitForTimeout(80);
    const rejected = await wrongFeedback(zones.nth(wrongIndex));
    await tap(correctIndex); await page.waitForTimeout(100);
    const recovered = await counter(page, lesson.id) > before;
    return rejected && recovered ? pass(`wrong ${names[wrongIndex]} rejected; correct ${singular} retry progressed`)
      : fail(`body-part recovery failed: rejected=${rejected} progressed=${recovered}`);
  }

  return blk('no activity-specific wrong-answer probe');
}

async function runCell(browser, base, viewportName, viewport, tier, lesson) {
  await health(base);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile, hasTouch: viewport.hasTouch,
    reducedMotion: 'reduce', serviceWorkers: 'allow',
  });
  context.setDefaultTimeout(5000);
  await context.addInitScript(seed(), {
    lesson: lesson.id, tier, birthday: birthdayForTier(tier),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = {};
  let phase = 'launch';
  try {
    await visit(page, base, lesson);
    checks.launch = pass('Learning route loaded with its primary activity surface');
    const instruction = await visibleInstruction(page, lesson);
    checks.instructions = instruction ? pass(`visible instruction: ${instruction.slice(0, 100)}`) : fail('no visible on-screen instruction');
    checks.back_home = await page.locator('.nav-chrome .back-btn').isVisible() && await page.locator('.nav-chrome .home-btn').isVisible()
      ? pass('Back and Home visible') : fail('Back or Home missing');
    const initial = await geometry(page, lesson);
    let spellingClip = [];
    if (lesson.id === 'spelling' && await page.locator('#body .letter-tile').count()) {
      spellingClip = await page.locator('#body .letter-tile').evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { letter: node.textContent.trim(), left: Math.round(rect.left), right: Math.round(rect.right) };
      }).filter(item => item.left < 0 || item.right > innerWidth));
    }
    checks.layout_bounds = initial.overflow <= 1 && initial.ready && initial.alive && initial.nav && !spellingClip.length
      ? pass('primary activity/navigation visible; no horizontal overflow')
      : fail(`overflow=${initial.overflow} ready=${initial.ready} alive=${initial.alive} nav=${initial.nav}${spellingClip.length ? ` clippedLetters=${JSON.stringify(spellingClip)}` : ''}`);
    checks.visual_quality = spellingClip.length
      ? fail(`letter bank clips choices beyond the viewport with no horizontal scroll: ${JSON.stringify(spellingClip)}`)
      : blk('geometry is automated; full visual-quality judgement remains unreviewed');
    checks.score = na('Learning route has no score counter');
    checks.rewards = blk('bounded resilience pass does not prove award timing or duplication');
    checks.restart = blk('reload recovery is tested separately; no dedicated restart control is asserted');

    checks.wrong_answers = await wrongAnswerRecovery(page, lesson, tier);
    if (lesson.id === 'spelling' && checks.wrong_answers.status === 'FAIL' && /unreachable/.test(checks.wrong_answers.note)) {
      checks.input = fail(checks.wrong_answers.note);
    }

    const probed = await rapidAndBoundaryProbe(page, lesson);
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await page.keyboard.press('KeyQ');
    const responsive = await alive(page, lesson);
    checks.rapid_double_input = probed && responsive ? pass('rapid repeated input left lesson responsive') : fail('rapid input broke or exited lesson');
    checks.boundary_taps = probed && responsive ? pass('edge-of-control input left lesson responsive') : fail('boundary input broke lesson');
    checks.keyboard_misuse = responsive ? pass('unrelated keys did not exit or complete lesson') : fail('keyboard misuse broke lesson');
    checks.drag_outside = na('no Learning route requires drag-to-target input');

    await page.setViewportSize(viewportName === 'phone' ? { width: 844, height: 390 } : { width: 900, height: 1280 });
    await page.waitForTimeout(100);
    const resized = await geometry(page, lesson);
    checks.resize_orientation = resized.overflow <= 1 && resized.readyPresent && resized.alive && resized.nav
      ? pass(`viewport/orientation change preserved controls${resized.ready ? '' : ` via ${Math.max(0, Math.round(resized.verticalScroll))}px vertical scroll`}`)
      : fail(`overflow=${resized.overflow} readyPresent=${resized.readyPresent} alive=${resized.alive} nav=${resized.nav}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    phase = 'reload';
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    checks.reload_mid_round = await alive(page, lesson) ? pass('reload restored a playable lesson') : fail('reload did not restore lesson');
    phase = 'navigation';
    await rapidAndBoundaryProbe(page, lesson);
    await page.locator('.nav-chrome .back-btn').click(); await page.waitForURL(/\/learning\/(index\.html)?$/);
    checks.navigation_during_animation = pass('Back during active state reached Learning');
    await visit(page, base, lesson); await page.locator('.nav-chrome .back-btn').click(); await page.waitForURL(/\/learning\/(index\.html)?$/); await visit(page, base, lesson);
    checks.repeated_entry_exit = pass('two exit/re-entry cycles restored lesson');

    phase = 'corrupt-state';
    await page.evaluate(({ lessonId }) => {
      sessionStorage.setItem('vb_pending_celebration', '{broken-json');
      const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
      if (profiles[0]) {
        profiles[0].features = profiles[0].features || {};
        profiles[0].features[lessonId] = 'malformed-feature-state';
        profiles[0].tierOverrides = { [lessonId]: 'not-a-tier' };
        localStorage.setItem('vb_profiles', JSON.stringify(profiles));
      }
    }, { lessonId: lesson.id });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    checks.stale_corrupt_synthetic_state = await alive(page, lesson)
      ? pass('malformed pending/feature/tier-override data did not block launch')
      : fail('corrupt synthetic state blocked lesson');
    checks.empty_min_max_values = tier === 1 || tier === 10
      ? pass(`T${tier} age boundary remained playable`) : na('age min/max boundary applies to T1/T10');

    phase = 'media-failure';
    let blockedMediaRequests = 0;
    await context.route(/\.(mp3|wav|ogg|m4a|mp4|webm)(\?|$)/i, route => { blockedMediaRequests++; return route.abort('failed'); });
    await page.addInitScript(() => {
      window.__auditRejectedMedia = 0;
      try { HTMLMediaElement.prototype.play = () => { window.__auditRejectedMedia++; return Promise.reject(new DOMException('synthetic media failure')); }; } catch {}
    });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    await rapidAndBoundaryProbe(page, lesson);
    await page.waitForTimeout(150);
    const rejectedMedia = await page.evaluate(() => window.__auditRejectedMedia || 0);
    checks.failed_media_network = blockedMediaRequests
      ? (await alive(page, lesson) ? pass(`${blockedMediaRequests} blocked media requests did not block lesson`) : fail('blocked media broke lesson'))
      : na('this route made no media request during the bounded probe');
    checks.interrupted_audio = rejectedMedia
      ? (await alive(page, lesson) ? pass(`recovered from ${rejectedMedia} rejected media plays`) : fail('audio interruption broke lesson'))
      : na('this route made no media play during the bounded probe');
    await context.unroute(/\.(mp3|wav|ogg|m4a|mp4|webm)(\?|$)/i);

    phase = 'offline';
    const controlled = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.register('../sw.js', { updateViaCache: 'none' });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))]);
      return !!navigator.serviceWorker.controller;
    }).catch(() => false);
    if (!controlled) await page.reload({ waitUntil: 'domcontentloaded' });
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) throw new Error('service worker did not control page');
    await page.reload({ waitUntil: 'networkidle' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    await page.waitForFunction(() => caches.match(location.href).then(Boolean), null, { timeout: 8000 });
    await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    checks.offline = await alive(page, lesson) ? pass('controlled offline reload restored lesson') : fail('offline reload failed');
    await context.setOffline(false);
    checks.timer_expiry = na('Learning route has no child-facing countdown-expiry mechanic');
    checks.long_repeated_play = blk('bounded run is not a long-duration soak');

    if (Object.values(checks).some(result => result.status === 'FAIL')) {
      const dir = path.join(OUT, 'failures'); mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${lesson.id}-T${tier}-${viewportName}.png`), fullPage: true });
    }
  } catch (error) {
    checks.runner = fail(`${phase}: ${error.name}: ${error.message}`);
    try { const dir = path.join(OUT, 'failures'); mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, `${lesson.id}-T${tier}-${viewportName}.png`), fullPage: true }); } catch {}
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
  if (errors.length) checks.runtime_errors = fail(errors.slice(0, 5).join(' | '));
  return { id: `${lesson.id}:T${tier}:${viewportName}`, activityId: lesson.id, route: lesson.route, tier, viewport: viewportName, checks, errors };
}

mkdirSync(OUT, { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
  cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
for (let i = 0; i < 100; i++) {
  try { await health(base); break; }
  catch { if (i === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const browser = await chromium.launch();
const started = Date.now();
const queue = [];
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) if (selectedViewports.includes(viewportName)) {
  for (const tier of selectedTiers) for (const lesson of LESSONS) if (selectedLessons.includes(lesson.id)) queue.push({ viewportName, viewport, tier, lesson });
}
const rows = [];
try {
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, job.lesson);
      rows.push(row);
      const failures = Object.values(row.checks).filter(result => result.status === 'FAIL').length;
      console.log(`${failures ? 'FAIL' : 'PASS'} ${row.id}${failures ? ` (${failures})` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length || 1) }, worker));
} finally {
  await browser.close();
  server.kill();
}
rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, na: 0, blk: 0 };
for (const row of rows) for (const result of Object.values(row.checks)) counts[result.status.toLowerCase()]++;
const report = { baseline: APP_BASELINE, base, generatedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - started) / 1000), counts, rows };
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, durationSec: report.durationSec }));
if (rows.length !== selectedViewports.length * selectedTiers.length * selectedLessons.length || counts.fail) process.exitCode = 1;
