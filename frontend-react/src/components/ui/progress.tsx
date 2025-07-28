import { cn } from '@/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function Progress({ value, className, ...props }: ProgressProps) {
  return (
    <div className={cn('w-full h-2 bg-slate-200 rounded-full overflow-hidden', className)} {...props}>
      <div className="h-full bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}
