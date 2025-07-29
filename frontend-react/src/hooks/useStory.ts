import { useCallback, useEffect, useRef, useState } from 'react';

export interface StoryItem {
  type: 'sentence' | 'direction';
  text: string;
  audio: string;
  words?: string[];
}

export function useStory(levelId: string, themeId: string) {
  const [story, setStory] = useState<StoryItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initProgress, setInitProgress] = useState(0);
  const [selectedDirection, setSelectedDirection] = useState<number | null>(null);
  const abortRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const ev = new EventSource(`/api/start_story?theme=${themeId}&level=${levelId}`);
    abortRef.current = ev;
    const data: StoryItem[] = [];
    ev.addEventListener('progress', (e) => {
      setInitProgress(parseFloat((e as MessageEvent).data));
    });
    ev.addEventListener('sentence', (e) => {
      data.push({ type: 'sentence', ...(JSON.parse((e as MessageEvent).data)) });
    });
    ev.addEventListener('direction', (e) => {
      data.push({ type: 'direction', ...(JSON.parse((e as MessageEvent).data)) });
    });
    ev.addEventListener('complete', () => {
      ev.close();
      localStorage.setItem('story_data', JSON.stringify(data));
      localStorage.setItem('theme', String(themeId));
      localStorage.setItem('level', String(levelId));
      setStory(data);
      setLoading(false);
    });
    return () => {
      ev.close();
    };
  }, [levelId, themeId]);

  const item = story[index] ?? null;

  const next = useCallback(async () => {
    const cur = story[index];
    if (!cur) return;
    if (cur.type === 'direction') {
      if (selectedDirection === null) return;
      const choice =
        selectedDirection === 0 ? cur.text : story[index + 1]?.text ?? cur.text;
      setLoading(true);
      const url = `/api/continue_story?theme=${themeId}&level=${levelId}&direction=${encodeURIComponent(choice)}`;
      const ev = new EventSource(url);
      const newData: StoryItem[] = [];
      ev.addEventListener('sentence', (e) => {
        newData.push({ type: 'sentence', ...(JSON.parse((e as MessageEvent).data)) });
      });
      ev.addEventListener('direction', (e) => {
        newData.push({ type: 'direction', ...(JSON.parse((e as MessageEvent).data)) });
      });
      await new Promise<void>((res) => {
        ev.addEventListener('complete', () => {
          ev.close();
          res();
        });
      });
      setStory((s) => {
        const copy = [...s];
        copy.splice(index, 2, ...newData);
        return copy;
      });
      setSelectedDirection(null);
      setLoading(false);
    } else {
      setIndex((i) => Math.min(i + 1, story.length - 1));
    }
  }, [index, levelId, themeId, selectedDirection, story]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const totalProgress = item && item.type === 'direction' ? index + 2 : index + 1;

  return {
    item,
    story,
    index,
    total: story.length,
    progress: story.length ? totalProgress / story.length : 0,
    initProgress,
    loading,
    next,
    prev,
    selectedDirection,
    setSelectedDirection,
  } as const;
}
