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

export interface SentenceRules {
  present: boolean; // always true
  max_words: number;
  punctuation: 'period_only';
  allow_names: boolean;
}

export interface MasteryThresholds {
  accuracy: number;
  sessions: number;
  pace_wcpm?: number;
}

export interface UnitSpec {
  id: UnitId;
  label: string;
  focus_phonemes: string[];
  allowed_patterns: string[];
  word_bank: string[];
  sentence_rules: SentenceRules;
  starts_sentences: boolean;
  mastery_thresholds: MasteryThresholds;
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
          focus_phonemes: ['m', 'r', 'v', 'i', 's', 'aa', 'p', 'e'],
          allowed_patterns: ['CV', 'CVC'],
          word_bank: ['ik', 'maan', 'roos', 'vis', 'pen', 'aan', 'en', 'sok'],
          sentence_rules: {
            present: true,
            max_words: 6,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: false,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'B',
          label: 'B',
          focus_phonemes: ['t', 'n', 'b', 'oo', 'ee'],
          allowed_patterns: ['CV', 'CVC', 'CVCC'],
          word_bank: ['teen', 'een', 'neus', 'buik', 'oog'],
          sentence_rules: {
            present: true,
            max_words: 6,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: false,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'C',
          label: 'C',
          focus_phonemes: ['d', 'oe', 'k', 'ij', 'z'],
          allowed_patterns: ['CV', 'CVC', 'CVCC'],
          word_bank: ['doos', 'poes', 'koek', 'ijs', 'zeep'],
          sentence_rules: {
            present: true,
            max_words: 6,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: false,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'D',
          label: 'D',
          focus_phonemes: ['h', 'w', 'o', 'a', 'u'],
          allowed_patterns: ['CV', 'CVC', 'CVCC'],
          word_bank: ['huis', 'weg', 'bos', 'tak', 'hut'],
          sentence_rules: {
            present: true,
            max_words: 7,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'E',
          label: 'E',
          focus_phonemes: ['eu', 'j', 'ie', 'l', 'ou', 'uu'],
          allowed_patterns: ['CV', 'CVC', 'CVCC', 'CCVC'],
          word_bank: ['reus', 'jas', 'riem', 'bijl', 'hout', 'vuur'],
          sentence_rules: {
            present: true,
            max_words: 7,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'F',
          label: 'F',
          focus_phonemes: ['g', 'ui', 'au', 'f', 'ei'],
          allowed_patterns: ['CV', 'CVC', 'CVCC', 'CCVC'],
          word_bank: ['geit', 'pauw', 'duif', 'ei'],
          sentence_rules: {
            present: true,
            max_words: 7,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'G',
          label: 'G',
          focus_phonemes: ['sch', 'ng'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['kist', 'drop', 'hond', 'slang', 'bank', 'springt', 'meeuw', 'ja', 'zo'],
          sentence_rules: {
            present: true,
            max_words: 8,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'H',
          label: 'H',
          focus_phonemes: ['nk', 'ch'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['bank', 'licht'],
          sentence_rules: {
            present: true,
            max_words: 8,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'I',
          label: 'I',
          focus_phonemes: ['aai', 'ooi', 'oei'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['kraai', 'kooi', 'groei'],
          sentence_rules: {
            present: true,
            max_words: 8,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'J',
          label: 'J',
          focus_phonemes: ['ieuw', 'eeuw', 'uw'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['nieuw', 'leeuw', 'uw'],
          sentence_rules: {
            present: true,
            max_words: 9,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'K',
          label: 'K',
          focus_phonemes: ['vr', 'sl', '-lijk', '-tig', '-ing'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: ['vragen', 'spelen', 'schotel', 'sturen', 'moeilijk', 'koning'],
          sentence_rules: {
            present: true,
            max_words: 9,
            punctuation: 'period_only',
            allow_names: true,
          },
          starts_sentences: true,
          mastery_thresholds: { accuracy: 0.93, sessions: 2 },
        },
        {
          id: 'L',
          label: 'L',
          focus_phonemes: ['consolideer'],
          allowed_patterns: ['CV', 'CVC', 'CCVC', 'CVCC'],
          word_bank: [],
          sentence_rules: {
            present: true,
            max_words: 9,
            punctuation: 'period_only',
            allow_names: true,
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

