import React, { createContext, useEffect, useState } from 'react';
import { toast } from '@/components/ui/toast';

// eslint-disable-next-line react-refresh/only-export-components
export const ModelInitContext = createContext<{ ready: boolean }>({ ready: false });

export function ModelInitProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const r = await fetch('/api/initialize_models', { method: 'POST' });
        if (!r.ok) throw new Error('Initialiseren mislukt');
        await r.text();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        toast({ title: 'Fout', description: message, variant: 'destructive' });
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ModelInitContext.Provider value={{ ready }}>{children}</ModelInitContext.Provider>
  );
}
