interface FeedbackBoxProps {
  text: string;
  isCorrect: boolean;
  onReplay: () => void;
  visible: boolean;
  pending?: boolean;
}

export function FeedbackBox({
  text,
  isCorrect,
  onReplay,
  visible,
  pending,
}: FeedbackBoxProps) {
  const colorClasses = isCorrect
    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
    : 'bg-rose-50 text-rose-800 border border-rose-200';
  return (
    <div
      className={`flex items-center justify-between gap-2 mt-4 p-4 rounded-full transition-opacity ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${colorClasses}`}
    >
      <p
        dangerouslySetInnerHTML={{ __html: text }}
        className="text-left flex-1"
      />
      {pending && (
        <div className="flex items-center gap-1 text-sm text-slate-500 mr-2">
          <i className="lucide lucide-loader-2 animate-spin" />
          <span>Bezig met feedback…</span>
        </div>
      )}
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
