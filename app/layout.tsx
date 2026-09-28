import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '드래그한 글자를 저장하고 다시 찾기',
  description: 'PDF 텍스트 레이어에서 고른 범위를 좌표와 인용문으로 저장하고, 개정본에서 다시 찾아봅니다',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
