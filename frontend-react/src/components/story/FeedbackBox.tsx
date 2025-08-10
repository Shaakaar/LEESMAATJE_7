interface FeedbackBoxProps {
  text: string;
  negative: boolean;
  onReplay: () => void;
  visible: boolean;
}

export function FeedbackBox({
  text,
  negative,
  onReplay,
  visible,
}: FeedbackBoxProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 mt-4 p-4 rounded-xl shadow bg-white transition-opacity ${
        visible ? "opacity-100" : "opacity-0"
      } ${negative ? "bg-red-200" : "bg-green-200"}`}
    >
      <p
        dangerouslySetInnerHTML={{ __html: text }}
        className="text-left flex-1"
      />
      <button
        onClick={onReplay}
        className="flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-white flex-shrink-0"
      >
        <i className="lucide lucide-volume-2" />
        <span className="font-semibold">Opnieuw</span>
      </button>
    </div>
  );
}
