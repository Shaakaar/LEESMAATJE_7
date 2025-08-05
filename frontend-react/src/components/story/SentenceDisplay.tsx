interface SentenceItem {
  type: "sentence";
  text: string;
  audio: string;
  words?: string[];
}

interface DirectionItem {
  type: "direction";
  text: string;
  audio: string;
}

export type StoryItem = SentenceItem | DirectionItem;

interface SentenceDisplayProps {
  item: StoryItem | null;
  selectedDirection: number | null;
  setSelectedDirection: (n: number | null) => void;
}

export function SentenceDisplay({
  item,
  selectedDirection,
  setSelectedDirection,
}: SentenceDisplayProps) {
  if (!item) return <div className="card">...</div>;

  if (item.type === "direction") {
    return (
      <div className="space-y-2">
        {[item].map((opt, i) => (
          <label
            key={i}
            className="flex items-center gap-2 bg-white p-4 rounded-xl shadow"
          >
            <input
              type="radio"
              name="direction"
              value={i}
              checked={selectedDirection === i}
              onChange={() => setSelectedDirection(i)}
            />
            <span>{opt.text}</span>
            <button
              type="button"
              onClick={() => new Audio("/api/audio/" + opt.audio).play()}
              className="ml-auto"
            >
              <i className="lucide lucide-volume-2" />
            </button>
          </label>
        ))}
      </div>
    );
  }

  return (
    <p className="text-[2rem]">
      {item.text.split(" ").map((w, i) => (
        <span
          key={i}
          className="word cursor-pointer hover:text-primary transition-colors"
          onClick={() =>
            item.words &&
            item.words[i] &&
            new Audio("/api/audio/" + item.words![i]).play()
          }
        >
          {w}&nbsp;
        </span>
      ))}
      <button
        type="button"
        onClick={() => new Audio("/api/audio/" + item.audio).play()}
        className="inline-flex items-center justify-center ml-2 p-2 rounded-full bg-primary text-white"
      >
        <i className="lucide lucide-volume-2" />
      </button>
    </p>
  );
}
