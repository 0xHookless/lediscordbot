/* A small, safe renderer for the Discord markdown staff actually see: no HTML is ever injected. */

const INLINE = /(\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+?)\*|(?<![\w])_([^_\n]+?)_(?![\w])|`([^`\n]+?)`|<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|<a?:(\w+):\d+>|@everyone|@here|https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;

function inline(text, ctx, key) {
  const out = [];
  const re = new RegExp(INLINE.source, 'g');
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2] != null) out.push(<strong key={k}>{inline(m[2], ctx, k)}</strong>);
    else if (m[3] != null) out.push(<u key={k}>{inline(m[3], ctx, k)}</u>);
    else if (m[4] != null) out.push(<s key={k}>{inline(m[4], ctx, k)}</s>);
    else if (m[5] != null || m[6] != null) out.push(<em key={k}>{inline(m[5] ?? m[6], ctx, k)}</em>);
    else if (m[7] != null) out.push(<code key={k} className="md-code">{m[7]}</code>);
    else if (m[8]) out.push(<span key={k} className="mention-tok">@{ctx.users[m[8]] || 'member'}</span>);
    else if (m[9]) out.push(<span key={k} className="mention-tok">@{ctx.roles[m[9]] || 'role'}</span>);
    else if (m[10]) out.push(<span key={k} className="mention-tok">#{ctx.channels[m[10]] || 'channel'}</span>);
    else if (m[11]) out.push(`:${m[11]}:`);
    else if (m[0][0] === '@') out.push(<span key={k} className="mention-tok">{m[0]}</span>);
    else out.push(<a key={k} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function blocks(text, ctx, key) {
  const lines = text.split('\n');
  const out = [];
  let quote = [];
  const flush = i => {
    if (!quote.length) return;
    out.push(<span key={`${key}-q${i}`} className="md-quote">{inline(quote.join('\n'), ctx, `${key}-q${i}`)}</span>);
    quote = [];
  };
  lines.forEach((line, i) => {
    if (line.startsWith('> ')) { quote.push(line.slice(2)); return; }
    flush(i);
    out.push(...inline(line, ctx, `${key}-l${i}`));
    if (i < lines.length - 1) out.push('\n');
  });
  flush('end');
  return out;
}

/** ctx maps IDs to names: { users, roles, channels }. */
export function renderContent(text, ctx) {
  if (!text) return null;
  return text.split(/```(?:\w+\n)?/).map((part, i) =>
    i % 2 ? <pre key={i} className="md-pre">{part.replace(/\n$/, '')}</pre> : <span key={i}>{blocks(part, ctx, `b${i}`)}</span>
  );
}
