import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.TEXTGUARD_DATA_DIR ?? path.join(here, '..', 'data');
let adminToken = process.env.TEXTGUARD_ADMIN_TOKEN;
if (!adminToken) {
  adminToken = crypto.randomBytes(18).toString('base64url');
  console.log('TEXTGUARD_ADMIN_TOKEN not set; generated one for this run:');
  console.log(`  ${adminToken}`);
}

const { server } = createApp({ dataDir, adminToken });
server.listen(port, () => {
  console.log(`TextGuard server on http://localhost:${port}  (data: ${dataDir})`);
  console.log(`Android emulator reaches it at http://10.0.2.2:${port}`);
});
