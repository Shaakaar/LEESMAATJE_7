import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/lib/useAuthStore';
import { motion } from 'framer-motion';
import { Check, XCircle } from 'lucide-react';

interface ResultItem {
  id: string;
  sentence: string;
  timestamp: number;
  json_data: { start_time?: number; end_time?: number; correct?: boolean };
}

export default function ProgressPage() {
  const { studentId } = useAuthStore();
  const [results, setResults] = useState<ResultItem[]>([]);
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    async function load() {
      if (!studentId) return;
      const r = await fetch(`/api/student_results/${studentId}`);
      const list: ResultItem[] = await r.json();
      setResults(list);
      const monthStart = new Date();
      monthStart.setDate(1);
      const startTs = monthStart.getTime() / 1000;
      let total = 0;
      for (const res of list) {
        if (res.timestamp >= startTs) {
          const s = res.json_data?.start_time ?? 0;
          const e = res.json_data?.end_time ?? s;
          total += Math.max(0, e - s);
        }
      }
      setMinutes(Math.round(total / 60));
    }
    load();
  }, [studentId]);

  const recent = results.slice(0, 5);

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xl space-y-6">
        <h2 className="font-title text-xl">Resultaten deze maand: {minutes} min</h2>
        {recent.length === 0 ? (
          <p className="text-center text-slate-600">Nog geen resultaten.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-md bg-white p-2 shadow">
                <span>{r.sentence}</span>
                <span className="text-slate-500 text-sm">{new Date(r.timestamp * 1000).toLocaleDateString()}</span>
                {r.json_data?.correct ? (
                  <Check className="text-success h-5 w-5" />
                ) : (
                  <XCircle className="text-error h-5 w-5" />
                )}
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </AppShell>
  );
}
