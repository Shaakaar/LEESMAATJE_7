import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/lib/useAuthStore';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { name, logout } = useAuthStore();
  const initials = name
    ? name
        .split(' ')
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    : '';
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <h1 className="font-display font-bold tracking-[-0.5px] text-2xl text-primary">Leesmaatje</h1>
        {name && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
              {initials}
            </div>
            <Button size="sm" variant="secondary" onClick={logout} className="gap-1">
              <LogOut className="h-4 w-4" /> Uitloggen
            </Button>
          </div>
        )}
      </header>
      <main className="flex-1 flex items-center justify-center p-4">{children}</main>
    </div>
  );
}
