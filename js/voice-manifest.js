// Voice clip manifest — every phrase the app speaks.
//
// Strategy: most phrases are pre-generated as whole clips for natural prosody.
// Count-along's number+noun combos use atomic concatenation to avoid combinatorial blowup.
//
// Each entry's hash is the SHA1 of the lowercased trimmed text (first 16 hex chars).
// Audio lives at audio/<voice>/<hash>.mp3 where <voice> is 'girl' or 'boy'.

const COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Pink'];
const COLOR_THINGS = {
  Red:    ['Apple', 'Rose', 'Fire Truck', 'Heart'],
  Blue:   ['Blueberry', 'Ocean', 'Dolphin', 'Blue Heart'],
  Yellow: ['Sunflower', 'Lemon', 'Star', 'Bee'],
  Green:  ['Frog', 'Leaf', 'Broccoli', 'Turtle'],
  Purple: ['Grapes', 'Unicorn', 'Flower', 'Purple Heart'],
  Orange: ['Orange', 'Pumpkin', 'Fox', 'Carrot'],
  Pink:   ['Pig', 'Blossom', 'Flamingo', 'Pink Heart'],
};
const SHAPE_NAMES = ['Circle', 'Square', 'Triangle', 'Star', 'Heart', 'Diamond'];
// "The X says Y" — kid-friendly noun-sound pairing.
// id matches the SFX filename: audio/sounds/<id>.mp3
const ANIMALS = [
  { id:'cow',      name:'Cow',      sound:'Moo' },
  { id:'dog',      name:'Dog',      sound:'Bark' },
  { id:'cat',      name:'Cat',      sound:'Meow' },
  { id:'frog',     name:'Frog',     sound:'Ribbit' },
  { id:'lion',     name:'Lion',     sound:'Roar' },
  { id:'elephant', name:'Elephant', sound:'Trumpet' },
  { id:'sheep',    name:'Sheep',    sound:'Baa' },
  { id:'rooster',  name:'Rooster',  sound:'Cock-a-doodle-doo' },
  { id:'duck',     name:'Duck',     sound:'Quack' },
  { id:'horse',    name:'Horse',    sound:'Neigh' },
  { id:'pig',      name:'Pig',      sound:'Oink' },
  { id:'bear',     name:'Bear',     sound:'Growl' },
  { id:'owl',      name:'Owl',      sound:'Hoot' },
  { id:'snake',    name:'Snake',    sound:'Hiss' },
  { id:'bee',      name:'Bee',      sound:'Buzz' },
  { id:'monkey',   name:'Monkey',   sound:'Chatter' },
  { id:'chicken',  name:'Chicken',  sound:'Cluck' },
  { id:'goat',     name:'Goat',     sound:'Bleat' },
  { id:'donkey',   name:'Donkey',   sound:'Hee-haw' },
  { id:'mouse',    name:'Mouse',    sound:'Squeak' },
  { id:'tiger',    name:'Tiger',    sound:'Snarl' },
  { id:'wolf',     name:'Wolf',     sound:'Howl' },
  { id:'whale',    name:'Whale',    sound:'Sing' },
  { id:'dolphin',  name:'Dolphin',  sound:'Click' },
  { id:'seal',     name:'Seal',     sound:'Honk' },
  { id:'bird',     name:'Bird',     sound:'Tweet' },
  { id:'crow',     name:'Crow',     sound:'Caw' },
  { id:'turkey',   name:'Turkey',   sound:'Gobble' },
  { id:'rabbit',   name:'Rabbit',   sound:'Squeak' },
  { id:'fox',      name:'Fox',      sound:'Yip' },
];
// Voice says "The Cow says..." — actual sound plays as SFX after.
// Trailing comma keeps the prosody open-ended so the SFX continues naturally.
const ANIMAL_PHRASES = ANIMALS.map(a => `The ${a.name} says,`);

// Count-along nouns (singular + plural)
const COUNT_NOUNS = [
  'duck', 'ducks', 'horse', 'horses', 'pig', 'pigs', 'car', 'cars',
  'cat', 'cats', 'pizza', 'pizzas', 'flower', 'flowers',
  'butterfly', 'butterflies', 'ice cream', 'ice creams', 'fish',
  'balloon', 'balloons', 'apple', 'apples', 'dog', 'dogs', 'star', 'stars',
];

// Kid-specific greetings. Names listed here get pre-generated greeting MP3s
// so the app speaks their actual name in the curated voice. Add a new kid's
// name here, re-run scripts/generate-voices.mjs, ship.
const KID_NAMES = ['Noah', 'Leah'];

// "Tap the blue blueberry" style prompts — used when Hello Colors is in
// strict-thing mode (specific blueberry, not generic "blue thing").
const COLOR_THING_PROMPTS = [];
const COLOR_THING_NEAR_MISS = []; // "That's blue, but not a blueberry. Tap the blue blueberry."
Object.keys(COLOR_THINGS).forEach(c => {
  COLOR_THINGS[c].forEach(t => {
    COLOR_THING_PROMPTS.push(`Tap the ${c} ${t}!`);
    COLOR_THING_NEAR_MISS.push(`That's ${c}, but not a ${t}. Tap the ${c} ${t}.`);
  });
});

