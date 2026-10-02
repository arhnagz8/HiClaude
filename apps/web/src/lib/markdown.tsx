/** Tiny, dependency-free, XSS-safe Markdown subset renderer for legal pages (headings, paragraphs, lists, quotes, tables, hr, bold/italic/code/links). */
import type { ReactNode } from 'react'

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'table'; head: string[]; rows: string[][] }

const isTableSep = (l: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const splitRow = (l: string): string[] => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] as string
    if (/^\s*$/.test(line)) {
      i++
      continue
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      out.push({ type: 'heading', level: (h[1] as string).length as 1, text: h[2] as string })
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ type: 'hr' })
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1] as string)) {
      const head = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && (lines[i] as string).includes('|') && !/^\s*$/.test(lines[i] as string)) rows.push(splitRow(lines[i++] as string))
      out.push({ type: 'table', head, rows })
      continue
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i] as string)) buf.push((lines[i++] as string).replace(/^\s*>\s?/, ''))
      out.push({ type: 'quote', text: buf.join(' ') })
      continue
    }
    const ul = /^\s*[-*+]\s+/
    const ol = /^\s*\d+[.)]\s+/
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line)
      const re = ordered ? ol : ul
      const items: string[] = []
      while (i < lines.length && re.test(lines[i] as string)) {
        let item = (lines[i++] as string).replace(re, '')
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] as string) && !re.test(lines[i] as string)) item += ' ' + (lines[i++] as string).trim()
        items.push(item)
      }
      out.push({ type: 'list', ordered, items })
      continue
    }
    const buf: string[] = []
    while (i < lines.length && !/^\s*$/.test(lines[i] as string) && !/^(#{1,6}\s|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i] as string)) buf.push((lines[i++] as string).trim())
    out.push({ type: 'paragraph', text: buf.join(' ') })
  }
  return out
}

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/|#)/i

/** Inline formatting → React nodes (never uses dangerouslySetInnerHTML). */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyPrefix}-${n++}`
    if (tok.startsWith('**') || tok.startsWith('__')) nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) nodes.push(<code key={key} className="ltr rounded bg-surface-2 px-1 text-[0.9em]">{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)
      const href = lm?.[2] ?? ''
      if (lm && SAFE_URL.test(href)) nodes.push(<a key={key} href={href} className="text-primary underline underline-offset-2" rel="noopener noreferrer" target={href.startsWith('http') ? '_blank' : undefined}>{lm[1]}</a>)
      else nodes.push(lm?.[1] ?? tok)
    } else nodes.push(<em key={key}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ source, className }: { source: string; className?: string }): ReactNode {
  const blocks = parseMarkdown(source)
  return (
    <div className={className}>
      {blocks.map((b, idx) => {
        const k = `b${idx}`
        switch (b.type) {
          case 'heading': {
            const Tag = (`h${Math.min(6, b.level + 1)}`) as 'h2'
            const size = b.level === 1 ? 'text-2xl mt-2 mb-4' : b.level === 2 ? 'text-xl mt-8 mb-3' : 'text-lg mt-6 mb-2'
            return <Tag key={k} className={size}>{renderInline(b.text, k)}</Tag>
          }
          case 'paragraph':
            return <p key={k} className="my-3 leading-8 text-fg">{renderInline(b.text, k)}</p>
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul'
            return (
              <Tag key={k} className={`my-3 ms-6 space-y-1.5 ${b.ordered ? 'list-decimal' : 'list-disc'}`}>
                {b.items.map((it, j) => <li key={j} className="leading-8">{renderInline(it, `${k}-${j}`)}</li>)}
              </Tag>
            )
          }
          case 'quote':
            return <blockquote key={k} className="my-4 border-s-4 border-primary/40 bg-surface-2 px-4 py-2 text-muted rounded-e-md">{renderInline(b.text, k)}</blockquote>
          case 'hr':
            return <hr key={k} className="my-6 border-line" />
          case 'table':
            return (
              <div key={k} className="my-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead><tr>{b.head.map((c, j) => <th key={j} className="border border-line bg-surface-2 p-2 text-start">{renderInline(c, `${k}h${j}`)}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, x) => <td key={x} className="border border-line p-2 align-top">{renderInline(c, `${k}${j}-${x}`)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )
        }
      })}
    </div>
  )
}
