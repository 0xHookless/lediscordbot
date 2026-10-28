import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import multer from 'multer';
import { api } from './api.js';
import { authRouter, requireStaff } from './auth.js';
import { initSocket } from './socket.js';
import { friendlyError, isDiscordError } from '../services/errors.js';

const DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url));

/** Rejects cross-site writes: the console's own fetches always send this header, plain forms can't. */
function requireConsoleHeader(req, res, next) {
  if (req.method === 'GET' || req.get('X-Console') === '1') return next();
  res.status(403).json({ error: 'Request blocked. Reload the console and try again.' });
}

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use('/auth', authRouter);
  app.use('/api', requireConsoleHeader, requireStaff, api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));

  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(DIST + 'index.html'));
  } else {
    app.get('*', (req, res) => res.status(503).type('text').send('The dashboard has not been built yet. Run "npm run build" and restart.'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Files can be up to 100 MB.'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Attach up to 10 files at a time.'
        : 'The upload failed. Try again.';
      return res.status(413).json({ error: message });
    }
    if (err instanceof SyntaxError && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was malformed.' });
    const status = err.status && err.status < 500 && !isDiscordError(err) ? err.status : isDiscordError(err) ? 400 : 500;
    if (status >= 500 || isDiscordError(err)) console.error(err);
    res.status(status).json({ error: friendlyError(err) });
  });

  const server = http.createServer(app);
  initSocket(server);
  return server;
}