// Build full phrase list
const _phrases = [];
COLOR_NAMES.forEach(c => _phrases.push(c));
COLOR_NAMES.forEach(c => {
  COLOR_THINGS[c].forEach(t => {
    _phrases.push(`${t}! ${c}.`);
    _phrases.push(`Yes! ${t} is ${c}!`);
  });
});
COLOR_NAMES.forEach(c => _phrases.push(`Tap the ${c} thing!`));
COLOR_THING_PROMPTS.forEach(p => _phrases.push(p));
COLOR_THING_NEAR_MISS.forEach(p => _phrases.push(p));
SHAPE_NAMES.forEach(s => _phrases.push(s));
// Shape Match level-up (tier 7+): harder polygons + "count the sides"
['Pentagon', 'Hexagon', 'Octagon'].forEach(s => _phrases.push(s));
_phrases.push('How many sides?');
ANIMAL_PHRASES.forEach(p => _phrases.push(p));
_phrases.push('Try again!');
KID_NAMES.forEach(n => {
  _phrases.push(`Hi ${n}!`);
  _phrases.push(`Hi ${n}! Let's play!`);
  _phrases.push(`Hi ${n}! Welcome to your play space.`);
});

// New learning activities — atomic clips for repeated taps
// ABCs: every letter
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(L => _phrases.push(L));
// Days of week + "today is X"
const _DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
_DAYS.forEach(d => { _phrases.push(d); _phrases.push(`Today is ${d}!`); _phrases.push(`Yes! ${d}.`); });
// Coins
['Penny','Nickel','Dime','Quarter'].forEach(c => {
  _phrases.push(c);
  _phrases.push(`Tap the ${c}.`);
});
// Body Parts level-up (tier 6+): harder joints (singular — PRONOUN leaves them as-is)
['elbow','knee','shoulder'].forEach(p => {
  _phrases.push(`Where's the ${p}?`);
  _phrases.push(`Tap the ${p}!`);
  _phrases.push(`Yes! That's the ${p}.`);
  _phrases.push(`That's the ${p}.`);
});
// Body parts (plural form spoken to kids)
const _BODY = ['eyes','ears','hands','feet','nose','mouth','arms','legs','hair','belly'];
_BODY.forEach(p => {
  _phrases.push(`Tap the ${p}!`);
  _phrases.push(`Yes! That's the ${p}.`);
  _phrases.push(`That's the ${p}.`);
});
_phrases.push(`Where's the nose?`);
_phrases.push(`Where's the mouth?`);
_phrases.push(`Where's the eyes?`);
// Math
_phrases.push('plus'); _phrases.push('minus'); _phrases.push('times'); _phrases.push('equals');
_phrases.push('How many in all?');
_phrases.push('How many are left?');
_phrases.push(`What's the answer?`);
// Spelling words (short, recur often)
['CAT','DOG','PIG','SUN','EGG','HAT','BAT','BUG','CUP','BUS','BEE','COW',
 'FISH','STAR','MOON','BIRD','CAKE','TREE','BOOK','BALL'].forEach(w => {
  _phrases.push(w);
  _phrases.push(`Spell ${w}!`);
});
// Money
_phrases.push('How much money is here?');

// Memory Match + Clock Time (v107)
_phrases.push('Find the matching pairs!');
_phrases.push('A match!');
_phrases.push('What time is it?');

// Ribbon award — spoken in the child's voice when a ribbon is earned (js/celebrate.js)
_phrases.push('You earned a new ribbon!');

// ─────────────────────────────────────────────────────────────────────────────
// v123: FULL recorded-voice coverage (no browser TTS anywhere). Every string the
// activities pass to speak() must exist here verbatim, OR compose from atoms
// (math equations + money totals — see app.js _matchClips). Strings below mirror
// exactly what each activity speaks (e.g. Hello Colors says "Heart", not "Blue
// Heart" — the old prefixed entries above were drifted and silently fell to TTS).
// ─────────────────────────────────────────────────────────────────────────────
// Hello Colors — exact spoken thing names + older colours + odd-one-out + mixing
const _HC = {
  Red:['Apple','Rose','Fire Truck','Heart'], Blue:['Blueberry','Ocean','Dolphin','Heart'],
  Yellow:['Sunflower','Lemon','Star','Bee'], Green:['Frog','Leaf','Broccoli','Turtle'],
  Purple:['Grapes','Unicorn','Flower','Heart'], Orange:['Orange','Pumpkin','Fox','Carrot'],
  Pink:['Pig','Blossom','Flamingo','Heart'], Brown:['Bear','Chocolate','Log','Potato'],
  Gray:['Elephant','Fog','Shark','Rock'], Black:['Bat','Cat','Hat','Spider'],
  White:['Cloud','Swan','Milk','Snow'],
};
Object.keys(_HC).forEach(c => {
  _phrases.push(c, `Tap the ${c} thing!`,
    `Which one is NOT ${c}?`, `Yes! That one is not ${c}.`,
    `That one IS ${c}. Find the one that is not.`);
  _HC[c].forEach(t => _phrases.push(`${t}! ${c}.`, `Yes! ${t} is ${c}!`, `Tap the ${c} ${t}!`, `That's ${c}, but not a ${t}.`));
});
[['Red','Blue','Purple'],['Red','Yellow','Orange'],['Blue','Yellow','Green'],['Red','White','Pink'],['Black','White','Gray']]
  .forEach(([a,b,r]) => _phrases.push(`${a} plus ${b} makes what?`, `Yes! ${a} and ${b} make ${r}!`));
