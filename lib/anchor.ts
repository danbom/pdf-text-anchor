// 텍스트 레이어에서 고른 글자 범위를 저장하고, 다시 찾는 함수들.
// 좌표는 전부 PDF 포인트(원점 왼쪽 아래)예요. 화면 좌표는 저장하지 않습니다(2편 내용).

export type PdfRect = { x1: number; y1: number; x2: number; y2: number }
export type CssBox = { left: number; top: number; width: number; height: number }
// W3C Web Annotation의 TextQuoteSelector와 같은 모양. 문자열은 fold()로 접어서 저장합니다.
export type Quote = { exact: string; prefix: string; suffix: string }

type Viewport = {
  convertToPdfPoint(x: number, y: number): number[]
  convertToViewportPoint(x: number, y: number): number[]
}

type Unit = { node: Node; text: string }

// 텍스트 레이어 안의 텍스트 노드와 <br>을 순서대로 모읍니다.
// pdf.js 텍스트 레이어는 줄 끝(hasEOL)마다 <br>을 넣어요. 그 자리를 \n 한 글자로 셉니다.
// Selection.toString()도 그 자리에 \n을 넣으니까 두 결과가 같아집니다.
function units(layer: Element): Unit[] {
  const out: Unit[] = []
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) out.push({ node: n, text: (n as Text).data })
    else if ((n as Element).tagName === 'BR') out.push({ node: n, text: '\n' })
  }
  return out
}

export function layerText(layer: Element): string {
  return units(layer)
    .map((u) => u.text)
    .join('')
}

// Selection 경계(node, offset)를 layerText 안의 위치로 바꿉니다.
// 드래그가 글자 밖(endOfContent, 레이어 자체)에서 끝나도 되도록 comparePoint로 셉니다.
function positionOf(layer: Element, node: Node, offset: number): number {
  const probe = document.createRange()
  probe.setStart(node, offset)
  let pos = 0
  for (const u of units(layer)) {
    if (u.node === node) return pos + (u.node.nodeType === Node.TEXT_NODE ? offset : 0)
    if (probe.comparePoint(u.node, 0) >= 0) return pos
    pos += u.text.length
  }
  return pos
}

export function offsetsOf(layer: Element, range: Range): [number, number] {
  return [
    positionOf(layer, range.startContainer, range.startOffset),
    positionOf(layer, range.endContainer, range.endOffset),
  ]
}

export function rangeFor(layer: Element, start: number, end: number): Range | null {
  const r = document.createRange()
  let pos = 0
  let started = false
  for (const u of units(layer)) {
    const len = u.text.length
    if (u.node.nodeType === Node.TEXT_NODE) {
      if (!started && start <= pos + len) {
        r.setStart(u.node, start - pos)
        started = true
      }
      if (started && end <= pos + len) {
        r.setEnd(u.node, end - pos)
        return r
      }
    }
    pos += len
  }
  return null
}

// 화면 사각형 하나 → PDF 사각형. 네 꼭짓점을 모두 바꾸고 min/max로 정리합니다(회전한 쪽 대비).
export function toPdfRect(r: DOMRect, pageEl: Element, vp: Viewport): PdfRect {
  const base = pageEl.getBoundingClientRect()
  const pts = [
    [r.left, r.top],
    [r.right, r.top],
    [r.left, r.bottom],
    [r.right, r.bottom],
  ].map(([x, y]) => vp.convertToPdfPoint(x - base.left, y - base.top))
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}

