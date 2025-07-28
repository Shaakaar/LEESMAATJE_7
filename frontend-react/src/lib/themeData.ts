import type { LevelTheme } from '@/types';

// Derived from webapp/backend/config.py::STORIES
export const THEMES_BY_LEVEL: Record<number, LevelTheme[]> = {
  1: [{ id: 'animals', title: 'Dieren' }],
};

export function getThemes(level: number): LevelTheme[] {
  return THEMES_BY_LEVEL[level] ?? [];
}
