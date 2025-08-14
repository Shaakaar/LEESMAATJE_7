// Simplified story generation service relying on model quality

import OpenAI from 'openai';
export interface GenerateOptions {
  theme?: string;
  focusGraphemes: string[];
  allowedGraphemes: string[];
  allowedPatterns: string[];
  maxWords: number;
  chosenDirection?: string;
  storySoFar?: string;
  temperature?: number;
}

const SYSTEM_MESSAGE = `Je bent een Nederlandse verhalenmaker voor jonge kinderen (4–8 jaar).

Stijl (houd je hieraan):
• Eenvoudig, kindvriendelijk Nederlands in de tegenwoordige tijd.
• Korte zinnen: 3–8 woorden (of korter als nodig).
• Alleen een punt (.) aan het einde van elke zin.
• Namen zijn toegestaan; als je een naam gebruikt, houd die consequent.

Structuur per beurt:
• Vijf zinnen vormen samen één mini-scène.
• Zin 1–2 voeren de gekozen richting echt uit.
• Daarna geef je precies twee korte richtingzinnen (keuzes), gebiedende wijs, 2–4 woorden, parallel en betekenisvol.

Uitvoer = ÉÉN JSON-object en verder niets:
{
  "sentences": [5 korte zinnen],
  "directions": [2 korte keuzes]
}
Geen uitleg, geen extra tekst, geen markdown.`;

export async function generateTurn({
  theme,
  focusGraphemes,
  allowedGraphemes,
  allowedPatterns,
  maxWords,
  chosenDirection,
  storySoFar,
  temperature = 0.9,
}: GenerateOptions) {
  const userPrompt = buildUserPrompt({
    theme,
    chosenDirection,
    storySoFar,
    focusGraphemes,
    allowedGraphemes,
    allowedPatterns,
    maxWords,
  });

  const client = new OpenAI({
    apiKey: import.meta.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  const res = await client.responses.create({
    model: 'gpt-4o',
    temperature,
    top_p: 1.0,
    max_output_tokens: 300,
    response_format: { type: 'json_object' },
    input: [
      { role: 'system', content: SYSTEM_MESSAGE },
      { role: 'user', content: userPrompt },
    ],
  });

  const json = res.output[0]?.content?.[0]?.text;
  if (!json) throw new Error('empty response');
  return JSON.parse(json) as {
    sentences: string[];
    directions: string[];
  };
}

function buildUserPrompt(opts: {
  theme?: string;
  chosenDirection?: string;
  storySoFar?: string;
  focusGraphemes: string[];
  allowedGraphemes: string[];
  allowedPatterns: string[];
  maxWords: number;
}): string {
  const {
    theme,
    chosenDirection,
    storySoFar,
    focusGraphemes,
    allowedGraphemes,
    allowedPatterns,
    maxWords,
  } = opts;
  const parts = [
    `Thema (optioneel): ${theme ?? ''}`,
    `Richting die is gekozen (vorige stap): ${chosenDirection ?? ''}`,
    `Verhaal tot nu toe (optioneel): "${storySoFar ?? ''}"`,
    '',
    'Beperkingen voor deze stap (houd het natuurlijk):',
    `• Focusklanken (deze wil ik sowieso terugzien): ${focusGraphemes.join(', ')}`,
    `• Je mag daarnaast ook andere letters/klanken gebruiken die al geleerd zijn: ${allowedGraphemes.join(', ')}`,
    `• Woordpatronen (informatief): ${allowedPatterns.join(', ')}`,
    `• Maximaal ${maxWords} woorden per zin`,
    '',
    'Schrijf vijf korte, kindvriendelijke zinnen die logisch doorgaan en die',
    'minstens twee verschillende klanken uit de focuslijst bevatten.',
    'Geef daarna precies twee nieuwe keuzes (gebiedende wijs, 2–4 woorden).',
  ];
  return parts.join('\n');
}


