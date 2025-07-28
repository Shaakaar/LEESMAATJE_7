import AppShell from '@/components/layout/AppShell';
import { useLearner } from '@/store/useLearner';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function DashboardPage() {
  const levels = useLearner((s) => s.levels);
  const selectLevel = useLearner((s) => s.selectLevel);
  const navigate = useNavigate();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <AppShell>
        <div className="w-full max-w-3xl mx-auto">
          <div className="flex overflow-x-auto gap-4 py-8 justify-center">
            {levels.map((lvl) => {
              const base =
                'flex items-center justify-center h-16 w-16 rounded-full border-2 text-lg font-bold';
              const locked = 'border-slate-300 text-slate-300';
              const unlocked = 'border-primary text-primary';
              const completed = 'bg-success border-success text-white';
              const cls = `${base} ${lvl.completed ? completed : lvl.unlocked ? unlocked : locked}`;
              return (
                <button
                  key={lvl.id}
                  disabled={!lvl.unlocked}
                  onClick={() => {
                    selectLevel(lvl.id);
                    navigate(`/dashboard/level/${lvl.id}`);
                  }}
                  className="flex flex-col items-center gap-1 disabled:opacity-50"
                >
                  <div className={cls}>{lvl.id}</div>
                  {lvl.completed && lvl.minutes && (
                    <span className="text-xs text-slate-500">{lvl.minutes} min</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </AppShell>
    </motion.div>
  );
}
