import { create } from 'zustand';

export type Theme = {
  id: string;
  name: string;
  emoji: string;
};

export type Level = {
  id: number;
  unlocked: boolean;
  completed: boolean;
  minutes?: number;
  themes: Theme[];
};

interface LearnerState {
  currentUser: { id: number; name: string } | null;
  levels: Level[];
  selectedLevelId: number | null;
  selectedThemeId: string | null;
  selectLevel: (id: number) => void;
  selectTheme: (id: string) => void;
}

const demoLevels: Level[] = [
  {
    id: 1,
    unlocked: true,
    completed: true,
    minutes: 12,
    themes: [
      { id: '1a', name: 'Dieren', emoji: '🐶' },
      { id: '1b', name: 'Eten', emoji: '🍎' },
    ],
  },
  {
    id: 2,
    unlocked: true,
    completed: false,
    themes: [
      { id: '2a', name: 'Sport', emoji: '⚽' },
      { id: '2b', name: 'School', emoji: '🏫' },
    ],
  },
  {
    id: 3,
    unlocked: false,
    completed: false,
    themes: [
      { id: '3a', name: 'Vakantie', emoji: '🏖️' },
      { id: '3b', name: 'Verkeer', emoji: '🚗' },
    ],
  },
  {
    id: 4,
    unlocked: false,
    completed: false,
    themes: [
      { id: '4a', name: 'Boeken', emoji: '📚' },
      { id: '4b', name: 'Weer', emoji: '⛅' },
    ],
  },
  {
    id: 5,
    unlocked: false,
    completed: false,
    themes: [
      { id: '5a', name: 'Familie', emoji: '👪' },
      { id: '5b', name: 'Beroepen', emoji: '👩‍🚒' },
    ],
  },
  {
    id: 6,
    unlocked: false,
    completed: false,
    themes: [
      { id: '6a', name: 'Feest', emoji: '🎉' },
      { id: '6b', name: 'Natuur', emoji: '🌳' },
    ],
  },
];

export const useLearner = create<LearnerState>((set) => ({
  currentUser: { id: 1, name: 'Demo leerling' },
  levels: demoLevels,
  selectedLevelId: null,
  selectedThemeId: null,
  selectLevel: (id) => set({ selectedLevelId: id }),
  selectTheme: (id) => set({ selectedThemeId: id }),
}));

