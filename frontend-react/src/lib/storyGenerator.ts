// Simplified story generation service relying on model quality

import OpenAI from 'openai';
import type { UnitSpec, LevelSpec } from './contentConfig';

const SYSTEM_MESSAGE = `Je bent een Nederlandse verhalenmaker voor jonge kinderen (4–8 jaar).
Doel en stijl (houd je hier aan):
• Schrijf in eenvoudig, kindvriendelijk Nederlands.
• Tegenwoordige tijd. Eén duidelijk idee per zin.
• Zinnen zijn kort: 3–8 woorden.
• Interpunctie: alleen een punt (.) aan het einde van elke zin.
• Namen zijn toegestaan; als je een naam gebruikt, houd die dan consequent in dit verhaal.
• Elke beurt is een mini-scène:
  (1) start/setting,
  (2–3) kleine stappen,
  (4) een zacht gevolg,
  (5) een klein spanningsmoment dat naar een keuze leidt.
• Geef daarna precies twee korte richtingzinnen (keuzes) in de gebiedende wijs, 2–4 woorden, parallel en betekenisvol.

Uitvoer = ÉÉN JSON-object en verder niets:
{
  "sentences": [5 korte zinnen],
  "directions": [2 korte keuzes]
}
Geen uitleg, geen extra tekst, geen markdown.`;

const SCHEMA = {
  type: 'json_schema',
  name: 'ContinueStory',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sentences: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: { type: 'string' },
      },
      directions: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: { type: 'string' },
      },
    },
    required: ['sentences', 'directions'],
  },
} as const;

export interface GenerateOptions {
  theme: string;
  level: LevelSpec;
  unit: UnitSpec;
  chosenDirection?: string;
  storySoFar?: string;
  temperature?: number;
  allowedGraphemes?: string[];
  allowedPatterns?: string[];
  maxWords?: number;
}

export async function generateTurn({
  theme,
  level,
  unit,
  chosenDirection,
  storySoFar,
  temperature = 0.4,
  allowedGraphemes,
  allowedPatterns,
  maxWords,
}: GenerateOptions) {
  const userPrompt = buildUserPrompt({
    theme,
    levelLabel: level.label,
    unitLabel: unit.label,
    chosenDirection,
    storySoFar,
    allowedGraphemes,
    allowedPatterns,
    maxWords,
  });

  const client = new OpenAI({
    apiKey: import.meta.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  const res = await client.responses.parse({
    model: 'gpt-4.1-mini',
    temperature,
    max_output_tokens: 300,
    input: [
      { role: 'system', content: SYSTEM_MESSAGE },
      { role: 'user', content: userPrompt },
    ],
    text: { format: SCHEMA },
  });
  type OutputItem = { content?: Array<{ text?: string }> };
  const json = (res.output[0] as OutputItem)?.content?.[0]?.text;
  if (!json) throw new Error('empty response');
  return JSON.parse(json) as {
    sentences: string[];
    directions: string[];
  };
}

function buildUserPrompt(opts: {
  theme: string;
  levelLabel: string;
  unitLabel: string;
  chosenDirection?: string;
  storySoFar?: string;
  allowedGraphemes?: string[];
  allowedPatterns?: string[];
  maxWords?: number;
}): string {
  const {
    theme,
    levelLabel,
    unitLabel,
    chosenDirection,
    storySoFar,
    allowedGraphemes,
    allowedPatterns,
    maxWords,
  } = opts;
  const parts = [
    `Thema: ${theme}`,
    `Niveau/Unit (optioneel): ${levelLabel} ${unitLabel}`,
    `Richting die is gekozen (vorige stap): ${chosenDirection ?? ''}`,
  ];
  if (storySoFar)
    parts.push(`Verhaal tot nu toe (optioneel): "${storySoFar}"`);
  parts.push(
    '',
    'Beperkingen voor deze stap:',
    `• Toegestane letters/klanken: ${(allowedGraphemes ?? []).join(', ')}.`,
    `• Toegestane woordpatronen: ${(allowedPatterns ?? []).join(', ')}.`,
    `• Maximaal ${maxWords ?? 8} woorden per zin.`,
    '',
    'Schrijf vijf korte, kindvriendelijke zinnen die logisch doorgaan en binnen deze grenzen blijven.',
    'Geef daarna precies twee nieuwe keuzes (gebiedende wijs, 2–4 woorden).',
  );
  return parts.join('\n');
}

