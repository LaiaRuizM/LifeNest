'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  return (
    <>
      <header className="border-b border-nest-200/50 bg-[#f5f0e6]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="font-serif text-xl font-semibold text-nest-800 hover:text-nest-700 tracking-wide transition-colors"
          >
            LifeNest
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-nest-500 hidden sm:block">
              {session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-sm text-nest-500 hover:text-nest-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </>
  );
}
