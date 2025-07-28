import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

interface Props {
  level: number;
  unlocked: boolean;
  current: boolean;
  position: { x: number; y: number };
  onSelect: (id: number) => void;
}

export default function IslandNode({ level, unlocked, current, position, onSelect }: Props) {
  return (
    <motion.button
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      whileHover={unlocked ? { scale: 1.08 } : undefined}
      className={
        'absolute flex items-center justify-center rounded-full shadow-md text-sm md:text-base font-bold w-16 h-16 md:w-20 md:h-20 transition-transform ' +
        (unlocked ? 'bg-white text-slate-700' : 'bg-slate-200 text-slate-400')
      }
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      aria-label={`Level ${level}${unlocked ? '' : ' (locked)'}`}
      disabled={!unlocked}
      onClick={() => unlocked && onSelect(level)}
    >
      {level}
      {!unlocked && <Lock className="absolute h-5 w-5 text-slate-400" />}
      {current && (
        <motion.span
          className="absolute inset-0 rounded-full bg-primary/20"
          animate={{ scale: [0.96, 1, 0.96] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        />
      )}
    </motion.button>
  );
}
