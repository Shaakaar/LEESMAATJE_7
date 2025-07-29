import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import LevelPathMap from '@/components/level-map/LevelPathMap';
import WeeklyGoalBar from '@/components/WeeklyGoalBar';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/lib/useAuthStore';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const { studentId, name } = useAuthStore();
  const [minutes, setMinutes] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      if (!studentId) return;
      const r = await fetch(`/api/student_results/${studentId}`);
      const list = await r.json();
      const weekAgo = Date.now() / 1000 - 7 * 24 * 3600;
      let total = 0;
      for (const res of list) {
        if (res.timestamp >= weekAgo) {
          const start = res.json_data?.start_time ?? 0;
          const end = res.json_data?.end_time ?? start;
          total += Math.max(0, end - start);
        }
      }
      setMinutes(Math.round(total / 60));
    }
    load();
  }, [studentId]);

  function selectLevel(level: number) {
    navigate(`/dashboard/level/${level}`);
  }

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 w-full max-w-xl">
        <h2 className="text-center text-2xl font-title">Welkom terug, {name}!</h2>
        <LevelPathMap current={1} onSelect={selectLevel} />
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold">Mijn voortgang</h3>
          <WeeklyGoalBar minutes={minutes} />
        </Card>
      </motion.div>
    </AppShell>
  );
}
