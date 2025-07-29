import { useEffect } from 'react';
import { create } from 'zustand';

export interface StorySentence {
  text: string;
  audio: string;
  words: string[];
}

interface StoryState {
  stories: Record<string, StorySentence[]>;
  setStory: (key: string, story: StorySentence[]) => void;
}

const useStoryStore = create<StoryState>((set) => ({
  stories: {},
  setStory: (key, story) =>
    set((s) => ({ stories: { ...s.stories, [key]: story } })),
}));

export function useStoryData(levelId?: string, themeId?: string) {
  const key = `${levelId}|${themeId}`;
  const story = useStoryStore((s) =>
    levelId && themeId ? s.stories[key] : undefined
  );
  const setStory = useStoryStore((s) => s.setStory);

  useEffect(() => {
    if (!levelId || !themeId || story) return;
    const ev = new EventSource(
      `/api/start_story?theme=${themeId}&level=${levelId}`
    );
    const items: StorySentence[] = [];
    ev.addEventListener('sentence', (e) => {
      const j = JSON.parse((e as MessageEvent).data);
      items.push({ text: j.text, audio: j.audio, words: j.words });
    });
    ev.addEventListener('complete', () => {
      setStory(key, items);
      ev.close();
    });
    return () => ev.close();
  }, [levelId, themeId, story, key, setStory]);

  return story;
}
