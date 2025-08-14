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
}

const SYSTEM_MESSAGE = `Je bent een Nederlandse verhalenmaker voor kinderen die leren lezen op AVI-niveau Start t/m E3.

🎯 DOEL:
Schrijf korte, begrijpelijke mini-verhaaltjes die kinderen helpen oefenen met lezen.

👩‍🏫 STIJL:
• Alleen tegenwoordige tijd.
• Alleen correcte Nederlandse spelling en grammatica.
• Alleen een punt (.) als leesteken — geen vraagtekens, uitroeptekens of aanhalingstekens.
• Korte zinnen van 3–8 woorden.
• Gebruik gevarieerde werkwoorden (niet steeds dezelfde).
• Namen zijn toegestaan — houd ze consequent binnen het verhaal.
• Laat kinderen zich de scène kunnen voorstellen (kleur, geluid, beweging).

📐 STRUCTUUR:
• Vijf zinnen vormen samen één logisch mini-verhaal.
• Zin 1–2 voeren de gekozen richting echt uit.
• Zin 3–5 bouwen logisch verder en eindigen met een klein spanningsmoment.

🧭 KEUZES:
• Geef daarna precies twee nieuwe richtingzinnen.
• De keuzes zijn kort (2–4 woorden), in gebiedende wijs, logisch en evenwaardig.

📌 FOCUSKLANKEN:
• Gebruik minstens 3 woorden in het verhaal die een focusklank bevatten.
• De focusklanken worden meegegeven in de gebruikersinstructie.
• Gebruik ze als lettergroep in echte Nederlandse woorden (bijv. [aa] in "maan").

👧 DOELGROEP:
Kinderen van 4–7 jaar, AVI Start t/m E3.

📦 UITVOER (STRICT JSON):
{
  "sentences": [5 korte zinnen],
  "directions": [2 keuzes]
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
    temperature: 1.0,
    top_p: 1.0,
    presence_penalty: 0,
    frequency_penalty: 0,
    max_output_tokens: 300,
    response_format: { type: 'json_object' },
    input: [
      { role: 'system', content: SYSTEM_MESSAGE },
      { role: 'user', content: userPrompt },
    ],
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

  const uniq = [...new Set(focusGraphemes)];
  const FOCUS_RULE_BLOCK =
    uniq.length === 0
      ? ''
      : `• Gebruik minstens 3 keer een klank uit deze lijst: [${uniq.join(', ')}]\n`;

  return `Thema (optioneel): ${theme ?? ''}
Richting die is gekozen: ${chosenDirection}
Verhaal tot nu toe: "${storySoFar ?? ''}"

🔤 KLANKEN EN STRUCTUREN:
${FOCUS_RULE_BLOCK}• Je mag daarnaast ook andere eerder geleerde klanken gebruiken: [${allowedGraphemes.join(', ')}]
• Toegestane woordstructuren (informatief): [${allowedPatterns.join(', ')}]
• Maximaal ${maxWords} woorden per zin

🎬 SCHRIJF NU:
Denk goed na over de gekozen richting en voer die uit in zin 1–2.
Schrijf daarna drie zinnen die logisch verdergaan en eindigen in een klein spanningsmoment.

Gebruik alleen bestaande Nederlandse woorden die passen bij de opgegeven klanken.
Houd het vrolijk, veilig en geschikt voor jonge kinderen.

Schrijf vijf korte zinnen die samen één mini-scène vormen.
Geef daarna precies twee nieuwe keuzes, beide in gebiedende wijs (2–4 woorden).`;
}


