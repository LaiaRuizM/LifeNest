import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

// Smart entry point: sends authenticated users to their dashboard,
// unauthenticated users to the login page.
export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
