import type { Metadata } from 'next';
import { DM_Sans, Literata } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LifeNest — Your moments, your album',
  description: 'Privacy-first life albums from photos and voice notes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${literata.variable}`}>
      <body className="min-h-screen font-sans antialiased bg-[#faf8f5] text-nest-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
