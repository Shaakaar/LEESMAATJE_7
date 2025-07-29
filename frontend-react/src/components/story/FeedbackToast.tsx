import { PlayCircle } from 'lucide-react';

interface Props {
  text: string;
  positive: boolean;
  onReplay: () => void;
}

export default function FeedbackToast({ text, positive, onReplay }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-4 flex items-center justify-between p-4 rounded-xl shadow ${positive ? 'bg-green-100' : 'bg-red-100'}`}
    >
      <p dangerouslySetInnerHTML={{ __html: text }} />
      <button
        onClick={onReplay}
        aria-label="Speel feedback opnieuw af"
        className="ml-2 text-primary"
      >
        <PlayCircle className="h-6 w-6" />
      </button>
    </div>
  );
}
