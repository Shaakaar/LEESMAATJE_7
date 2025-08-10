import { buildHighlightMap, normalize, WordError } from '../utils/highlight';

test('perfect read marks all words correct', () => {
  const ref = 'De kat zit';
  const res = buildHighlightMap(ref, [], true);
  expect(res.map).toEqual({0:'correct',1:'correct',2:'correct'});
});

test('mispronounced word highlights only that word', () => {
  const ref = 'De kat zit';
  const errors: WordError[] = [{expected_word:'kat', issue:'mispronunciation'}];
  const res = buildHighlightMap(ref, errors, false);
  expect(res.map[1]).toBe('error');
  expect(res.map[0]).toBeUndefined();
  expect(res.map[2]).toBeUndefined();
});

test('omitted word highlights missing token', () => {
  const ref = 'De kat zit';
  const errors: WordError[] = [{expected_word:'zit', issue:'omission'}];
  const res = buildHighlightMap(ref, errors, false);
  expect(res.map[2]).toBe('error');
});

test('insertion marks previous token with dotted underline', () => {
  const ref = 'Ik zie een kat';
  const errors: WordError[] = [{expected_word:'', heard_word:'de', issue:'insertion'}];
  const res = buildHighlightMap(ref, errors, false);
  expect(res.insertions).toEqual([0]);
});

test('duplicate words consume left to right', () => {
  const ref = 'de de kat';
  const errors: WordError[] = [
    {expected_word:'de', issue:'mispronunciation'},
    {expected_word:'de', issue:'omission'},
  ];
  const res = buildHighlightMap(ref, errors, false);
  expect(res.map).toEqual({0:'error',1:'error'});
});

test('normalize strips punctuation and case', () => {
  expect(normalize('Kat.')).toBe('kat');
  expect(normalize('"Hond"')).toBe('hond');
});
