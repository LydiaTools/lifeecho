import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '回声｜和不同年龄的自己，坐下来聊一会儿',
  description: '一个为女性而做的人生阶段对话空间。无需注册，让过去、现在和未来的自己，把一路走来的力量还给你。',
  metadataBase: new URL('https://huisheng-life-council-2026.manonloki.chatgpt.site'),
  openGraph: {
    title: '回声｜和不同年龄的自己，坐下来聊一会儿',
    description: '不是让 AI 替你回答，而是让一路走来的自己，把力量还给现在的你。',
    locale: 'zh_CN',
    type: 'website',
    images: [{ url: '/og.png', width: 1732, height: 908, alt: '回声人生阶段对话产品' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '回声｜和不同年龄的自己，坐下来聊一会儿',
    description: '一个为女性而做的人生阶段对话空间，无需注册，约 2 分钟。',
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
