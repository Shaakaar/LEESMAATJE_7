import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import AppShell from '@/components/layout/AppShell';
import { useState, useContext } from 'react';
import { Loader2 } from 'lucide-react';
import { toast, ToastViewport } from '@/components/ui/toast';
import LoadingOverlay from '@/components/LoadingOverlay';
import { ModelInitContext } from '@/lib/ModelInitContext';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { ready } = useContext(ModelInitContext);

  async function studentLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/login_student', { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json()).detail);
      const j = await r.json();
      const q = new URLSearchParams({
        student_id: j.student_id,
        teacher_id: j.teacher_id ?? '',
        name: fd.get('username') as string,
      });
      window.location.href = `/static/select.html?${q.toString()}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Fout', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function teacherLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/login', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('Inloggen mislukt');
      const j = await r.json();
      window.location.href = `/static/teacher.html?teacher_id=${j.teacher_id}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Fout', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <ToastViewport />
      <LoadingOverlay show={!ready} />
      <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg">
        <Tabs defaultValue="student" className="w-full space-y-6">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="student">Leerling</TabsTrigger>
            <TabsTrigger value="teacher">Leraar</TabsTrigger>
          </TabsList>
          <TabsContent value="student">
            <form onSubmit={studentLogin} className="space-y-4">
              <Input name="username" placeholder="Gebruikersnaam" required disabled={!ready} />
              <Input name="password" type="password" placeholder="Wachtwoord" required disabled={!ready} />
              <Input name="teacher_id" placeholder="Klascode" disabled={!ready} />
              <Button className="w-full" disabled={!ready || loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Inloggen
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="teacher">
            <form onSubmit={teacherLogin} className="space-y-4">
              <Input name="username" placeholder="Gebruikersnaam" required disabled={!ready} />
              <Input name="password" type="password" placeholder="Wachtwoord" required disabled={!ready} />
              <Button className="w-full" disabled={!ready || loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Inloggen
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
