import { createAdminRoute } from 'personal-assistant-chatbot/server/next';
import { createFilesystemStorage } from 'personal-assistant-chatbot/storage';

export const runtime = 'nodejs';

// Google OAuth env vars (CHATBOT_GOOGLE_CLIENT_ID / _SECRET / CHATBOT_ALLOWED_EMAILS)
// are read from process.env automatically.
export const { GET, POST, PUT, DELETE } = createAdminRoute({
  storage: createFilesystemStorage({ path: 'profile.json' }),
  secretsStorage: createFilesystemStorage({ path: 'secrets.json' }),
});
