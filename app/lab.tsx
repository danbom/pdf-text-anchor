'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  anchorQuote,
  layerText,
  makeQuote,
  offsetsOf,
  quadsOf,
  rangeFor,
  textUnder,
  toCss,
  toQuadPoints,
  type PdfRect,
  type Quote,
} from '@/lib/anchor'

// 1편과 같습니다. 워커는 번들러가 직접 해석하게 둡니다.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type LoadedPage = Parameters<NonNullable<ComponentProps<typeof Page>['onLoadSuccess']>>[0]
type DocId = 'v1' | 'v1r' | 'v2'

const DOCS: Record<DocId, { file: string; page: number; label: string }> = {
  v1: { file: '/doc-v1.pdf', page: 1, label: 'v1 · 원본' },
  v1r: { file: '/doc-v1.pdf', page: 2, label: 'v1 · 같은 내용, /Rotate 90 쪽' },
  v2: { file: '/doc-v2.pdf', page: 1, label: 'v2 · 제목 아래 한 줄 추가' },
}
const SCALES = [1, 1.5, 2]

type Saved = { doc: DocId; start: number; end: number; picked: string; quads: PdfRect[]; quote: Quote }
type Probe = {
  chars: number
  ligatures: number
  byOffset: string | null
  underQuads: string | null
  anchored: { text: string; quads: PdfRect[]; score: number } | null
}

const f = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
const show = (s: string) => s.replaceAll('\n', '⏎')