// 선택 범위 → 줄마다 사각형 하나.
// getClientRects()에는 줄 끝 <br>의 폭 0짜리 사각형이 섞여 있어서 먼저 버립니다.
// 남은 사각형은 세로로 절반 이상 겹치면 같은 줄로 보고 합쳐요.
export function quadsOf(range: Range, pageEl: Element, vp: Viewport): PdfRect[] {
  const rects = [...range.getClientRects()]
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => toPdfRect(r, pageEl, vp))
    .sort((a, b) => b.y2 - a.y2 || a.x1 - b.x1)
  const lines: PdfRect[] = []
  for (const r of rects) {
    const line = lines.find(
      (l) => Math.min(l.y2, r.y2) - Math.max(l.y1, r.y1) > 0.5 * Math.min(l.y2 - l.y1, r.y2 - r.y1),
    )
    if (line) {
      line.x1 = Math.min(line.x1, r.x1)
      line.x2 = Math.max(line.x2, r.x2)
      line.y1 = Math.min(line.y1, r.y1)
      line.y2 = Math.max(line.y2, r.y2)
    } else lines.push({ ...r })
  }
  return lines
}

// PDF 사각형 → 지금 배율의 CSS 상자
export function toCss(q: PdfRect, vp: Viewport): CssBox {
  const [ax, ay] = vp.convertToViewportPoint(q.x1, q.y1)
  const [bx, by] = vp.convertToViewportPoint(q.x2, q.y2)
  return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }
}

// PDF의 /QuadPoints 순서(왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래)로 펼칩니다.
// 형광펜(Highlight) 주석으로 내보낼 때 그대로 씁니다.
export function toQuadPoints(quads: PdfRect[]): number[] {
  return quads.flatMap((q) => [q.x1, q.y2, q.x2, q.y2, q.x1, q.y1, q.x2, q.y1])
}

// 합자(ﬁ ﬀ ﬃ …)와 특수 공백을 NFKC로 접은 문자열, 그리고 접은 위치 → 원래 위치 표.
// pdf.js 기본 뷰어는 텍스트 레이어를 정규화하지 않고(disableNormalization: true),
// react-pdf는 정규화한 텍스트로 그립니다. 어느 쪽에서 저장해도 같은 값이 되도록 접어서 비교해요.
export function fold(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    for (const ch of text[i].normalize('NFKC')) {
      norm += ch
      map.push(i)
    }
  }
  map.push(text.length)
  return { norm, map }
}

export function makeQuote(text: string, start: number, end: number, context = 32): Quote {
  return {
    exact: fold(text.slice(start, end)).norm,
    prefix: fold(text.slice(Math.max(0, start - context), start)).norm,
    suffix: fold(text.slice(end, end + context)).norm,
  }
}

// exact가 나오는 자리 중에서 앞뒤 문맥이 가장 길게 맞는 곳을 고릅니다.
// 돌려주는 위치는 접기 전 텍스트(=DOM) 기준이라 rangeFor에 바로 넣을 수 있어요.
export function anchorQuote(text: string, q: Quote): { start: number; end: number; score: number } | null {
  const { norm, map } = fold(text)
  let best: { at: number; score: number } | null = null
  for (let i = norm.indexOf(q.exact); i !== -1; i = norm.indexOf(q.exact, i + 1)) {
    let score = 0
    for (let k = 1; k <= q.prefix.length && norm[i - k] === q.prefix[q.prefix.length - k]; k++) score++
    const after = i + q.exact.length
    for (let k = 0; k < q.suffix.length && norm[after + k] === q.suffix[k]; k++) score++
    if (!best || score > best.score) best = { at: i, score }
  }
  if (!best || q.exact.length === 0) return null
  return { start: map[best.at], end: map[best.at + q.exact.length - 1] + 1, score: best.score }
}

// PDF 사각형 아래에 있는 글자들. 글자마다 Range로 위치를 재서 중심점이 사각형 안인지 봅니다.
export function textUnder(layer: Element, pageEl: Element, vp: Viewport, quads: PdfRect[]): string {
  const text = layerText(layer)
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') continue
    const r = rangeFor(layer, i, i + 1)
    const rc = r?.getClientRects()[0]
    if (!rc || rc.width === 0) continue
    const p = toPdfRect(rc, pageEl, vp)
    const cx = (p.x1 + p.x2) / 2
    const cy = (p.y1 + p.y2) / 2
    if (quads.some((q) => cx >= q.x1 && cx <= q.x2 && cy >= q.y1 && cy <= q.y2)) out += text[i]
  }
  return out
}
