import { ChevronsLeft, ChevronsRight } from 'lucide-react';

interface Props {
  direction: 'prev' | 'next';
  onClick: () => void;
  disabled?: boolean;
}

export default function NavButton({ direction, onClick, disabled }: Props) {
  const Icon = direction === 'prev' ? ChevronsLeft : ChevronsRight;
  const label = direction === 'prev' ? 'Vorige zin' : 'Volgende zin';
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-full disabled:opacity-50"
    >
      {direction === 'prev' && <Icon className="h-5 w-5" />} {label}
      {direction === 'next' && <Icon className="h-5 w-5" />}
    </button>
  );
}
