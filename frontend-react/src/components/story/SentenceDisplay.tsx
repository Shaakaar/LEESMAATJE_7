import { InteractiveSentence } from './InteractiveSentence';

interface SentenceItem {
  type: 'sentence';
  text: string;
  audio: string;
  words?: string[];
}

interface DirectionItem {
  type: 'direction';
  text: string;
  audio: string;
  words?: string[];
}

export type StoryItem = SentenceItem | DirectionItem;

interface SentenceDisplayProps {
  item: StoryItem | null;
  nextItem: StoryItem | null;
  onDirectionSelect: (n: number) => void;
  highlights?: Record<number, 'error' | 'correct'>;
  insertions?: number[];
}

export function SentenceDisplay({
  item,
  nextItem,
  onDirectionSelect,
  highlights,
  insertions,
}: SentenceDisplayProps) {
  if (!item) return <div className="card">...</div>;

  if (item.type === 'direction' && nextItem && nextItem.type === 'direction') {
    const options = [item, nextItem];
    return (
      <div className="flex flex-col sm:flex-row gap-4">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onDirectionSelect(i)}
            className="flex-1 bg-white p-4 rounded-xl shadow hover:bg-slate-50 transition hover:scale-[1.02]"
          >
            <InteractiveSentence text={opt.text} audio={opt.audio} words={opt.words} className="text-[1.5rem]" />
          </button>
        ))}
      </div>
    );
  }

  if (item.type === 'sentence') {
    return (
      <InteractiveSentence
        text={item.text}
        audio={item.audio}
        words={item.words}
        highlights={highlights}
        insertions={insertions}
      />
    );
  }

  return null;
}

