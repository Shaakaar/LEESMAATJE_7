import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  studentId: string | null;
  teacherId: string | null;
  name: string | null;
  login: (s: { studentId: string; teacherId: string | null; name: string }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      studentId: null,
      teacherId: null,
      name: null,
      login: ({ studentId, teacherId, name }) =>
        set({ studentId, teacherId, name }),
      logout: () => set({ studentId: null, teacherId: null, name: null }),
    }),
    { name: 'auth' }
  )
);

export function useIsAuthenticated() {
  const { studentId } = useAuthStore();
  return !!studentId;
}
