import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '回声轻量版｜2分钟，和人生不同阶段的自己开一次会',
  description: '无需注册。过去的你、现在的你和两种可能的未来，一起帮你看清一个真实选择。',
  metadataBase: new URL('https://huisheng-life-council-2026.manonloki.chatgpt.site'),
  openGraph: {
    title: '回声轻量版｜2分钟自我议会',
    description: '无需注册。不是预测未来，而是让过去、现在和两种可能的未来一起看清选择。',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/og.png', width: 1732, height: 908, alt: '回声人生阶段对话产品' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '回声轻量版｜2分钟自我议会',
    description: '无需注册。过去的你、现在的你和两种可能的未来，一起帮你看清人生选择。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
