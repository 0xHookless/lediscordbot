import crypto from 'node:crypto';
import express from 'express';
import { config, secureCookies } from '../config.js';
import { db } from '../db/db.js';
import { guild } from '../bot/client.js';
import { isAdminMember, isStaffMember } from '../services/access.js';

export const SESSION_COOKIE = 'sc_session';
const STATE_COOKIE = 'sc_state';
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieOptions = maxAge => ({ httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/', maxAge });

/** Resolves a session cookie to a staff member. Role changes in Discord take effect on the next request. */
export async function userFromToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(sha256(token), Date.now());
  if (!session) return null;
  const g = guild();
  const member = g?.members.cache.get(session.user_id) || await g?.members.fetch(session.user_id).catch(() => null);
  if (!isStaffMember(member)) return null;
  return { id: member.id, name: member.displayName, isAdmin: isAdminMember(member), member };
}

export async function requireStaff(req, res, next) {
  try {
    const user = await userFromToken(req.cookies[SESSION_COOKIE]);
    if (!user) return res.status(401).json({ error: 'Sign in again to continue.' });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export const authRouter = express.Router();

authRouter.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, cookieOptions(10 * 60 * 1000));
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.baseUrl}/auth/callback`,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: req.query.switch ? 'consent' : 'none'
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

authRouter.get('/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.cookies[STATE_COOKIE]) return res.redirect('/auth/denied?reason=expired');
    res.clearCookie(STATE_COOKIE, { path: '/' });

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${config.baseUrl}/auth/callback`
      })
    });
    if (!tokenRes.ok) return res.redirect('/auth/denied?reason=expired');
    const { access_token: accessToken } = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!userRes.ok) return res.redirect('/auth/denied?reason=expired');
    const discordUser = await userRes.json();

    const member = await guild()?.members.fetch(discordUser.id).catch(() => null);
    if (!isStaffMember(member)) return res.redirect('/auth/denied');

    db.prepare(`INSERT INTO users (id, name, last_seen) VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`)
      .run(member.id, member.displayName, Date.now());
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), member.id, Date.now(), Date.now() + SESSION_MS);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MS));
    res.redirect('/');
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/denied', (req, res) => {
  const expired = req.query.reason === 'expired';
  res.status(403).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Staff Console</title>
<style>
:root{--bg:#0D1015;--surface:#141920;--border:#27303B;--fg:#E7EBF0;--muted:#9BA6B4;--accent:#1D6FA3;color-scheme:dark}
@media (prefers-color-scheme: light){:root{--bg:#F6F7F9;--surface:#FFFFFF;--border:#DCE1E7;--fg:#11151B;--muted:#4F5968;--accent:#126A9C;color-scheme:light}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:400 14px/22px system-ui,"Segoe UI",sans-serif;padding:16px;box-sizing:border-box}
.card{max-width:400px;padding:32px;background:var(--surface);border:1px solid var(--border);border-radius:10px;display:grid;gap:12px}
h1{margin:0;font:600 18px/26px system-ui,"Segoe UI",sans-serif}p{margin:0;color:var(--muted)}
a{justify-self:start;margin-top:8px;padding:8px 16px;border-radius:6px;background:var(--accent);color:#fff;text-decoration:none;font-weight:500}
</style></head><body><main class="card">
<h1>${expired ? 'Your sign-in expired' : 'This console is for staff only'}</h1>
<p>${expired ? 'The Discord sign-in took too long or was cancelled. Start again to continue.' : "Your Discord account doesn't have a staff role in this server. Ask an admin to give you one, then sign in again."}</p>
<a href="/auth/login?switch=1">${expired ? 'Sign in again' : 'Sign in with a different account'}</a>
</main></body></html>`);
});
