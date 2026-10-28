import { useRef, useState } from 'react';
import { useApp } from '../context.js';
import { fmtTime, fmtUTC, fromUTCInput, toUTCInput } from '../lib/format.js';
import { Avatar, Icon, useOverlay } from '../ui.jsx';
import { EmbedView } from './ChannelView.jsx';

const COLORS = [
  { name: 'Brand', v: '#1D6FA3' }, { name: 'Bullish', v: '#2E9E6A' }, { name: 'Caution', v: '#D08A1E' },
  { name: 'Alert', v: '#D2393F' }, { name: 'Neutral', v: '#6B7584' }
];

function tomorrowAt8() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(8, 0, 0, 0);
  return d.getTime();
}

/** init: { channelId?, schedule?, showTemplates?, edit?: scheduled item } */
export default function EmbedBuilder({ init }) {
  const app = useApp();
  const ref = useRef(null);
  const edit = init.edit;
  const postable = app.channels.filter(c => c.canPost);
  const [f, setF] = useState(() => {
    const base = {
      channelId: postable.some(c => c.id === init.channelId) ? init.channelId : postable[0]?.id || '',
      title: '', description: '', color: COLORS[0].v, fields: [], footer: app.guild.name, timestamp: true, image: '',
      ping: 'none', crosspost: true, schedule: !!init.schedule, when: toUTCInput(tomorrowAt8())
    };
    if (!edit) return base;
    const e = edit.payload.embed || {};
    return {
      ...base, ...e, fields: (e.fields || []).map(x => ({ ...x })), image: e.image || '',
      channelId: edit.channelId, ping: /@everyone/.test(edit.payload.content) ? 'everyone' : /@here/.test(edit.payload.content) ? 'here' : 'none',
      crosspost: edit.payload.crosspost, schedule: true, when: toUTCInput(edit.runAt)
    };
  });
  const [touched, setTouched] = useState(false);
  const [tried, setTried] = useState(false);
  const [tpl, setTpl] = useState('');
  const [tplName, setTplName] = useState(null);
  const [busy, setBusy] = useState(false);
  useOverlay(ref, app.closeBuilder);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const empty = !f.title.trim() && !f.description.trim();
  const showErr = empty && (touched || tried);
  const ch = app.getCh(f.channelId);
  const pingText = f.ping === 'none' ? '' : '@' + f.ping;
  const embed = {
    title: f.title.trim(), description: f.description.trim(), color: f.color,
    fields: f.fields.filter(x => x.name.trim() && x.value.trim()).map(x => ({ name: x.name.trim(), value: x.value.trim(), inline: x.inline !== false })),
    footer: f.footer.trim(), timestamp: f.timestamp, image: f.image.trim() || null
  };
  const whenMs = f.when ? fromUTCInput(f.when) : NaN;

  function loadTpl(id) {
    setTpl(id);
    const t = app.templates.find(x => String(x.id) === id);
    if (t) setF(p => ({ ...p, ...t.embed, fields: (t.embed.fields || []).map(x => ({ ...x })), image: t.embed.image || '' }));
  }
  const setField = (i, k, v) => setF(p => ({ ...p, fields: p.fields.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));

  async function submit(e) {
    e.preventDefault();
    setTried(true);
    if (empty) { document.getElementById('eb-desc')?.focus(); return; }
    if (!ch) return;
    if (f.schedule) {
      setBusy(true);
      await app.schedule({ channelId: f.channelId, runAt: whenMs, payload: { content: pingText, embed, crosspost: ch.kind === 'announce' && f.crosspost } }, edit?.id);
      setBusy(false);
      return;
    }
    const go = () => {
      app.send({ channelId: f.channelId, content: pingText, embed, crosspost: ch.kind === 'announce' && f.crosspost });
      app.closeBuilder();
      if (app.active !== f.channelId) app.openChannel(f.channelId);
    };
    if (f.ping !== 'none') {
      app.askConfirm({
        title: `Ping @${f.ping} in #${ch.name}?`,
        body: `${f.ping === 'everyone' ? `This notifies all ${app.guild.memberCount.toLocaleString()} members.` : 'This notifies every member who is online right now.'} It is logged under your name.`,
        cta: 'Send announcement', onConfirm: go
      });
    } else go();
  }

  if (!postable.length) {
    return <>
      <div className="scrim" onClick={app.closeBuilder} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="eb-none" ref={ref}>
        <h2 id="eb-none" className="t-title">No channels you can post in</h2>
        <p className="t-body muted">Your role can't post in any channel the bot can see. Ask an admin to check Settings.</p>
        <div className="dialog-actions"><button className="btn btn-secondary" data-autofocus onClick={app.closeBuilder}>Close</button></div>
      </div>
    </>;
  }

  const cta = f.schedule ? (edit ? 'Save changes' : 'Schedule post') : `Post to #${ch?.name}`;
  return <>
    <div className="scrim" onClick={app.closeBuilder} />
    <div className="slideover" role="dialog" aria-modal="true" aria-labelledby="eb-heading" ref={ref}>
      <header className="so-head">
        <h2 id="eb-heading" className="t-title" style={{ flex: 1 }}>{edit ? 'Edit scheduled post' : f.schedule ? 'Schedule a post' : 'New announcement'}</h2>
        <button className="ibtn" aria-label="Close" onClick={app.closeBuilder}><Icon name="x" /></button>
      </header>
      <form className="so-body" id="eb-form" onSubmit={submit} noValidate>
        <div className="so-form">
          <div className="field">
            <label htmlFor="eb-tpl">Start from a template</label>
            <select className="input" id="eb-tpl" value={tpl} onChange={e => loadTpl(e.target.value)} data-autofocus={init.showTemplates ? true : undefined}>
              <option value="">{app.templates.length ? 'Blank embed' : 'No templates saved yet'}</option>
              {app.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="eb-ch">Channel</label>
            <select className="input" id="eb-ch" value={f.channelId} onChange={e => set('channelId', e.target.value)} data-autofocus={init.showTemplates ? undefined : true}>
              {postable.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="eb-title">Title</label>
            <input className="input" id="eb-title" maxLength={256} value={f.title} onChange={e => set('title', e.target.value)} />
            <span className="help t-mono" style={{ justifySelf: 'end' }}>{f.title.length}/256</span>
          </div>
          <div className="field">
            <label htmlFor="eb-desc">Description</label>
            <textarea className={`input ${showErr ? 'invalid' : ''}`} id="eb-desc" rows={6} maxLength={4096} value={f.description}
              aria-invalid={showErr} aria-describedby="eb-desc-msg" onChange={e => set('description', e.target.value)} onBlur={() => setTouched(true)} />
            {showErr ? <span className="err" id="eb-desc-msg">Add a title or description so the embed has something to show.</span>
              : <span className="help" id="eb-desc-msg">Supports Discord markdown like **bold** and links.</span>}
          </div>
          <div className="field">
            <span className="field-label" id="eb-color-l">Color</span>
            <div className="swatches" role="radiogroup" aria-labelledby="eb-color-l">
              {COLORS.map(c => (
                <button type="button" key={c.v} role="radio" className="swatch tip" data-tip={c.name} aria-label={c.name} aria-checked={f.color === c.v} onClick={() => set('color', c.v)}>
                  <span style={{ background: c.v }} />
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Fields</span>
            {f.fields.map((x, i) => (
              <div className="efield" key={i}>
                <input className="input" id={`eb-fn-${i}`} aria-label={`Field ${i + 1} name`} placeholder="Name" value={x.name} onChange={e => setField(i, 'name', e.target.value)} />
                <input className="input" id={`eb-fv-${i}`} aria-label={`Field ${i + 1} value`} placeholder="Value" value={x.value} onChange={e => setField(i, 'value', e.target.value)} />
                <button type="button" className="ibtn" aria-label={`Remove field ${i + 1}`} onClick={() => setF(p => ({ ...p, fields: p.fields.filter((_, j) => j !== i) }))}><Icon name="x" /></button>
              </div>
            ))}
            {f.fields.length < 10 ? (
              <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => setF(p => ({ ...p, fields: [...p.fields, { name: '', value: '', inline: true }] }))}>
                <Icon name="plus" size={14} />Add field
              </button>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="eb-image">Image link</label>
            <input className="input" id="eb-image" type="url" inputMode="url" value={f.image} onChange={e => set('image', e.target.value)} />
            <span className="help">Optional. Paste an https:// link to a chart or banner.</span>
          </div>
          <div className="field"><label htmlFor="eb-footer">Footer</label><input className="input" id="eb-footer" value={f.footer} onChange={e => set('footer', e.target.value)} /></div>
          <label className="check" htmlFor="eb-ts"><input type="checkbox" id="eb-ts" checked={f.timestamp} onChange={e => set('timestamp', e.target.checked)} />Show timestamp</label>
          {app.me.isAdmin ? (
            <div className="field">
              <label htmlFor="eb-ping">Ping</label>
              <select className="input" id="eb-ping" value={f.ping} onChange={e => set('ping', e.target.value)}>
                <option value="none">No ping</option>
                <option value="here">@here (online members)</option>
                <option value="everyone">@everyone ({app.guild.memberCount.toLocaleString()} members)</option>
              </select>
              <span className="help">You confirm before it sends.</span>
            </div>
          ) : null}
          {ch?.kind === 'announce' ? <label className="check" htmlFor="eb-cross"><input type="checkbox" id="eb-cross" checked={f.crosspost} onChange={e => set('crosspost', e.target.checked)} />Publish to servers following #{ch.name}</label> : null}
          {!edit ? <label className="check" htmlFor="eb-sched"><input type="checkbox" id="eb-sched" checked={f.schedule} onChange={e => set('schedule', e.target.checked)} />Schedule for later</label> : null}
          {f.schedule ? (
            <div className="field">
              <label htmlFor="eb-when">Post at (UTC)</label>
              <input type="datetime-local" className="input" id="eb-when" value={f.when} onChange={e => set('when', e.target.value)} />
              <span className="help">{Number.isFinite(whenMs) ? `Posts ${fmtUTC(whenMs)} · ${new Date(whenMs).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} your time` : 'Pick a date and time.'}</span>
            </div>
          ) : null}
        </div>
        <div className="so-preview">
          <div className="t-label subtle">Preview in #{ch?.name}</div>
          <div className="preview-msg">
            <Avatar src={app.bot.avatar} name={app.bot.name} id={app.bot.id} />
            <div className="min-w-0">
              <div className="msg-head">
                <span className="author">{app.bot.name}</span><span className="tag">BOT</span>
                <span className="t-mono subtle">{f.schedule && Number.isFinite(whenMs) ? fmtUTC(whenMs) : 'Today ' + fmtTime(Date.now())}</span>
              </div>
              {pingText ? <div className="msg-text"><span className="mention-tok">{pingText}</span></div> : null}
              {empty ? (
                <div className="embed" style={{ borderLeftColor: f.color }}><span className="t-ui subtle">Your title and description appear here.</span></div>
              ) : <EmbedView e={{ ...embed, timestamp: embed.timestamp ? new Date(f.schedule && Number.isFinite(whenMs) ? whenMs : Date.now()).toISOString() : null }} ctx={app.names} />}
            </div>
          </div>
          <p className="t-caption subtle">Members see this as {app.bot.name}. The audit log records it under {app.me.name}.</p>
        </div>
      </form>
      <footer className="so-foot">
        {tplName === null ? (
          <button type="button" className="btn btn-ghost" onClick={() => { if (empty) { setTried(true); return; } setTplName(f.title.trim() || ''); }}>
            <Icon name="template" size={14} />Save as template
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <input className="input input-sm" id="eb-tpl-name" aria-label="Template name" placeholder="Template name" value={tplName} autoFocus
              onChange={e => setTplName(e.target.value)} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!tplName.trim()} onClick={async () => { await app.saveTemplate(tplName.trim(), embed); setTplName(null); }}>Save template</button>
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary" onClick={app.closeBuilder}>Cancel</button>
        <button type="submit" form="eb-form" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spin" aria-hidden="true" /> : <Icon name={f.schedule ? 'calendar' : 'send'} size={14} />}{cta}
        </button>
      </footer>
    </div>
  </>;
}
