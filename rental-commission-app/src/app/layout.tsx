import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';

import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  title: {
    default: 'ניהול עמלות סוכנים',
    template: '%s · ניהול עמלות סוכנים',
  },
  description: 'מערכת לניהול דיווחי נכסים חודשיים וחישוב עמלות סוכני השכרה.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c2739',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
