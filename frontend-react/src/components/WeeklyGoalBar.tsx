import { Progress } from '@/components/ui/progress';

interface Props {
  minutes: number;
  goal?: number;
}

export default function WeeklyGoalBar({ minutes, goal = 100 }: Props) {
  const pct = Math.min(100, (minutes / goal) * 100);
  return (
    <div>
      <Progress value={pct} />
      <p className="text-sm text-slate-600 mt-1">{minutes} / {goal} minuten</p>
    </div>
  );
}
