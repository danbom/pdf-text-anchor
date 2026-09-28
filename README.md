# pdf-text-anchor

PDF 텍스트 레이어에서 드래그한 글자 범위를 저장하고, 문서가 바뀐 뒤에 다시 찾는 최소 예제예요.
블로그 글 [「형광펜은 좌표가 아니라 글자에 칠한다」](https://danbom425.tistory.com/118)(브라우저에서 문서 다루기 #3)의 재현 저장소입니다.

## 결론 먼저

| 저장하는 것 | 배율·회전이 바뀌면 | 문서에 한 줄이 늘면 | 뷰어가 바뀌면 (pdf.js 뷰어 ↔ react-pdf) |
| --- | --- | --- | --- |
| 화면 좌표(`getClientRects()` 그대로) | 어긋남 (2편) | 어긋남 | - |
| PDF 좌표 사각형 (줄마다 하나) | 맞음 | **한 줄 위를 칠함** | 맞음 |
| 글자 오프셋 (start, end) | 맞음 | **엉뚱한 글자** | **합자 수만큼 밀림** |
| 인용문 (exact + 앞뒤 32자, NFKC로 접기) | 맞음 | 맞음 | 맞음 |

그래서 **사각형과 인용문을 같이 저장**합니다. 사각형은 바로 그리고 PDF 형광펜(/QuadPoints)으로 내보낼 때 쓰고,
인용문은 문서가 바뀌었을 때 다시 찾는 데 씁니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run versions # next / react-pdf / pdfjs-dist 버전 확인
```

`next.config.ts`는 비어 있어요. 이유는 [1편 저장소](https://github.com/danbom/nextjs-pdfjs-minimal)에 있습니다.

## 화면에서 볼 것

1. **v1**에서 「within 24 hours of」부터 다음 줄 「the site becoming aware」까지 드래그해 보세요.
   노란 형광펜이 줄마다 하나씩, 두 개 생기고 표에 PDF 좌표·인용문·오프셋이 나와요.
2. **scale**을 1 ↔ 2로 바꿔 보세요. 저장한 PDF 좌표로 다시 그리니까 형광펜이 글자를 따라와요.
3. **v1 · /Rotate 90 쪽**으로 바꿔 보세요. 같은 내용을 90도 돌린 쪽이에요. 빨강(저장한 좌표 그대로)과 초록(다시 찾은 자리)이 겹칩니다.
4. **v2**로 바꿔 보세요. 제목 아래에 한 줄이 늘어난 개정본이에요.
   - 빨강: 저장한 좌표를 그대로 그리면 한 줄 위 「procedure begins」 「Adverse events are repo」를 칠해요
   - 같은 오프셋으로 자르면 전혀 다른 글자가 나와요
   - 초록: 인용문으로 다시 찾으면 제자리를 찾아요
5. 표 아래 **합자 수**를 보세요. react-pdf는 정규화한 텍스트로 텍스트 레이어를 그려서 0개예요.
   같은 쪽을 pdf.js 기본 뷰어로 열면 404자에 합자(ﬁ ﬀ ﬃ) 5개라서, 오프셋이 합자 수만큼 달라집니다.

## 코드

- `lib/anchor.ts` — 저장·다시 찾기 함수 전부. React를 몰라도 읽히게 따로 뺐어요
  - `offsetsOf` / `rangeFor` — Selection ↔ 텍스트 위치. 줄 끝 `<br>`은 `\n` 한 글자로 셉니다
  - `quadsOf` — `getClientRects()`에서 폭 0짜리 사각형을 버리고 줄마다 합친 뒤 PDF 좌표로
  - `fold` / `makeQuote` / `anchorQuote` — NFKC로 접어서 저장하고, 접은 채로 찾은 위치를 원래 위치로 되돌립니다
  - `toQuadPoints` — PDF 형광펜 주석의 `/QuadPoints` 순서로 펼치기
- `app/lab.tsx` — react-pdf 화면. 드래그가 끝나면 저장하고, 텍스트 레이어가 다시 그려질 때마다 다시 찾아요

## 확인한 버전

- Next.js 16.3.6 · react-pdf 10.5.0 · pdfjs-dist 5.4.296으로 `next build` 한 뒤, Chromium 140에서 v1 드래그 → scale 2 → /Rotate 90 쪽 → v2 순서로 확인했어요.
  형광펜은 고른 글자와 1px 안에서 겹쳤고, 텍스트 레이어는 410자에 합자 0개였어요
- `lib/anchor.ts`는 pdfjs-dist 5.7.284의 `TextLayer`로 그린 텍스트 레이어에서 Chromium으로 실제 마우스 드래그를 해서 확인했어요
  (정규화 끔 = pdf.js 기본 뷰어 방식, 켬 = react-pdf 방식, 둘 다)
- react-pdf 10.4.1과 10.5.0의 `Page/TextLayer`는 텍스트 레이어를 `page.streamTextContent({ includeMarkedContent: true })`로 그려요.
  정규화를 끄지 않아서 합자가 풀린 텍스트가 나옵니다
- pdf.js 기본 뷰어는 `TextLayerBuilder`에서 `disableNormalization: true`로 그려요(5.4.296, 5.7.284 모두)

## 테스트 PDF 다시 만들기

```bash
python3 scripts/make-quote-pdf.py   # public/doc-v1.pdf, doc-v2.pdf 를 다시 씁니다 (reportlab 필요)
```

본문에 합자 코드 포인트(U+FB00 ﬀ, U+FB01 ﬁ, U+FB03 ﬃ)를 그대로 넣었어요. PDF에서 글자를 복사하면 ﬁ가 한 글자로 붙어 나오는 그 경우예요.
