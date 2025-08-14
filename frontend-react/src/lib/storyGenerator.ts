// Simplified story generation service relying on model quality

import OpenAI from 'openai';
export interface GenerateOptions {
  focusGraphemes: string[];
  allowedGraphemes: string[];
  allowedPatterns: string[];
  maxWords: number;
  chosenDirection: string;
  storySoFar?: string;
  theme?: string;
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
  focusGraphemes,
  allowedGraphemes,
  allowedPatterns,
  maxWords,
  chosenDirection,
  storySoFar,
  theme,
  temperature = 0.9,
}: GenerateOptions) {
  const userPrompt = buildUserPrompt({
    chosenDirection,
    storySoFar,
    theme,
    focusGraphemes,
    allowedGraphemes,
    allowedPatterns,
    maxWords,
  });

  if (import.meta.env.DEV) {
    console.log('System message:', SYSTEM_MESSAGE);
    console.log('User message:', userPrompt);
  }

  const client = new OpenAI({
    apiKey: import.meta.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  const res = await client.responses.create({
    model: 'gpt-4o',
    temperature,
    top_p: 1.0,
    max_output_tokens: 300,
    input: [
      { role: 'system', content: SYSTEM_MESSAGE },
      { role: 'user', content: userPrompt },
    ],
    text: { format: { type: 'json_object' } },
  });

  const json = res.output_text;
  if (!json) throw new Error('empty response');
  return JSON.parse(json) as {
    sentences: string[];
    directions: string[];
  };
}

function buildUserPrompt(opts: {
  theme?: string;
  chosenDirection: string;
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

  const focusLines = buildFocusLines(focusGraphemes);

  const parts = [
    `Thema (optioneel): ${theme ?? ''}`,
    `Richting die is gekozen (vorige stap): ${chosenDirection}`,
    `Verhaal tot nu toe (optioneel): "${storySoFar ?? ''}"`,
    '',
    'Beperkingen voor deze stap (houd het natuurlijk):',
    ...focusLines,
    `• Je mag daarnaast ook andere letters/klanken gebruiken die al geleerd zijn: [${allowedGraphemes.join(', ')}]`,
    `• Woordpatronen (informatief): [${allowedPatterns.join(', ')}]`,
    `• Maximaal ${maxWords} woorden per zin`,
    '',
    'Schrijf vijf korte, kindvriendelijke zinnen die logisch doorgaan.',
    'Zin 1–2 voeren de gekozen richting echt uit.',
    'Geef daarna precies twee nieuwe keuzes (gebiedende wijs, 2–4 woorden).',
  ];

  return parts.join('\n');
}

function buildFocusLines(focusList: string[]): string[] {
  const focusItems = focusList.map((x) => x.trim()).filter(Boolean);
  const uniq = Array.from(new Set(focusItems));
  const n = uniq.length;
  if (n === 0) return [];
  if (n <= 2) {
    return [
      `• Focusklanken (laat ze samen minstens drie keer terugkomen, elk ten minste één keer): [${uniq.join(', ')}]`,
      '  Voorbeeld: gebruik de lettergroep zichtbaar in een woord.',
    ];
  }
  const need = Math.min(3, n);
  return [
    `• Focusklanken (laat minstens ${need} verschillende items terugkomen): [${uniq.join(', ')}]`,
    "  Voorbeeld: 'maan' bevat [aa], 'bank' bevat [nk].",
  ];
}


