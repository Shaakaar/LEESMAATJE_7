import { Button } from '@/components/ui/button';
import { LogOut, Moon, Sun } from 'lucide-react';
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
  function toggleDark() {
    document.documentElement.classList.toggle('dark');
  }
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-primary/5 to-primary/0 dark:from-slate-800 dark:to-slate-900 text-text dark:text-slate-100">
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 shadow-sm">
        <h1 className="font-display font-bold tracking-[-0.5px] text-2xl text-primary">Leesmaatje</h1>
        {name && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
              {initials}
            </div>
            <Button size="sm" variant="secondary" onClick={logout} className="gap-1">
              <LogOut className="h-4 w-4" /> Uitloggen
            </Button>
            <button onClick={toggleDark} aria-label="Toggle dark mode" className="p-2">
              <Sun className="h-4 w-4 block dark:hidden" />
              <Moon className="h-4 w-4 hidden dark:block" />
            </button>
          </div>
        )}
      </header>
      <main className="flex-1 flex items-center justify-center p-4">{children}</main>
    </div>
  );
}
