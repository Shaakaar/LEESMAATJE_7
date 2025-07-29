import { Volume2 } from 'lucide-react';
import type { StoryItem } from '@/hooks/useStory';

interface Props {
  options: StoryItem[];
  selected: number | null;
  onSelect: (i: number) => void;
}

export default function DirectionsChooser({ options, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 mt-4">
      {options.map((opt, i) => (
        <label
          key={i}
          className="flex-1 p-4 rounded-xl shadow bg-white dark:bg-slate-800 flex flex-col items-center"
        >
          <input
            type="radio"
            name="direction"
            value={i}
            checked={selected === i}
            onChange={() => onSelect(i)}
            className="mb-2"
          />
          <span>{opt.text}</span>
          <button
            type="button"
            aria-label="Speel zin"
            onClick={() => new Audio('/api/audio/' + opt.audio).play()}
            className="mt-2 text-primary"
          >
            <Volume2 className="h-5 w-5" />
          </button>
        </label>
      ))}
    </div>
  );
}
