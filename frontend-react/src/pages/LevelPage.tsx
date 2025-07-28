import AppShell from '@/components/layout/AppShell';
import LevelBadge from '@/components/LevelBadge';
import ThemeCard from '@/components/ThemeCard';
import { useParams } from 'react-router-dom';
import { getThemes } from '@/lib/themeData';
import { motion } from 'framer-motion';

export default function LevelPage() {
  const { levelId } = useParams<{ levelId: string }>();
  const lvl = Number(levelId);
  const themes = getThemes(lvl);
  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <LevelBadge level={lvl} active className="w-20 h-20 md:w-24 md:h-24 text-xl" />
          <p className="text-slate-700">{/* TODO: level description */}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {themes.map((t) => (
            <ThemeCard key={t.id} levelId={lvl} theme={t} />
          ))}
        </div>
      </motion.div>
    </AppShell>
  );
}
