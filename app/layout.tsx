import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Luxury Eyewear, Premium Glasses & Sunglasses | JP',
  description:
    'Change the way you see the world. Eyewear For All. Get handcrafted pieces that feel tailor-made for your unique features.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
