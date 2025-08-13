import AppShell from '@/components/layout/AppShell';
import { loadContentConfig } from '@/lib/contentConfig';
import { Link } from 'react-router-dom';

export default function SelectLevelPage() {
  const cfg = loadContentConfig();
  return (
    <AppShell>
      <div className="space-y-4 max-w-xl w-full">
        <h2 className="text-xl font-title">Kies een niveau</h2>
        <ul className="space-y-2">
          {cfg.levels.map((lvl) => (
            <li key={lvl.id}>
              <Link
                className="block p-4 bg-white shadow rounded hover:bg-slate-50"
                to={`/units/${lvl.id}`}
              >
                {lvl.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

