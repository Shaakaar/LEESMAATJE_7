import { isDecodable } from '@/lib/decodability';
import { MasteryTracker } from '@/lib/mastery';
import { CONTENT_CONFIG } from '@/lib/contentConfig';

test('decodability rejects disallowed digraph', () => {
  const unit = CONTENT_CONFIG.levels[0].units[0];
  const allowed = unit.focus_phonemes;
  expect(
    isDecodable('ik speel ui.', allowed, unit.allowed_patterns, unit.sentence_rules.max_words),
  ).toBe(false);
});

test('decodability enforces word limit', () => {
  const unit = CONTENT_CONFIG.levels[0].units[3]; // unit D
  const allowed = CONTENT_CONFIG.levels[0].units
    .slice(0, 4)
    .flatMap((u) => u.focus_phonemes);
  const longSentence = 'huis weg bos tak hut boom';
  expect(
    isDecodable(
      longSentence,
      allowed,
      unit.allowed_patterns,
      unit.sentence_rules.max_words,
    ),
  ).toBe(false);
});

test('mastery unlocks after consecutive accurate sessions', () => {
  const unit = CONTENT_CONFIG.levels[0].units[0];
  const tracker = new MasteryTracker({ accuracy: 0.93, sessions: 2 });
  tracker.record(unit, 0.95);
  expect(tracker.isMastered(unit)).toBe(false);
  tracker.record(unit, 0.94);
  expect(tracker.isMastered(unit)).toBe(true);
});

