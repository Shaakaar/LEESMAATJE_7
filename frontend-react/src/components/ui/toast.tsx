import { create } from 'zustand';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

interface ToastItem {
  id: number;
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
}

interface ToastState {
  toasts: ToastItem[];
  add: (t: Omit<ToastItem, 'id'>) => void;
  remove: (id: number) => void;
}

let id = 0;
const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (t) => set((s) => ({ toasts: [...s.toasts, { id: ++id, ...t }] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// eslint-disable-next-line react-refresh/only-export-components
export function toast(t: Omit<ToastItem, 'id'>) {
  useToastStore.getState().add(t);
}

export function ToastViewport() {
  const { toasts, remove } = useToastStore();
  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => remove(t.id), 3000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, remove]);
  return (
    <div className="fixed top-4 right-4 space-y-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'rounded-md border bg-white px-4 py-2 shadow',
            t.variant === 'destructive' && 'border-error text-error'
          )}
        >
          <p className="font-semibold">{t.title}</p>
          {t.description && <p className="text-sm">{t.description}</p>}
        </div>
      ))}
    </div>
  );
}

