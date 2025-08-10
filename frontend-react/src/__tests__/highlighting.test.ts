import { buildErrorIndices } from '../utils/highlighting';

test('buildErrorIndices highlights errors using expected_word', () => {
  const reference = 'foo bar baz';
  const errors = [{ expected_word: 'bar' }];
  expect(buildErrorIndices(reference, errors)).toEqual(new Set([1]));
});

test('buildErrorIndices falls back to word when expected_word is missing', () => {
  const reference = 'foo bar baz';
  const errors = [{ word: 'baz' }];
  expect(buildErrorIndices(reference, errors)).toEqual(new Set([2]));
});
