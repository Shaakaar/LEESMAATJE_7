import { render, screen } from '@testing-library/react';
import LevelMap from '../components/level-map/LevelMap';

test('renders 10 islands with only level 1 enabled', () => {
  render(<LevelMap current={1} onSelect={() => {}} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(10);
  buttons.forEach((btn, idx) => {
    if (idx === 0) {
      expect(btn).toBeEnabled();
    } else {
      expect(btn).toBeDisabled();
    }
  });
});