// Animal Sounds — success + classification + habitat
ANIMALS.forEach(a => _phrases.push(`Yes! The ${a.name}.`, `${a.name}! ${a.sound}`, `Yes! ${a.name}!`, a.name, `${a.sound}! ${a.sound}! Who am I?`));
['a mammal','a bird','a reptile','an amphibian','an insect'].forEach(g => _phrases.push(`Which one is ${g}?`));
['on a farm','in the ocean','in the wild'].forEach(h => _phrases.push(`Which one lives ${h}?`));
_phrases.push('Which animal makes this sound?');
// Body Parts — singular "Where's the X?"
['eye','ear','hand','foot','arm','leg','hair','belly'].forEach(p => _phrases.push(`Where's the ${p}?`));
// Days — quiz prompts + month names (for the Days level-up)
_DAYS.forEach(d => _phrases.push(`What day comes after ${d}?`, `What was the day before ${d}?`));
['January','February','March','April','May','June','July','August','September','October','November','December']
  .forEach(m => _phrases.push(m, `What month comes after ${m}?`));
// Spelling — longer words
['FROG','BOAT','APPLE','TIGER','TRAIN','HOUSE','ROBOT','GRAPE','ZEBRA','SNAKE','CLOUD','HEART','ORANGE','FLOWER','ROCKET','MONKEY','GUITAR','PENGUIN','RAINBOW','DOLPHIN','ELEPHANT','DINOSAUR']
  .forEach(w => _phrases.push(w, `Spell ${w}!`));
// Money — bills + identify + success
['Dollar Bill','Five Dollar Bill','Ten Dollar Bill'].forEach(m => _phrases.push(m, `Tap the ${m}.`));
['Penny','Nickel','Dime','Quarter','Dollar Bill','Five Dollar Bill','Ten Dollar Bill'].forEach(m => _phrases.push(`Yes! That's the ${m}.`));
['It costs','You pay','How much change?','dollars','cents'].forEach(p => _phrases.push(p));
// Count Along — skip counting
['Counting by 2s. What number comes next?','Counting by 5s. What number comes next?','Counting by 10s. What number comes next?'].forEach(p => _phrases.push(p));
// Math — operator atom + missing-number wrapper (numbers/operators compose)
_phrases.push('divided by', 'what equals');

// Numbers 0-100 spoken as digits (count-along to 50, math/money compose to 100)
const _numbers = [];
for (let i = 0; i <= 100; i++) _numbers.push(String(i));

// Prefix/connector atoms for runtime phrase assembly (count, math, money)
const _prefixes = ['Yes!', 'How many', 'plus', 'minus', 'times', 'divided by', 'equals', 'what equals', 'dollars', 'cents'];

// Generate stable hashes (must match generate-voices.mjs)
async function _sha1(s) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  return null;
}

// Synchronous fallback hash (FNV-1a) used to build the lookup map at load time.
// generate-voices.mjs uses the same algorithm so filenames match.
function _hash(s) {
  let h = 2166136261;
  const t = s.toLowerCase().trim();
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const VOICE_MANIFEST = {
  phrases: _phrases,
  numbers: _numbers,
  nouns: COUNT_NOUNS,
  prefixes: _prefixes,
  animals: ANIMALS,
  hash: _hash,
};

// Reverse lookup: text → filename hash
VOICE_MANIFEST.phraseHash = {};
_phrases.forEach(p => { VOICE_MANIFEST.phraseHash[p] = _hash(p); });
_numbers.forEach(n => { VOICE_MANIFEST.phraseHash[n] = _hash(n); });
COUNT_NOUNS.forEach(n => { VOICE_MANIFEST.phraseHash[n] = _hash(n); });
_prefixes.forEach(p => { VOICE_MANIFEST.phraseHash[p] = _hash(p); });

// All clips (for build script enumeration)
VOICE_MANIFEST.allClips = [..._phrases, ..._numbers, ...COUNT_NOUNS, ..._prefixes];

if (typeof module !== 'undefined') module.exports = { VOICE_MANIFEST };
