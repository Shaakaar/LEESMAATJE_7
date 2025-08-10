export type WordError = {
  expected_word: string;
  heard_word?: string;
  issue: 'mispronunciation' | 'vowel' | 'consonant' | 'omission' | 'insertion';
  expected_phonemes?: string;
  heard_phonemes?: string;
  letter_errors?: unknown[];
};

export type HighlightResult = {
  map: Record<number, 'error' | 'correct'>;
  insertions: number[];
};

export function normalize(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
}

export function buildHighlightMap(
  referenceText: string,
  errors: WordError[],
  isCorrect: boolean,
): HighlightResult {
  const tokens = referenceText.split(/\s+/);
  const normTokens = tokens.map(normalize);
  const available: Record<string, number[]> = {};
  normTokens.forEach((t, i) => {
    if (!available[t]) available[t] = [];
    available[t].push(i);
  });

  const map: Record<number, 'error' | 'correct'> = {};
  const insertions: number[] = [];
  let prevMatched: number | undefined;

  for (const err of errors) {
    if (err.issue === 'insertion') {
      insertions.push(prevMatched ?? 0);
      continue;
    }
    const key = normalize(err.expected_word);
    const idxArr = available[key];
    if (idxArr && idxArr.length) {
      const idx = idxArr.shift()!;
      map[idx] = 'error';
      prevMatched = idx;
    }
  }

  if (isCorrect) {
    for (let i = 0; i < tokens.length; i++) {
      if (!map[i]) map[i] = 'correct';
    }
  }

  return { map, insertions };
}

