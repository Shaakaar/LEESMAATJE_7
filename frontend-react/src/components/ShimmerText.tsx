import { cn } from '@/lib/utils';

interface ShimmerTextProps {
  text: string;
  active?: boolean;
  className?: string;
  ariaLive?: 'polite' | 'assertive';
}

export function ShimmerText({
  text,
  active = true,
  className,
  ariaLive,
}: ShimmerTextProps) {
  return (
    <span
      role="status"
      aria-busy={active}
      aria-live={ariaLive ?? 'polite'}
      className={cn('relative inline-block align-baseline', className)}
    >
      <span>{text}</span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 pointer-events-none select-none',
          active && 'animate-shimmer'
        )}
      >
        {text}
      </span>
    </span>
  );
}

export default ShimmerText;
