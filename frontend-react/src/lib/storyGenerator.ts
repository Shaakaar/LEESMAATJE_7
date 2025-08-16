export async function generateWords(params: {
  levelId: string;
  unitId: string;
  focusGraphemes: string[];
  allowedGraphemes: string[];
  allowedPatterns: string[];
}) {
  const res = await fetch('/api/generate_words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level: params.levelId,
      unit: params.unitId,
      focus: params.focusGraphemes,
      allowed: params.allowedGraphemes,
      patterns: params.allowedPatterns,
    }),
  });
  if (!res.ok) throw new Error('word generation failed');
  return (await res.json()) as { words: string[] };
}

export async function generateStory(params: {
  theme?: string;
  levelId: string;
  unitId: string;
  chosenDirection: string;
  storySoFar?: string;
  focusGraphemes: string[];
  allowedGraphemes: string[];
  allowedPatterns: string[];
  maxWords: number;
  strictForbid: boolean;
}) {
  const res = await fetch('/api/continue_story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      theme: params.theme,
      level: params.levelId,
      unit: params.unitId,
      direction: params.chosenDirection,
      story: params.storySoFar,
      focus: params.focusGraphemes,
      allowed: params.allowedGraphemes,
      patterns: params.allowedPatterns,
      max_words: params.maxWords,
      strict_forbid: params.strictForbid,
    }),
  });
  if (!res.ok) throw new Error('story generation failed');
  return (await res.json()) as { sentences: string[]; directions: string[] };
}
