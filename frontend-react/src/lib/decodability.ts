// Utilities to check Dutch decodability

const DIGRAPHS = [
  'aai',
  'ooi',
  'oei',
  'ieuw',
  'eeuw',
  'sch',
  'ng',
  'nk',
  'ch',
  'ij',
  'oe',
  'ui',
  'eu',
  'ei',
  'ie',
  'ou',
  'au',
  'uw',
];

const VOWELS = new Set([
  'a',
  'e',
  'i',
  'o',
  'u',
  'aa',
  'ee',
  'oo',
  'eu',
  'ie',
  'ij',
  'oe',
  'ui',
  'ou',
  'au',
  'ei',
  'aai',
  'ooi',
  'oei',
  'ieuw',
  'eeuw',
  'uw',
]);

export function parseGraphemes(text: string): string[] {
  const lower = text.toLowerCase();
  const result: string[] = [];
  let i = 0;
  while (i < lower.length) {
    let match = '';
    for (const d of DIGRAPHS) {
      if (lower.startsWith(d, i)) {
        match = d;
        break;
      }
    }
    if (match) {
      result.push(match);
      i += match.length;
    } else {
      const ch = lower[i];
      result.push(ch);
      i += 1;
    }
  }
  return result;
}

function patternOfWord(word: string): string {
  const gs = parseGraphemes(word);
  return gs
    .map((g) => (VOWELS.has(g) ? 'V' : g === '-' ? '-' : 'C'))
    .join('');
}

export function isDecodable(
  text: string,
  allowedGraphemes: string[],
  allowedPatterns: string[],
  maxWords: number,
): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length > maxWords) return false;
  const allowed = new Set(allowedGraphemes.map((g) => g.toLowerCase()));
  for (const w of words) {
    const clean = w.replace(/[.]/g, '');
    const gs = parseGraphemes(clean);
    for (const g of gs) {
      if (!allowed.has(g)) return false;
    }
    const pattern = patternOfWord(clean);
    if (!allowedPatterns.includes(pattern)) return false;
  }
  return true;
}

// Previously this module provided a simple fallback story generator
// based on a word bank. The main story pipeline no longer uses that
// functionality, so it has been removed.