export default function Lab() {
  const [doc, setDoc] = useState<DocId>('v1')
  const [scale, setScale] = useState(1.5)
  const [page, setPage] = useState<LoadedPage | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [showOld, setShowOld] = useState(true)
  const pageRef = useRef<HTMLDivElement>(null)

  const current = DOCS[doc]
  const ready = page !== null && page.pageNumber === current.page
  const viewport = useMemo(() => (ready ? page.getViewport({ scale }) : null), [ready, page, scale])
  const layer = () => pageRef.current?.querySelector('.react-pdf__Page__textContent') ?? null

  // 텍스트 레이어가 다 그려진 뒤에만 잴 수 있어요. 배율을 바꾸면 다시 그려지고 다시 잽니다.
  const measure = () => {
    const tl = layer()
    const el = pageRef.current
    if (!tl || !el || !viewport) return
    const text = layerText(tl)
    const base = { chars: text.length, ligatures: (text.match(/[ﬀ-ﬆ]/g) ?? []).length }
    if (!saved) return setProbe({ ...base, byOffset: null, underQuads: null, anchored: null })
    const hit = anchorQuote(text, saved.quote)
    const range = hit ? rangeFor(tl, hit.start, hit.end) : null
    setProbe({
      ...base,
      byOffset: text.slice(saved.start, saved.end),
      underQuads: textUnder(tl, el, viewport, saved.quads),
      anchored: hit && range ? { text: text.slice(hit.start, hit.end), quads: quadsOf(range, el, viewport), score: hit.score } : null,
    })
  }
  // react-pdf에 넘기는 콜백은 참조가 바뀌지 않게 둡니다(바뀌면 텍스트 레이어를 다시 그려요).
  const measureRef = useRef(measure)
  measureRef.current = measure
  const onTextLayer = useCallback(() => measureRef.current(), [])
  useEffect(() => measureRef.current(), [saved])

  function onMouseUp() {
    const sel = window.getSelection()
    const tl = layer()
    const el = pageRef.current
    if (!sel || sel.isCollapsed || !tl || !el || !viewport) return
    const range = sel.getRangeAt(0)
    if (!tl.contains(range.commonAncestorContainer)) return
    const text = layerText(tl)
    const [start, end] = offsetsOf(tl, range)
    if (end <= start) return
    setSaved({ doc, start, end, picked: text.slice(start, end), quads: quadsOf(range, el, viewport), quote: makeQuote(text, start, end) })
    sel.removeAllRanges()
  }

  const sameDoc = saved?.doc === doc

  return (
    <>
      <div className="panel">
        <div className="row">
          <strong>문서</strong>
          {(Object.keys(DOCS) as DocId[]).map((id) => (
            <button
              key={id}
              aria-pressed={doc === id}
              onClick={() => {
                setDoc(id)
                setPage(null)
                setProbe(null)
              }}
            >
              {DOCS[id].label}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <strong>scale</strong>
          {SCALES.map((s) => (
            <button key={s} aria-pressed={scale === s} onClick={() => setScale(s)}>
              {s}
            </button>
          ))}
          <label className="row" style={{ marginLeft: 12 }}>
            <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} />
            저장한 좌표 그대로 그리기
          </label>
          {saved && <button onClick={() => setSaved(null)}>저장 지우기</button>}
        </div>
      </div>

      <div className="panel">
        {!saved ? (
          <p className="mute">v1에서 글자를 드래그해 보세요. 손을 떼면 그 범위를 저장합니다. 두 줄에 걸쳐 고르면 차이가 잘 보여요.</p>
        ) : (
          <table>
            <tbody>
              <tr>
                <th>저장한 글자</th>
                <td>
                  <code>{show(saved.picked)}</code> <span className="mute">({DOCS[saved.doc].label})</span>
                </td>
              </tr>
              <tr>
                <th>저장한 사각형 (PDF pt)</th>
                <td>
                  {saved.quads.map((q, i) => (
                    <div key={i}>
                      <code>
                        ({f(q.x1)}, {f(q.y1)}) – ({f(q.x2)}, {f(q.y2)})
                      </code>
                    </div>
                  ))}
                  <span className="mute">/QuadPoints로 펼치면 숫자 {toQuadPoints(saved.quads).length}개</span>
                </td>
              </tr>
              <tr>
                <th>저장한 인용문</th>
                <td>
                  <code>{JSON.stringify(saved.quote)}</code>
                </td>
              </tr>
              <tr>
                <th>오프셋</th>
                <td>
                  <code>
                    {saved.start}–{saved.end}
                  </code>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {saved && probe && !sameDoc && (
        <div className="panel">
          <strong>{current.label}에서 다시 찾으면</strong>
          <table style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <th className="legend old">저장한 사각형 아래 글자</th>
                <td>
                  <code>{probe.underQuads || '(없음)'}</code>
                </td>
              </tr>
              <tr>
                <th>같은 오프셋으로 자르면</th>
                <td>
                  <code>{show(probe.byOffset ?? '')}</code>
                </td>
              </tr>
              <tr>
                <th className="legend new">인용문으로 다시 찾으면</th>
                <td>
                  {probe.anchored ? (
                    <>
                      <code>{show(probe.anchored.text)}</code> <span className="mute">앞뒤 문맥 {probe.anchored.score}자 일치</span>
                    </>
                  ) : (
                    '못 찾음'
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {probe && (
        <p className="note">
          텍스트 레이어 글자 수 <code>{probe.chars}</code> · 합자(ﬁ ﬀ ﬃ) <code>{probe.ligatures}</code>개. react-pdf는
          정규화한 텍스트로 텍스트 레이어를 그려서 합자가 0개예요. 같은 쪽을 pdf.js 기본 뷰어로 열면 404자에 합자 5개입니다.
        </p>
      )}

      <div className="doc" onMouseUp={onMouseUp}>
        <Document key={current.file} file={current.file} loading="PDF 여는 중…">
          <Page
            pageNumber={current.page}
            scale={scale}
            inputRef={pageRef}
            renderAnnotationLayer={false}
            onLoadSuccess={setPage}
            onRenderTextLayerSuccess={onTextLayer}
          >
            {viewport && saved && (
              <div className="overlay">
                {sameDoc
                  ? saved.quads.map((q, i) => <div key={i} className="hl saved" style={toCss(q, viewport)} />)
                  : null}
                {!sameDoc && showOld
                  ? saved.quads.map((q, i) => <div key={'o' + i} className="hl old" style={toCss(q, viewport)} />)
                  : null}
                {!sameDoc && probe?.anchored
                  ? probe.anchored.quads.map((q, i) => <div key={'n' + i} className="hl new" style={toCss(q, viewport)} />)
                  : null}
              </div>
            )}
          </Page>
        </Document>
      </div>
    </>
  )
}
