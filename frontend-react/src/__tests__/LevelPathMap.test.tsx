import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LevelPathMap from '../components/level-map/LevelPathMap';

test('level 1 is clickable and others locked on first page', async () => {
  render(<LevelPathMap current={1} onSelect={() => {}} />);
  const level1 = screen.getByLabelText('Level 1');
  expect(level1).toBeEnabled();
  const locked = screen.getAllByLabelText(/locked/);
  expect(locked.length).toBe(5);
});

test('navigation buttons switch pages', async () => {
  const user = userEvent.setup();
  render(<LevelPathMap current={1} onSelect={() => {}} />);
  const next = screen.getByLabelText('Next levels');
  await user.click(next);
  expect(await screen.findByLabelText('Level 11 locked')).toBeDisabled();
  const prev = screen.getByLabelText('Previous levels');
  await user.click(prev);
  expect(await screen.findByLabelText('Level 1')).toBeInTheDocument();
});
