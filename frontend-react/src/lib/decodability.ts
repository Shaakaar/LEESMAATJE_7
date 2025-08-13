// Utilities to check Dutch decodability and build simple fallbacks

import type { UnitSpec } from './contentConfig';

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

const FALLBACK_NAMES = ['Sam', 'Rik', 'Mia', 'Noor', 'Lila', 'Pim'];
const FALLBACK_VERBS = ['ziet', 'heeft', 'pakt', 'maakt'];

function pickDecodable(
  list: string[],
  allowed: string[],
): string | undefined {
  return list.find((w) => isDecodable(w, allowed, ['CV', 'CVC', 'CVCC', 'CCVC'], 1));
}

export function buildFallback(unit: UnitSpec, allowed: string[]): {
  sentences: string[];
  directions: string[];
} {
  const name = pickDecodable(FALLBACK_NAMES, allowed) ?? 'Sam';
  const sentences: string[] = [];
  for (let i = 0; i < 5; i++) {
    const verb = pickDecodable(FALLBACK_VERBS, allowed) ?? 'ziet';
    const obj = unit.word_bank[i % unit.word_bank.length] ?? name.toLowerCase();
    const s = `${name} ${verb} ${obj}.`;
    sentences.push(s);
  }
  const directions = ['ga door', 'ga terug'];
  return { sentences, directions };
}

