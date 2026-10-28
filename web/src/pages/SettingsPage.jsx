import { useState } from 'react';
import { useApp } from '../context.js';
import { Empty } from '../ui.jsx';

const SECTIONS = [['staff', 'Staff roles'], ['support', 'Support channels'], ['posting', 'Who can post where'], ['hidden', 'Hidden channels'], ['signature', 'Signature']];

function toggle(list, id) {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

export default function SettingsPage() {
  const app = useApp();
  const [form, setForm] = useState(() => (app.settings ? structuredClone(app.settings) : null));
  const [saving, setSaving] = useState(false);
  if (!app.me.isAdmin || !form) {
    return <div className="page"><Empty icon="lock" title="Settings are for admins" body="Ask an admin if something here needs to change." /></div>;
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const staffRoles = app.roles.filter(r => form.staffRoles.includes(r.id));
  const channels = form.allChannels || [];
  const preview = form.signatureFormat.replaceAll('{name}', app.me.name).replaceAll('{first}', app.me.name.split(' ')[0]).replaceAll('{role}', app.me.role);
  async function save() {
    setSaving(true);
    const { staffRoles: sr, supportChannels, hiddenChannels, postRoles, signatureFormat } = form;
    await app.saveSettings({ staffRoles: sr, supportChannels, hiddenChannels, postRoles, signatureFormat });
    setSaving(false);
  }
  const jump = id => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page"><div className="page-inner">
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 240 }}><h1 className="t-display">Settings</h1><p className="t-ui muted" style={{ marginTop: 4 }}>Changes apply to every staff member as soon as you save.</p></div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spin" aria-hidden="true" /> : null}Save settings</button>
      </div>
      {app.mode !== 'mobile' && app.mode !== 'tablet' ? (
        <nav className="span-3 settings-nav" aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => <button key={id} className="ch" onClick={() => jump(id)}><span className="ch-name">{label}</span></button>)}
        </nav>
      ) : null}
      <div className="span-9 grid gap-6" style={app.mode === 'mobile' || app.mode === 'tablet' ? { gridColumn: 'span 12' } : null}>
        <section className="section-card" id="set-staff" aria-labelledby="h-staff">
          <div><h2 className="t-heading" id="h-staff">Staff roles</h2><p className="help" style={{ marginTop: 4 }}>Members with these roles can sign in, appear in the staff roster and show up as ping options. Admin roles from the .env file always get in.</p></div>
          <div className="check-grid">
            {app.roles.map(r => (
              <label key={r.id} className="check" htmlFor={`sr-${r.id}`}>
                <input type="checkbox" id={`sr-${r.id}`} checked={form.staffRoles.includes(r.id)} onChange={() => set('staffRoles', toggle(form.staffRoles, r.id))} />
                <span style={{ color: app.color(r.color) || undefined }}>{r.name}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="section-card" id="set-support" aria-labelledby="h-support">
          <div><h2 className="t-heading" id="h-support">Support channels</h2><p className="help" style={{ marginTop: 4 }}>Every message from a member in these channels goes to Needs reply. Elsewhere, only mentions of the bot or a staff role do.</p></div>
          <div className="check-grid">
            {channels.map(c => (
              <label key={c.id} className="check" htmlFor={`sc-${c.id}`}>
                <input type="checkbox" id={`sc-${c.id}`} checked={form.supportChannels.includes(c.id)} onChange={() => set('supportChannels', toggle(form.supportChannels, c.id))} />#{c.name}
              </label>
            ))}
          </div>
        </section>

        <section className="section-card" id="set-posting" aria-labelledby="h-posting">
          <div><h2 className="t-heading" id="h-posting">Who can post where</h2><p className="help" style={{ marginTop: 4 }}>Leave a row empty to let all staff post there. Admins can always post.</p></div>
          {staffRoles.length ? (
            <div className="table-wrap" style={{ gridColumn: 'auto' }}><table className="table" style={{ minWidth: 200 + staffRoles.length * 120 }}>
              <thead><tr><th>Channel</th>{staffRoles.map(r => <th key={r.id} className="center">{r.name}</th>)}</tr></thead>
              <tbody>
                {channels.map(c => {
                  const allowed = form.postRoles[c.id] || [];
                  return (
                    <tr key={c.id}>
                      <td>#{c.name}<span className="t-caption subtle" style={{ marginLeft: 8 }}>{allowed.length ? '' : 'All staff'}</span></td>
                      {staffRoles.map(r => (
                        <td key={r.id} className="center">
                          <input type="checkbox" aria-label={`${r.name} can post in #${c.name}`} checked={allowed.includes(r.id)} style={{ width: 16, height: 16, accentColor: 'var(--accent-solid)' }}
                            onChange={() => set('postRoles', { ...form.postRoles, [c.id]: toggle(allowed, r.id) })} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : <p className="t-ui muted">Pick staff roles above first.</p>}
        </section>

        <section className="section-card" id="set-hidden" aria-labelledby="h-hidden">
          <div><h2 className="t-heading" id="h-hidden">Hidden channels</h2><p className="help" style={{ marginTop: 4 }}>Hidden channels don't appear in the console for anyone. Discord itself is unchanged.</p></div>
          <div className="check-grid">
            {channels.map(c => (
              <label key={c.id} className="check" htmlFor={`hc-${c.id}`}>
                <input type="checkbox" id={`hc-${c.id}`} checked={form.hiddenChannels.includes(c.id)} onChange={() => set('hiddenChannels', toggle(form.hiddenChannels, c.id))} />#{c.name}
              </label>
            ))}
          </div>
        </section>

        <section className="section-card" id="set-signature" aria-labelledby="h-signature">
          <div><h2 className="t-heading" id="h-signature">Signature</h2><p className="help" style={{ marginTop: 4 }}>Added under a message when a staff member turns their signature on. Use {'{name}'}, {'{first}'} and {'{role}'}.</p></div>
          <div className="field">
            <label htmlFor="sig-format">Format</label>
            <input className="input" id="sig-format" maxLength={100} value={form.signatureFormat} onChange={e => set('signatureFormat', e.target.value)} style={{ maxWidth: 360 }} />
            <span className="help">Yours would read: {preview}</span>
          </div>
        </section>
      </div>
    </div></div>
  );
}
