export function normalize(w: string): string {
  // lowercase + trim leading/trailing punctuation (unicode aware if possible)
  // Keep apostrophes/letters/numbers.
  return w
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
}

export function buildErrorIndices(
  referenceText: string,
  errors: Array<{ expected_word?: string; issue?: string }>
): Set<number> {
  const tokens = referenceText.split(/\s+/);
  const idxByNorm = new Map<string, number[]>();
  tokens.forEach((t, i) => {
    const k = normalize(t);
    if (!idxByNorm.has(k)) idxByNorm.set(k, []);
    idxByNorm.get(k)!.push(i);
  });

  const takeLeftmost = (k: string) => {
    const arr = idxByNorm.get(k);
    if (!arr || arr.length === 0) return undefined;
    return arr.shift();
  };

  const errorIdx = new Set<number>();
  for (const e of errors || []) {
    const k = normalize(e.expected_word || '');
    const i = takeLeftmost(k);
    if (typeof i === 'number') errorIdx.add(i);
  }
  return errorIdx;
}
