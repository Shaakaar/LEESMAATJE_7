import { getAudioEl } from "@/utils/audioCache";

interface InteractiveSentenceProps {
  text: string;
  audio: string;
  words?: string[];
  className?: string;
  errorIndices?: Set<number>;
}

export function InteractiveSentence({
  text,
  audio,
  words,
  className,
  errorIndices,
}: InteractiveSentenceProps) {
  const tokens = text.split(/\s+/);
  return (
    <p className={"text-[2rem] " + (className ?? "")}>
      {tokens.map((w, i) => (
        <span
          key={i}
          className={`word cursor-pointer hover:text-primary transition-colors ${
            errorIndices?.has(i)
              ? 'bg-rose-100 text-rose-800 rounded px-1'
              : ''
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (words && words[i]) getAudioEl(words[i]).play();
          }}
        >
          {w}
          {i < tokens.length - 1 && ' '}
        </span>
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          getAudioEl(audio).play();
        }}
        className="inline-flex items-center justify-center ml-2 p-2 rounded-full bg-primary text-white"
      >
        <i className="lucide lucide-volume-2" />
      </button>
    </p>
  );
}

