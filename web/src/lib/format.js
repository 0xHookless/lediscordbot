export const fmtTime = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const isToday = t => new Date(t).toDateString() === new Date().toDateString();
export const fmtStamp = t => (isToday(t) ? 'Today ' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ') + fmtTime(t);
export const fmtDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtUTC = t => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
export const minsSince = t => Math.max(0, Math.floor((Date.now() - t) / 60000));
export const fmtAge = m => (m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : Math.floor(m / 1440) + 'd');
export const fmtSize = bytes => (bytes / 1048576).toFixed(1) + ' MB';
export function snippet(s, n = 60) {
  const one = (s || '').replace(/<@!?\d+>/g, '@member').replace(/<@&\d+>/g, '@role').replace(/<#\d+>/g, '#channel').replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}
export const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const uid = p => p + Math.random().toString(36).slice(2, 10);
export const initials = name => (name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
export const chLabel = ch => (!ch ? '#unknown' : ch.kind === 'dm' ? '@' + ch.name : '#' + ch.name);
export const toUTCInput = t => new Date(t).toISOString().slice(0, 16);
export const fromUTCInput = v => new Date(v + ':00Z').getTime();
