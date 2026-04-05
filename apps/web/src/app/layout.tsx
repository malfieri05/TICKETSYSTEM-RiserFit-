import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const THEME_STORAGE_KEY = 'theme';

/** Stage 31: Run before hydration to prevent theme flash. Sets html[data-theme] from localStorage; default dark. */
const themeInitScript = `(function(){var k="${THEME_STORAGE_KEY}";var s=typeof localStorage!="undefined"?localStorage.getItem(k):null;var t=(s==="light"||s==="dark")?s:"dark";document.documentElement.setAttribute("data-theme",t);})();`;

export const metadata: Metadata = {
  title: 'Riser Fitness',
  description: 'Internal support ticketing system',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} data-theme="dark" suppressHydrationWarning>
      <body className="h-full antialiased">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
