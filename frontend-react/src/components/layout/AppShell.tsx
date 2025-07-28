import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <h1 className="font-display font-bold tracking-[-0.5px] text-2xl text-primary">Leesmaatje</h1>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => (window.location.href = '/')}
          className="gap-1"
        >
          <LogOut className="h-4 w-4" /> Uitloggen
        </Button>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">{children}</main>
    </div>
  );
}
