import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LoadingOverlay({ show }: { show: boolean }) {
  return (
    <div
      role="status"
      aria-busy={show}
      className={cn(
        'fixed inset-0 z-40 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm transition-opacity duration-300 ease-out',
        show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
    >
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 font-title text-primary">Modellen laden…</p>
    </div>
  );
}
