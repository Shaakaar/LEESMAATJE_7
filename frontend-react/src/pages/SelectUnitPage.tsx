import AppShell from '@/components/layout/AppShell';
import { loadContentConfig } from '@/lib/contentConfig';
import { useParams, Link } from 'react-router-dom';

export default function SelectUnitPage() {
  const { levelId } = useParams<{ levelId: string }>();
  const cfg = loadContentConfig();
  const level = cfg.levels.find((l) => l.id === levelId);
  if (!level) return null;
  return (
    <AppShell>
      <div className="space-y-4 max-w-xl w-full">
        <h2 className="text-xl font-title">{level.label}</h2>
        <ul className="space-y-2">
          {level.units.map((u) => (
            <li key={u.id} className="p-4 bg-white shadow rounded">
              <div className="font-semibold">Eenheid {u.label}</div>
              <div className="text-sm text-slate-600">
                Klanken: {u.focus_klanken.join(', ')}
              </div>
              <div className="text-sm text-slate-600">
                Voorbeelden: {u.word_bank.slice(0, 3).join(', ')}
              </div>
              <Link
                to={`/session/${level.id}/${u.id}`}
                className="inline-block mt-2 px-3 py-1 bg-primary text-white rounded"
              >
                Start
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

