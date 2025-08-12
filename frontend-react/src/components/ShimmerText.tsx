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
      className={cn(className, active && 'animate-shimmer')}
    >
      {text}
    </span>
  );
}

export default ShimmerText;
