import { createChatHandler } from 'personal-assistant-chatbot/server/next';
import { createFilesystemStorage } from 'personal-assistant-chatbot/storage';

export const runtime = 'nodejs';

const storage = createFilesystemStorage({ path: 'profile.json' });
const secretsStorage = createFilesystemStorage({ path: 'secrets.json' });

export const { GET, POST } = createChatHandler({
  storage,
  secretsStorage,

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
