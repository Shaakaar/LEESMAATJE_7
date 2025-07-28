import { motion } from 'framer-motion';

interface Props {
  d: string;
}

export default function ConnectionPath({ d }: Props) {
  return (
    <motion.path
      d={d}
      stroke="#94a3b8"
      strokeWidth={2}
      fill="none"
      strokeDasharray="6 4"
      animate={{ strokeDashoffset: [0, 20] }}
      transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
    />
  );
}
