import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PacificaPilot — TradingView Executor',
  description:
    'TradingView webhook executor and Smart TP/SL manager for the Pacifica perp exchange.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
