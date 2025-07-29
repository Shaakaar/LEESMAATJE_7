interface Props {
  current: number;
  total: number;
}

export default function ProgressBar({ current, total }: Props) {
  const pct = total ? (current / total) * 100 : 0;
  return (
    <div className="w-full mt-4">
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 text-center">
        {current}/{total}
      </p>
    </div>
  );
}
