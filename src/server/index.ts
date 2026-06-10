import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { Hono } from 'hono';
import { serveStatic } from 'hono/serve-static';
import { api } from './routes/api';
import { paths } from '@config/paths';
import { SERVER } from '@config/workflows';

const app = new Hono();
app.route('/api', api);

const getContent = async (p: string) => {
  try {
    return await fs.readFile(p);
  } catch {
    return null;
  }
};

app.use('/*', serveStatic({ root: './public', getContent }));
app.get('/', serveStatic({ path: './public/index.html', getContent }));

void paths;

const port = SERVER.port;
console.log(`[server] listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
