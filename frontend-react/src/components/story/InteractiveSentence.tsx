interface InteractiveSentenceProps {
  text: string;
  audio: string;
  words?: string[];
  className?: string;
}

export function InteractiveSentence({ text, audio, words, className }: InteractiveSentenceProps) {
  return (
    <p className={"text-[2rem] " + (className ?? "")}> 
      {text.split(" ").map((w, i) => (
        <span
          key={i}
          className="word cursor-pointer hover:text-primary transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (words && words[i]) new Audio("/api/audio/" + words[i]).play();
          }}
        >
          {w}&nbsp;
        </span>
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          new Audio("/api/audio/" + audio).play();
        }}
        className="inline-flex items-center justify-center ml-2 p-2 rounded-full bg-primary text-white"
      >
        <i className="lucide lucide-volume-2" />
      </button>
    </p>
  );
}

