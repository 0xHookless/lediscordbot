import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../context.js';
import { api } from '../lib/api.js';
import { chLabel, fmtSize } from '../lib/format.js';
import { renderContent } from '../lib/markdown.jsx';
import { encodeMentions } from '../lib/mentions.js';
import { Avatar, Icon, useOutside } from '../ui.jsx';

const EMOJI = ['👍', '✅', '📈', '📉', '🔥', '👀', '🙏', '⚠️'];

export default function Composer() {
  const app = useApp();
  const ch = app.activeCh;
  const ta = app.composerRef;
  const fileRef = useRef(null);
  const popRef = useRef(null);
  const lastTyping = useRef(0);
  const [pop, setPop] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileErr, setFileErr] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [caret, setCaret] = useState(0);
  const [acI, setAcI] = useState(0);
  const [acOff, setAcOff] = useState(false);
  const [found, setFound] = useState([]);
  useOutside(popRef, !!pop, () => setPop(null));
  const target = chLabel(ch);
  const limit = app.guild.uploadLimit;

  // Autocomplete: @ for roles and members, # for channels.
  const m = /(^|\s)([@#])([^\s@#]*)$/.exec(app.draft.slice(0, caret));
  const q = m ? m[3].toLowerCase() : '';
  useEffect(() => {
    if (!m || m[2] !== '@' || !q) { setFound([]); return; }
    const t = setTimeout(() => api(`/members?q=${encodeURIComponent(q)}`).then(setFound).catch(() => setFound([])), 150);
    return () => clearTimeout(t);
  }, [m?.[2], q]);
  let ac = [];
  if (m && !acOff) {
    if (m[2] === '@') {
      const roleOpts = app.roles.filter(r => r.mentionable || app.me.isAdmin || app.staff.groups.some(g => g.id === r.id))
        .map(r => ({ key: 'r' + r.id, label: '@' + r.name, hint: 'Role' }));
      const big = app.me.isAdmin ? [{ key: 'here', label: '@here', hint: 'Online members' }, { key: 'everyone', label: '@everyone', hint: `All ${app.guild.memberCount.toLocaleString()} members` }] : [];
      const people = found.map(p => ({ key: 'u' + p.id, label: '@' + p.name, hint: p.staff ? 'Staff' : '@' + p.username, token: `<@${p.id}>`, person: p }));
      ac = [...roleOpts, ...big].filter(x => x.label.slice(1).toLowerCase().includes(q)).concat(people).slice(0, 8);
    } else {
      ac = app.channels.filter(c => c.name.includes(q)).slice(0, 8).map(c => ({ key: 'c' + c.id, label: '#' + c.name, hint: c.category }));
    }
  }

  function autosize() {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.4) + 'px';
  }
  useLayoutEffect(autosize, [app.draft, preview]);

  function pick(x) {
    const start = caret - m[3].length - 1;
    const next = app.draft.slice(0, start) + x.label + ' ' + app.draft.slice(caret);
    const pos = start + x.label.length + 1;
    if (x.token) app.picksRef.current[x.label] = x.token;
    app.setDraft(next);
    setCaret(pos);
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); });
  }

  function addFiles(list) {
    const picked = [...list];
    const big = picked.find(f => f.size > limit);
    if (big) setFileErr(`${big.name} is ${fmtSize(big.size)}. This server allows files up to ${fmtSize(limit)}.`);
    else setFileErr('');
    setFiles(f => [...f, ...picked.filter(x => x.size <= limit)].slice(0, 10));
  }

  async function submit() {
    if (!ch.canPost || sending) return;
    const raw = app.draft.trim();
    if (!raw && !files.length) return;
    const content = encodeMentions(raw, { picks: app.picksRef.current, roles: app.roles, channels: app.channels });
    const go = async () => {
      setSending(true);
      const sent = files;
      const reply = app.replyTo;
      app.setDraft('');
      setFiles([]);
      app.setReplyTo(null);
      setPreview(false);
      setCaret(0);
      app.picksRef.current = {};
      await app.send({ channelId: ch.id, content, files: sent, replyTo: reply?.id || null, ping: reply ? reply.ping : true, signature: app.me.signature });
      setSending(false);
    };
    const big = raw.match(/@(everyone|here)\b/);
    if (big) {
      app.askConfirm({
        title: `Ping ${big[0]} in ${target}?`,
        body: `${big[1] === 'everyone' ? `This notifies all ${app.guild.memberCount.toLocaleString()} members.` : 'This notifies every member who is online right now.'} It is logged under your name.`,
        cta: 'Send announcement', onConfirm: go
      });
    } else go();
  }

  function onChange(e) {
    app.setDraft(e.target.value);
    setCaret(e.target.selectionStart);
    setAcI(0);
    setAcOff(false);
    if (Date.now() - lastTyping.current > 8000 && e.target.value) {
      lastTyping.current = Date.now();
      api(`/channels/${ch.id}/typing`, { method: 'POST' }).catch(() => {});
    }
  }

  function onKeyDown(e) {
    if (ac.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAcI((acI + 1) % ac.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAcI((acI - 1 + ac.length) % ac.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(ac[Math.min(acI, ac.length - 1)]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAcOff(true); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    else if (e.key === 'Escape' && app.replyTo) app.setReplyTo(null);
  }

  function insert(display, token) {
    app.insertText(display, token);
    setPop(null);
  }

  if (!ch.canPost) {
    return <div className="composer"><div className="locked t-ui"><Icon name="lock" /><span>{ch.lockedReason}</span></div></div>;
  }

  const groups = app.staff.groups.filter(g => g.id !== 'admin');
  const onDuty = app.staff.members.filter(s => s.onDuty && s.id !== app.me.id);
  const pickCtx = {
    users: { ...app.names.users, ...Object.fromEntries(Object.entries(app.picksRef.current).map(([label, token]) => [token.replace(/\D/g, ''), label.slice(1)])) },
    roles: app.names.roles,
    channels: app.names.channels
  };

  return (
    <div className="composer">
      <div className="composer-meta t-caption subtle">
        <Icon name="bolt" size={12} />
        <span className="grow">
          Sending as <strong className="muted" style={{ fontWeight: 600 }}>{app.bot.name}</strong>{ch.kind === 'dm' ? ` to ${ch.name}` : ''}
          {app.me.signature ? ` · adds “${app.me.signatureText}”` : ''}
        </span>
        {app.mode !== 'mobile' ? <span>Enter to send · Shift+Enter for a new line</span> : null}
      </div>
      <div className="comp-box" style={{ position: 'relative' }}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        {app.replyTo ? (
          <div className="reply-chip t-caption">
            <Icon name="reply" size={12} />
            <span className="truncate" style={{ flex: 1 }}>Replying to <strong style={{ color: app.color(app.replyTo.color) || 'var(--fg)', fontWeight: 600 }}>{app.replyTo.name}</strong></span>
            <button className="btn btn-ghost btn-sm" aria-pressed={app.replyTo.ping} onClick={() => app.setReplyTo({ ...app.replyTo, ping: !app.replyTo.ping })}
              style={{ height: 28, color: app.replyTo.ping ? 'var(--accent)' : 'var(--fg-subtle)' }}>
              <Icon name="at" size={14} />{app.replyTo.ping ? 'Ping on' : 'Ping off'}
            </button>
            <button className="ibtn" style={{ width: 28, height: 28 }} aria-label="Cancel reply" onClick={() => app.setReplyTo(null)}><Icon name="x" size={14} /></button>
          </div>
        ) : null}
        {files.length ? (
          <div className="file-chips">
            {files.map((f, i) => (
              <span key={i} className="file-chip t-ui">
                <Icon name="clip" /><span className="truncate">{f.name}</span><span className="t-mono subtle">{fmtSize(f.size)}</span>
                <button className="ibtn" style={{ width: 24, height: 24 }} aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
              </span>
            ))}
          </div>
        ) : null}
        {fileErr ? <div className="err" role="alert" style={{ padding: '8px 16px 0' }}>{fileErr}</div> : null}
        {preview ? (
          <div className="comp-preview msg-text t-body" aria-label="Message preview">
            {app.draft.trim() ? renderContent(encodeMentions(app.draft, { picks: app.picksRef.current, roles: app.roles, channels: app.channels }), pickCtx) : <span className="subtle">Nothing to preview yet.</span>}
          </div>
        ) : (
          <textarea ref={ta} id="composer" rows={1} aria-label={`Message ${target}`} placeholder={`Message ${target}`} value={app.draft}
            onChange={onChange} onSelect={e => setCaret(e.target.selectionStart)} onKeyDown={onKeyDown}
            onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
            aria-autocomplete="list" aria-expanded={ac.length > 0} aria-controls="ac-list" />
        )}
        {ac.length && !preview ? (
          <div className="menu" id="ac-list" role="listbox" aria-label="Suggestions" style={{ bottom: 'calc(100% + 4px)', left: 0, width: 'min(320px, 100%)' }}>
            {ac.map((x, i) => (
              <button key={x.key} role="option" aria-selected={i === acI} className={`ac-item t-ui ${i === acI ? 'on' : ''}`} onMouseDown={e => { e.preventDefault(); pick(x); }}>
                {x.person ? <Avatar src={x.person.avatar} name={x.person.name} id={x.person.id} size={24} />
                  : <span className="subtle" style={{ width: 24, display: 'grid', placeItems: 'center' }}><Icon name={x.label[0] === '#' ? 'hash' : 'at'} /></span>}
                <span className="truncate">{x.label}</span><span className="t-caption subtle" style={{ marginLeft: 'auto' }}>{x.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="comp-tools" ref={popRef} style={{ position: 'relative' }}>
          <input type="file" ref={fileRef} id="attach-input" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          <button className="ibtn tip tip-up" data-tip="Attach files" aria-label="Attach files" onClick={() => fileRef.current.click()}><Icon name="clip" /></button>
          <button className="ibtn tip tip-up" data-tip="Emoji" aria-label="Emoji" aria-expanded={pop === 'emoji'} onClick={() => setPop(pop === 'emoji' ? null : 'emoji')}><Icon name="smile" /></button>
          {ch.kind !== 'dm' ? <button className="ibtn tip tip-up" data-tip="Build embed" aria-label="Build embed announcement" onClick={() => app.openBuilder({ channelId: ch.id })}><Icon name="embed" /></button> : null}
          <button className="ibtn tip tip-up" data-tip="Ping staff" aria-label="Ping staff" aria-expanded={pop === 'ping'} onClick={() => setPop(pop === 'ping' ? null : 'ping')}><Icon name="at" /></button>
          <button className="ibtn tip tip-up" data-tip={app.me.signature ? 'Signature on' : 'Signature off'} aria-label="Add my signature" aria-pressed={app.me.signature} onClick={() => app.updateMe({ signature: !app.me.signature })}><Icon name="pen" /></button>
          <button className="ibtn tip tip-up" data-tip={preview ? 'Back to editing' : 'Preview'} aria-label="Preview message" aria-pressed={preview} onClick={() => setPreview(!preview)}><Icon name="eye" /></button>
          <span style={{ flex: 1 }} />
          {app.conn === 'discord' ? <span className="t-caption" style={{ color: 'var(--warn)', marginRight: 8 }}>Bot reconnecting…</span> : null}
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={sending || (!app.draft.trim() && !files.length)} aria-label="Send message">
            {sending ? <><span className="spin" aria-hidden="true" />Sending</> : <><Icon name="send" size={14} />Send</>}
          </button>
          {pop === 'emoji' ? (
            <div className="menu pop" style={{ left: 40 }}>
              <div className="emoji-grid">{EMOJI.map(e => <button key={e} aria-label={`Insert ${e}`} onClick={() => insert(e)}>{e}</button>)}</div>
            </div>
          ) : null}
          {pop === 'ping' ? (
            <div className="menu pop" style={{ left: 8, width: 'min(300px, calc(100vw - 48px))', maxHeight: '50vh', overflowY: 'auto' }}>
              {groups.length ? <>
                <div className="t-label subtle" style={{ padding: '8px 8px 4px' }}>Roles</div>
                <div className="flex flex-wrap gap-1" style={{ padding: '0 8px 8px' }}>
                  {groups.map(g => <button key={g.id} className="pill pill-accent" style={{ height: 28 }} onClick={() => insert('@' + g.name)}>@{g.name}</button>)}
                </div>
              </> : null}
              <button className="menu-item" disabled={!onDuty.length} onClick={() => {
                onDuty.forEach(s => { app.picksRef.current['@' + s.name] = `<@${s.id}>`; });
                insert(onDuty.map(s => '@' + s.name).join(' '));
              }}>
                <Icon name="bolt" />Ping on-duty staff
                <span className="t-caption subtle truncate" style={{ marginLeft: 'auto', maxWidth: 120 }}>{onDuty.length ? onDuty.map(s => s.name.split(' ')[0]).join(', ') : 'Nobody on duty'}</span>
              </button>
              <div className="t-label subtle" style={{ padding: '8px 8px 4px' }}>People</div>
              {app.staff.members.filter(s => s.id !== app.me.id).map(s => (
                <button key={s.id} className="menu-item" style={{ '--ring': 'var(--surface)' }} onClick={() => insert('@' + s.name, `<@${s.id}>`)}>
                  <Avatar src={s.avatar} name={s.name} id={s.id} size={24} status={s.status} />
                  <span className="truncate">{s.name}</span>
                  <span className={`pill ${s.onDuty ? 'pill-ok' : 'pill-off'}`} style={{ marginLeft: 'auto' }}>{s.onDuty ? 'On duty' : 'Off'}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
