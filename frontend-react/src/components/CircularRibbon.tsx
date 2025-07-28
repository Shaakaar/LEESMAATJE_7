import LevelBadge from './LevelBadge';

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

interface Props {
  current: number;
  onSelect: (level: number) => void;
}

export default function CircularRibbon({ current, onSelect }: Props) {
  const radius = 40; // percent
  return (
    <>
      <div className="relative w-64 h-64 mx-auto hidden md:block">
        {LEVELS.map((lvl, idx) => {
          const angle = (idx / LEVELS.length) * 2 * Math.PI;
          const x = 50 + Math.cos(angle) * radius;
          const y = 50 + Math.sin(angle) * radius;
          return (
            <button
              key={lvl}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute"
              onClick={() => onSelect(lvl)}
            >
              <LevelBadge level={lvl} active={lvl === current} />
            </button>
          );
        })}
      </div>
      <div className="flex md:hidden gap-4 overflow-x-auto px-2">
        {LEVELS.map((lvl) => (
          <button key={lvl} onClick={() => onSelect(lvl)} className="flex-shrink-0">
            <LevelBadge level={lvl} active={lvl === current} />
          </button>
        ))}
      </div>
    </>
  );
}
