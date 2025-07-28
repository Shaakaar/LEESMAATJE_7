import AppShell from '@/components/layout/AppShell';
import { motion } from 'framer-motion';

export default function PlayPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <AppShell>
        <p className="text-xl text-center">Coming soon – story pre-loader goes here</p>
      </AppShell>
    </motion.div>
  );
}
