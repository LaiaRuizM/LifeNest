'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LoginSchema } from '@/lib/schemas';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate on the client — catches obvious mistakes before the network round-trip
    const result = LoginSchema.safeParse({ email, password });
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors;
      setError(errs.email?.[0] ?? errs.password?.[0] ?? 'Invalid input');
      return;
    }

    setLoading(true);

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError('Invalid email or password');
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-medium text-nest-800">LifeNest</h1>
        <p className="mt-1 text-sm text-nest-500">Your moments, your album</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-sm border border-nest-100 p-6 space-y-4"
      >
        <h2 className="font-medium text-nest-900">Sign in</h2>

        <div>
          <label className="block text-sm font-medium text-nest-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full border border-nest-200 rounded-lg px-3 py-2 text-sm text-nest-900 placeholder:text-nest-400 focus:outline-none focus:ring-2 focus:ring-nest-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-nest-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full border border-nest-200 rounded-lg px-3 py-2 text-sm text-nest-900 focus:outline-none focus:ring-2 focus:ring-nest-300"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-nest-700 text-white rounded-lg font-medium text-sm hover:bg-nest-800 disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-nest-500">
          No account?{' '}
          <Link href="/register" className="text-nest-700 hover:underline font-medium">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
