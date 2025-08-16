// Content configuration and types for Dutch early reading track
// Defines levels and units with phoneme focus, patterns, and mastery rules

export type TrackId = 'AVI';

export type UnitId =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L';

export type Mode = 'words' | 'story';

export interface SentenceRules {
  present: true;
  punctuation: 'period_only';
  max_words: number;
  focus_usage_min?: number;
}

export interface MasteryThresholds {
  accuracy: number;
  sessions: number;
  pace_wcpm?: number;
}

export interface UnitSpec {
  id: UnitId;
  label: string;
  mode: Mode;
  strict_forbid: boolean;
  focus_klanken: string[];
  allowed_patterns: string[];
  word_bank: string[];
  sentence_rules?: SentenceRules;
  starts_sentences?: boolean;
  mastery_thresholds?: MasteryThresholds;
}

export interface LevelSpec {
  id: 'AVI-Start' | 'AVI-M3' | 'AVI-E3' | 'AVI-M4' | 'AVI-E4';
  label: string;
  units: UnitSpec[];
  defaults: { mastery: MasteryThresholds };
}

export interface ContentConfig {
  track: TrackId;
  levels: LevelSpec[];
}

export const CONTENT_CONFIG: ContentConfig = {
  track: 'AVI',
  levels: [
    {
      id: 'AVI-Start',
      label: 'AVI Start',
      defaults: { mastery: { accuracy: 0.93, sessions: 2, pace_wcpm: 35 } },
      units: [
        {
          id: 'A',
          label: 'A',
          mode: 'words',
          strict_forbid: true,
          focus_klanken: ['m', 'r', 'v', 'i', 's', 'aa', 'p', 'e'],
          allowed_patterns: ['CV', 'CVC'],
          word_bank: ['ik', 'maan', 'roos', 'vis', 'pen', 'aan', 'en', 'sok'],
          starts_sentences: false,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'B',
          label: 'B',
          mode: 'words',
          strict_forbid: true,
          focus_klanken: ['t', 'n', 'b', 'oo', 'ee'],
          allowed_patterns: ['CV', 'CVC', 'CVCC'],
          word_bank: ['teen', 'een', 'neus', 'buik', 'oog'],
          starts_sentences: false,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'C',
          label: 'C',
          mode: 'words',
          strict_forbid: true,
          focus_klanken: ['d', 'oe', 'k', 'ij', 'z'],
          allowed_patterns: ['CV', 'CVC', 'CVCC'],
          word_bank: ['doos', 'poes', 'koek', 'ijs', 'zeep'],
          starts_sentences: false,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'D',
          label: 'D',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['h', 'w', 'o', 'a', 'u'],
          allowed_patterns: ['CV', 'CVC', 'CVCC'],
          word_bank: ['huis', 'weg', 'bos', 'tak', 'hut'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'E',
          label: 'E',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['eu', 'j', 'ie', 'l', 'ou', 'uu'],
          allowed_patterns: ['CV', 'CVC', 'CVCC', 'CCVC'],
          word_bank: ['reus', 'jas', 'riem', 'bijl', 'hout', 'vuur'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'F',
          label: 'F',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['g', 'ui', 'au', 'f', 'ei'],
          allowed_patterns: ['CV', 'CVC', 'CVCC', 'CCVC'],
          word_bank: ['geit', 'pauw', 'duif', 'ei'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'G',
          label: 'G',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['sch', 'ng'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['kist', 'drop', 'hond', 'slang', 'bank', 'springt', 'meeuw', 'ja', 'zo'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'H',
          label: 'H',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['nk', 'ch'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['bank', 'licht'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'I',
          label: 'I',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['aai', 'ooi', 'oei'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['kraai', 'kooi', 'groei'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'J',
          label: 'J',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['ieuw', 'eeuw', 'uw'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['nieuw', 'leeuw', 'uw'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'K',
          label: 'K',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['vr', 'sl', '-lijk', '-tig', '-ing'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['vragen', 'spelen', 'schotel', 'sturen', 'moeilijk', 'koning'],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'L',
          label: 'L',
          mode: 'story',
          strict_forbid: false,
          focus_klanken: ['consolideer'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: [],
          sentence_rules: {
            present: true,
            punctuation: 'period_only',
            max_words: 7,
            focus_usage_min: 3,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
      ],
    },
    {
      id: 'AVI-M3',
      label: 'AVI M3',
      defaults: { mastery: { accuracy: 0.94, sessions: 2, pace_wcpm: 45 } },
      units: [],
    },
    {
      id: 'AVI-E3',
      label: 'AVI E3',
      defaults: { mastery: { accuracy: 0.95, sessions: 2, pace_wcpm: 60 } },
      units: [],
    },
    {
      id: 'AVI-M4',
      label: 'AVI M4',
      defaults: { mastery: { accuracy: 0.95, sessions: 2, pace_wcpm: 75 } },
      units: [],
    },
    {
      id: 'AVI-E4',
      label: 'AVI E4',
      defaults: { mastery: { accuracy: 0.96, sessions: 2, pace_wcpm: 90 } },
      units: [],
    },
  ],
};

export function loadContentConfig(): ContentConfig {
  return CONTENT_CONFIG;
}

