export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** JSON (or multipart when `form` is given) request to the console API. */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'X-Console': '1' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError("Couldn't reach the console server. Check your connection and try again.", 0);
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(data?.error || 'The server returned an error. Try again.', res.status);
  return data;
}

export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem('sc:' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('sc:' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }
};
