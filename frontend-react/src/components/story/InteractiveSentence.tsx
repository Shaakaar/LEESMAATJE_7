interface InteractiveSentenceProps {
  text: string;
  audio: string;
  words?: string[];
  className?: string;
  highlights?: Record<number, 'error' | 'correct'>;
  insertions?: number[];
}

export function InteractiveSentence({
  text,
  audio,
  words,
  className,
  highlights,
  insertions,
}: InteractiveSentenceProps) {
  const tokens = text.split(/\s+/);
  const insSet = new Set(insertions ?? []);
  return (
    <p className={"text-[2rem] " + (className ?? "")}>
      {tokens.map((w, i) => {
        const mark = highlights?.[i];
        const cls = [
          'word cursor-pointer transition-colors hover:text-primary',
          mark === 'error' && 'token-error',
          mark === 'correct' && 'token-correct',
          insSet.has(i) && 'token-insert-near',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <span
            key={i}
            className={cls}
            aria-label={mark === 'error' ? `Fout in woord ‘${w}’` : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (words && words[i]) new Audio('/api/audio/' + words[i]).play();
            }}
          >
            {w}
            {mark === 'error' && <sup className="text-red-600 ml-0.5">!</sup>}
            {' '}
          </span>
        );
      })}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          new Audio('/api/audio/' + audio).play();
        }}
        className="inline-flex items-center justify-center ml-2 p-2 rounded-full bg-primary text-white"
      >
        <i className="lucide lucide-volume-2" />
      </button>
    </p>
  );
}
