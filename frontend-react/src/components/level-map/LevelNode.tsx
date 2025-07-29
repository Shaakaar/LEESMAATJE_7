import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

interface Props {
  level: number;
  unlocked: boolean;
  current: boolean;
  onSelect: (id: number) => void;
}

export default function LevelNode({ level, unlocked, current, onSelect }: Props) {
  return (
    <motion.button
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={unlocked ? { scale: 1.05 } : undefined}
      className={
        'relative flex items-center justify-center rounded-full border-2 font-bold text-sm md:text-base w-12 h-12 md:w-16 md:h-16 shadow ' +
        (unlocked
          ? 'bg-white text-slate-700 border-slate-300'
          : 'bg-slate-200 text-slate-400 border-slate-200')
      }
      aria-label={`Level ${level}${unlocked ? '' : ' locked'}`}
      disabled={!unlocked}
      onClick={() => unlocked && onSelect(level)}
    >
      {unlocked ? level : <Lock className="h-5 w-5" />}
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
