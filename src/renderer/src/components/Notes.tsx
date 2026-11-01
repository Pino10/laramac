/**
 * Renders release notes. Only headings, bullet points, paragraphs, **bold** and `code` are
 * understood, and everything becomes React text nodes: no HTML from GitHub is ever injected.
 */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}

export default function Notes({ text }: { text: string }): React.JSX.Element {
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = (): void => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (/^[-*] /.test(line)) {
      list.push(line.slice(2))
      continue
    }
    flush()
    if (!line) continue
    if (line.startsWith('#')) blocks.push(<h3 key={blocks.length}>{line.replace(/^#+\s*/, '')}</h3>)
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="notes">{blocks.length ? blocks : <p className="dim">No notes for this release.</p>}</div>
}
