import { motion } from 'framer-motion';

export default function PathConnector() {
  return (
    <motion.div
      className="h-0 border-t-2 border-dashed border-slate-400 w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    />
  );
}
