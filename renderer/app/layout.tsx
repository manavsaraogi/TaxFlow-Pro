// File: renderer/app/layout.tsx

import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'TaxFlow Pro',
  description: 'Professional Income Tax Return Filing Software',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
