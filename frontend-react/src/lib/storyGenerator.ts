// Story generation service using OpenAI with strict schema and decodability guard

import OpenAI from 'openai';
import type { UnitSpec, LevelSpec } from './contentConfig';
import { isDecodable, buildFallback } from './decodability';

const SYSTEM_MESSAGE = `Je bent een Nederlandse verhalenmaker voor beginnende lezers (4–8 jaar).
Stijl en regels (STRIKT):
• Toon: warm, veilig, eenvoudig. Tijd: tegenwoordige tijd.
• Zinnen: kort en concreet, 4–9 woorden (later max 12).
• Interpunctie: alleen een punt (.) aan het einde van elke zin.
• Woorden: veelvoorkomende, decodabele woorden passend bij de opgegeven klanken/patronen.
• Namen zijn toegestaan (eenvoudig), maar houd het perspectief binnen dit verhaal consistent.
• Geen aanhalingstekens, geen cijfers, geen moeilijke vaktermen.
• Mini-scène per beurt: (1) start, (2–3) kleine stappen, (4) gevolg, (5) zacht spanningspunt.

Uitvoer (STRIKT JSON):
{
  "sentences": [vijf zinnen],
  "directions": [twee keuzes, gebiedende wijs, 2–4 woorden]
}
Geen extra tekst, geen uitleg, geen markdown.`;

const SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'ContinueStory',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sentences: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: { type: 'string', minLength: 3, maxLength: 120 },
        },
        directions: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'string', minLength: 2, maxLength: 60 },
        },
      },
      required: ['sentences', 'directions'],
    },
  },
} as const;

export interface GenerateOptions {
  theme: string;
  level: LevelSpec;
  unit: UnitSpec;
  allowedGraphemes: string[];
  storySoFar?: string;
  focus?: string[];
  temperature?: number;
}

export async function generateTurn({
  theme,
  level,
  unit,
  allowedGraphemes,
  storySoFar,
  focus,
  temperature = 0.2,
}: GenerateOptions) {
  const userPrompt = buildUserPrompt({
    theme,
    levelId: level.id,
    unitId: unit.id,
    allowedGraphemes,
    allowedPatterns: unit.allowed_patterns,
    maxWords: unit.sentence_rules.max_words,
    storySoFar,
    focus,
  });

  const client = new OpenAI({
    apiKey: import.meta.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  async function callModel() {
    const res = await client.responses.parse({
      model: 'gpt-4.1-mini',
      temperature,
      max_output_tokens: 300,
      input: [
        { role: 'system', content: SYSTEM_MESSAGE },
        { role: 'user', content: userPrompt },
      ],
      response_format: SCHEMA,
    });
    type OutputItem = { content?: Array<{ text?: string }> };
    return (res.output[0] as OutputItem)?.content?.[0]?.text;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = await callModel();
      if (!json) throw new Error('empty response');
      const data = JSON.parse(json) as {
        sentences: string[];
        directions: string[];
      };
      const ok = [...data.sentences, ...data.directions].every((s) =>
        isDecodable(s, allowedGraphemes, unit.allowed_patterns, unit.sentence_rules.max_words),
      );
      if (ok) return data;
    } catch {
      /* ignore */
    }
  }
  return buildFallback(unit, allowedGraphemes);
}

function buildUserPrompt(opts: {
  theme: string;
  levelId: string;
  unitId: string;
  allowedGraphemes: string[];
  allowedPatterns: string[];
  maxWords: number;
  storySoFar?: string;
  focus?: string[];
}): string {
  const {
    theme,
    levelId,
    unitId,
    allowedGraphemes,
    allowedPatterns,
    maxWords,
    storySoFar,
    focus,
  } = opts;
  const parts = [
    `Thema: ${theme}`,
    `Niveau: ${levelId}  Eenheid: ${unitId}`,
    `Toegestane klanken/letters: ${allowedGraphemes.join(', ')}`,
    `Toegestane patronen: ${allowedPatterns.join(', ')}`,
    `Maximale woorden per zin: ${maxWords}`,
  ];
  if (storySoFar) parts.push(`Verhaalsamenvatting tot nu toe: "${storySoFar}"`);
  if (focus && focus.length)
    parts.push(`Focus (optioneel): ${focus.join(', ')}`);
  parts.push(
    'Schrijf vijf korte, decodabele zinnen die logisch doorgaan.',
  );
  parts.push('Gebruik alleen toegestane klanken/patronen; vermijd andere klanken.');
  parts.push('Geef precies twee korte keuzes (gebiedende wijs, 2–4 woorden).');
  return parts.join('\n');
}

