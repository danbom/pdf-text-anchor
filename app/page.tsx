'use client'

import dynamic from 'next/dynamic'

// pdf.js는 모듈을 읽는 순간 DOMMatrix를 만들어서 서버에서 평가되면 죽습니다(1편 내용).
const Lab = dynamic(() => import('./lab'), {
  ssr: false,
  loading: () => <p>뷰어 불러오는 중…</p>,
})

export default function Page() {
  return (
    <main>
      <h1>드래그한 글자를 저장하고 다시 찾기</h1>
      <p className="sub">
        v1에서 글자를 드래그하면 그 범위를 PDF 좌표와 인용문으로 저장해요. 그다음 v2(제목 아래 한 줄이 늘어난 개정본)로
        바꿔 보세요. 빨강은 저장한 좌표를 그대로 그린 것, 초록은 인용문으로 다시 찾은 자리예요.
      </p>
      <Lab />
    </main>
  )
}
