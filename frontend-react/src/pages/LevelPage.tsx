import AppShell from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLearner } from '@/store/useLearner';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function LevelPage() {
  const { levelId } = useParams();
  const level = useLearner((s) => s.levels.find((l) => String(l.id) === levelId));
  const selectTheme = useLearner((s) => s.selectTheme);
  const navigate = useNavigate();

  if (!level) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <AppShell>
        <div className="w-full max-w-3xl mx-auto space-y-6">
          <header>
            <Link to="/dashboard" className="text-primary">
              &larr; Terug
            </Link>
          </header>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {level.themes.map((t) => (
              <Card key={t.id} className="p-4 flex flex-col items-center gap-2 text-center">
                <div className="text-5xl">{t.emoji}</div>
                <div className="font-semibold">{t.name}</div>
                <Button
                  size="sm"
                  onClick={() => {
                    selectTheme(t.id);
                    navigate(`/play/${level.id}/${t.id}`);
                  }}
                >
                  Start
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </AppShell>
    </motion.div>
  );
}
