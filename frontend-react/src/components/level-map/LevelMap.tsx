import IslandNode from './IslandNode';
import ConnectionPath from './ConnectionPath';

export interface LevelState {
  id: number;
  unlocked: boolean;
  completed: boolean;
}

const LEVELS: LevelState[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  unlocked: i === 0,
  completed: false,
}));
// TODO: hydrate level state from backend

const POSITIONS = [
  { x: 8, y: 75 },
  { x: 22, y: 62 },
  { x: 37, y: 72 },
  { x: 52, y: 58 },
  { x: 67, y: 68 },
  { x: 82, y: 54 },
  { x: 68, y: 38 },
  { x: 52, y: 28 },
  { x: 37, y: 42 },
  { x: 22, y: 30 },
];

function curve(from: { x: number; y: number }, to: { x: number; y: number }) {
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2 - 10;
  return `M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`;
}

interface Props {
  current: number;
  onSelect: (id: number) => void;
}

export default function LevelMap({ current, onSelect }: Props) {
  return (
    <div className="w-full aspect-[16/9] relative overflow-hidden rounded-lg bg-gradient-to-b from-[#e0f7ff] to-[#c6e8ff]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        {POSITIONS.slice(0, POSITIONS.length - 1).map((p, idx) => (
          <ConnectionPath key={idx} d={curve(p, POSITIONS[idx + 1])} />
        ))}
      </svg>
      {LEVELS.map((lvl, idx) => (
        <IslandNode
          key={lvl.id}
          level={lvl.id}
          unlocked={lvl.unlocked}
          current={lvl.id === current}
          position={POSITIONS[idx]}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
