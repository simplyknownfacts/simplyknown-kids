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
const ANIMAL_PHRASES = [
  'Moo! Moo! I am the Cow!',
  'Woof! Woof! I am the Dog!',
  'Meow! Meow! I am the Cat!',
  'Ribbit! Ribbit! I am the Frog!',
  'Roar! Roar! I am the Lion!',
  'Pawoo! Pawoo! I am the Elephant!',
  'Baa! Baa! I am the Sheep!',
  'Cock-a-doodle-doo! Cock-a-doodle-doo! I am the Rooster!',
  'Quack! Quack! I am the Duck!',
  'Neigh! Neigh! I am the Horse!',
];

// Count-along nouns (singular + plural)
const COUNT_NOUNS = [
  'duck', 'ducks', 'horse', 'horses', 'pig', 'pigs', 'car', 'cars',
  'cat', 'cats', 'pizza', 'pizzas', 'flower', 'flowers',
  'butterfly', 'butterflies', 'ice cream', 'ice creams', 'fish',
  'balloon', 'balloons', 'apple', 'apples', 'dog', 'dogs', 'star', 'stars',
];

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
SHAPE_NAMES.forEach(s => _phrases.push(s));
ANIMAL_PHRASES.forEach(p => _phrases.push(p));
_phrases.push('Try again!');

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
