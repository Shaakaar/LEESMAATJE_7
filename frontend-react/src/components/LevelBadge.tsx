interface LevelBadgeProps {
  level: number | string;
  active?: boolean;
  className?: string;
}

export default function LevelBadge({ level, active, className }: LevelBadgeProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-full border-2 w-12 h-12 font-bold text-sm md:w-16 md:h-16 md:text-lg ${active ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-300'} ${className ?? ''}`}
    >
      {level}
    </div>
  );
}
