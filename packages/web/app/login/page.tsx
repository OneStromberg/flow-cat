import { redirect } from 'next/navigation';
import { requireWorker } from '../../lib/session';
import { LoginForm } from './login-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const worker = await requireWorker();
  if (worker) redirect('/'); // role-router sends admins to /admin, workers to /app
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">FlowCat — Log in</h1>
      <p className="mt-1 text-sm text-gray-600">Enter your phone number and teudat zeut.</p>
      <LoginForm />
      <p className="mt-4 text-center text-sm text-gray-500">
        New here?{' '}
        <a href="/register" className="underline text-gray-700">Register</a>
      </p>
    </main>
  );
}
