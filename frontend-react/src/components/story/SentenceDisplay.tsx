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
export type Highlights = Record<number, 'error' | 'good'>;

type Props = {
  item: StoryItem | null;
  nextItem?: StoryItem | null;
  onDirectionSelect?: (choice: number) => void;
  highlights?: Highlights;
};

export function SentenceDisplay({
  item,
  nextItem,
  onDirectionSelect,
  highlights,
}: Props) {
  if (!item) return <div className="card">...</div>;

  if (item.type === 'direction' && nextItem && nextItem.type === 'direction') {
    const options = [item, nextItem];
    return (
      <div className="flex flex-col sm:flex-row gap-4">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onDirectionSelect?.(i)}
            className="flex-1 bg-white p-4 rounded-xl shadow hover:bg-slate-50 transition hover:scale-[1.02]"
          >
            <InteractiveSentence
              text={opt.text}
              audio={opt.audio}
              words={opt.words}
              className="text-[1.5rem]"
            />
          </button>
        ))}
      </div>
    );
  }

  if (item.type === 'sentence') {
    const text = item.text;
    const words = text.split(/\s+/);

    return (
      <p className="leading-relaxed">
        {words.map((w, i) => {
          const h = highlights?.[i];
          const cls =
            h === 'error'
              ? 'bg-red-100 text-red-700 underline decoration-red-400 rounded px-1'
              : '';
          return (
            <span key={i} className={cls}>
              {w}{' '}
            </span>
          );
        })}
      </p>
    );
  }

  return null;
}

