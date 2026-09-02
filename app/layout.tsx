import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  applicationName: '回声',
  title: '回声｜你不是突然走到今天的',
  description: '一个为女性而做的人生阶段对话空间。和一路走来的自己重新站在一起，把曾经拥有过的力量交还给现在的你。',
  metadataBase: new URL('https://huisheng-life-council-2026.manonloki.chatgpt.site'),
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: '回声' },
  formatDetection: { telephone: false },
  openGraph: {
    title: '回声｜你不是突然走到今天的',
    description: '和人生不同阶段的自己，重新站在一起。',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/og.png', width: 1732, height: 908, alt: '回声人生阶段对话产品' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '回声｜你不是突然走到今天的',
    description: '和人生不同阶段的自己，重新站在一起。',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#fbf7fa',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
