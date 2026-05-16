import { join } from 'node:path';
import { createChatHandler } from 'personal-assistant-chatbot/server/next';
import { createFilesystemStorage } from 'personal-assistant-chatbot/storage';

export const runtime = 'nodejs';

// CHATBOT_DATA_DIR points at a writable, persisted directory (e.g. a Docker
// volume at /data). Defaults to the project root for local `next dev`.
const dataDir = process.env.CHATBOT_DATA_DIR || '.';
const storage = createFilesystemStorage({ path: join(dataDir, 'profile.json') });
const secretsStorage = createFilesystemStorage({ path: join(dataDir, 'secrets.json') });

// Comma-separated list of origins allowed to embed the widget on another site.
const allowedOrigins = (process.env.CHATBOT_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const { GET, POST, OPTIONS } = createChatHandler({
  storage,
  secretsStorage,
  allowedOrigins: allowedOrigins.length ? allowedOrigins : undefined,

  onLead: async (lead) => {
    console.log('[onLead]', {
      classification: lead.classification,
      confidence: lead.confidence,
      visitor: lead.visitor,
      brief: lead.brief,
    });
  },

  onChatEnd: async ({ classification, confidence, transcript }) => {
    console.log('[onChatEnd]', { classification, confidence, turns: transcript.length });
  },
});
