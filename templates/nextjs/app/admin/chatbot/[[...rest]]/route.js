import { join } from 'node:path';
import { createAdminRoute } from 'personal-assistant-chatbot/server/next';
import { createFilesystemStorage } from 'personal-assistant-chatbot/storage';

export const runtime = 'nodejs';

// CHATBOT_DATA_DIR points at a writable, persisted directory (e.g. a Docker
// volume at /data). Defaults to the project root for local `next dev`.
const dataDir = process.env.CHATBOT_DATA_DIR || '.';

// Google OAuth credentials (CHATBOT_GOOGLE_CLIENT_ID / _SECRET / CHATBOT_ALLOWED_EMAILS)
// and the public origin (CHATBOT_BASE_URL) are read from process.env automatically.
export const { GET, POST, PUT, DELETE } = createAdminRoute({
  storage: createFilesystemStorage({ path: join(dataDir, 'profile.json') }),
  secretsStorage: createFilesystemStorage({ path: join(dataDir, 'secrets.json') }),
});
