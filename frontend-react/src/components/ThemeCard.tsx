import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';

interface ThemeCardProps {
  levelId: string | number;
  theme: { id: string; title: string };
}

export default function ThemeCard({ levelId, theme }: ThemeCardProps) {
  return (
    <Link to={`/play/${levelId}/${theme.id}`} className="focus:outline-none focus:ring-2 focus:ring-primary rounded-xl">
      <Card className="overflow-hidden hover:shadow-lg transition-transform hover:scale-105">
        <img src="/heroicons-mock.svg" alt="" className="w-full h-32 object-contain bg-slate-100" />
        <div className="p-4 font-semibold text-center">{theme.title}</div>
      </Card>
    </Link>
  );
}
