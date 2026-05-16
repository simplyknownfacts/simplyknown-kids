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
ANIMAL_PHRASES.forEach(p => _phrases.push(p));
_phrases.push('Try again!');
KID_NAMES.forEach(n => {
  _phrases.push(`Hi ${n}!`);
  _phrases.push(`Hi ${n}! Let's play!`);
});

// Numbers 1-50 spoken as digits
const _numbers = [];
for (let i = 1; i <= 50; i++) _numbers.push(String(i));

// Prefix atoms for count-along assembly
const _prefixes = ['Yes!', 'How many'];

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
