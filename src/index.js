import { config } from './config.js';
import './db/db.js';
import { startBot } from './bot/client.js';
import { registerEvents } from './bot/events.js';
import { createServer } from './server/app.js';
import { startScheduler } from './jobs/scheduler.js';
import { startBackups } from './jobs/backup.js';

process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));

registerEvents();
const server = createServer();
await startBot();
server.listen(config.port, config.host, () => {
  console.log(`Staff Console listening on http://${config.host}:${config.port} (public address ${config.baseUrl})`);
});
startScheduler();
startBackups();
