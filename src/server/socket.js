import cookie from 'cookie';
import { Server } from 'socket.io';
import { botStatus } from '../bot/client.js';
import { SESSION_COOKIE, userFromToken } from './auth.js';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, { serveClient: false });
  io.use(async (socket, next) => {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const user = await userFromToken(cookies[SESSION_COOKIE]).catch(() => null);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });
  io.on('connection', socket => {
    socket.join('staff');
    socket.emit('conn', { status: botStatus() });
  });
}

export function broadcast(event, data) {
  io?.to('staff').emit(event, data);
}
