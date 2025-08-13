import AppShell from '@/components/layout/AppShell';
import { Link, useLocation } from 'react-router-dom';

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

export default function ResultsPage() {
  const q = useQuery();
  const accuracy = Number(q.get('accuracy') || 0);
  const pace = Number(q.get('pace') || 0);
  const weak = q.get('weak')?.split(',').filter(Boolean) || [];
  return (
    <AppShell>
      <div className="max-w-md w-full space-y-4 text-center">
        <h2 className="text-xl font-title">Resultaat</h2>
        <p>Nauwkeurigheid: {Math.round(accuracy * 100)}%</p>
        <p>Tempo: {pace} wpm</p>
        {weak.length > 0 && <p>Zwakke klanken: {weak.join(', ')}</p>}
        <div className="flex justify-center gap-4">
          <Link to="/" className="px-3 py-1 bg-primary text-white rounded">
            Herhaal
          </Link>
          <Link to="/levels" className="px-3 py-1 bg-primary text-white rounded">
            Volgende
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

