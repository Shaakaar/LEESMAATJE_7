export function FeedbackBox({
  text,
  negative,
  onReplay,
  visible
}: {
  text: string;
  negative: boolean;
  onReplay?: () => void;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      className={[
        'mt-2 rounded-xl border p-4 flex items-start gap-3',
        negative
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-green-50 border-green-200 text-green-800'
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      <div className="pt-0.5">
        {negative ? <i className="lucide lucide-x-circle" /> : <i className="lucide lucide-check-circle" />}
      </div>
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: text }}
      />
      {onReplay && (
        <button
          onClick={onReplay}
          className="ml-auto px-3 py-1 rounded-full bg-white/80 hover:bg-white border"
        >
          <i className="lucide lucide-volume-2" /> Afspelen
        </button>
      )}
    </div>
  );
}

