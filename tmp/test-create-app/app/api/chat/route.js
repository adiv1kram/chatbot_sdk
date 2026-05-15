import { createChatHandler } from 'personal-assistant-chatbot/server/next';
import { profile } from '@/lib/profile';

export const runtime = 'nodejs';

export const { POST } = createChatHandler({
  profile,
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY,

  // Fires when the bot classifies a chat as a real opportunity / needs-followup.
  // Replace this with an email send, Slack post, DB write — whatever you want.
  onLead: async (lead) => {
    console.log('[onLead]', {
      classification: lead.classification,
      confidence: lead.confidence,
      visitor: lead.visitor,
      brief: lead.brief,
    });
  },

  // Fires at the end of every chat regardless of classification.
  onChatEnd: async ({ classification, confidence, transcript }) => {
    console.log('[onChatEnd]', { classification, confidence, turns: transcript.length });
  },
});
