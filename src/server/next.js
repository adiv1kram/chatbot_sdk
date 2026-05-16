import { createChatHandler as createCoreChatHandler } from './index.js';
import { createAdminHandler as createCoreAdminHandler } from '../admin/handler.js';

/**
 * Create a Next.js App Router compatible chat handler. The chat endpoint
 * accepts POST (chat turns / end) and GET (status probe used by the widget
 * to decide whether to render).
 *
 * The OPTIONS export answers CORS preflight requests when `allowedOrigins`
 * is configured for an embedded cross-origin widget.
 *
 * @param {import('./index.js').ChatHandlerConfig} config
 * @returns {{ POST: (request: Request) => Promise<Response>, GET: (request: Request) => Promise<Response>, OPTIONS: (request: Request) => Promise<Response> }}
 */
export function createChatHandler(config) {
  const handler = createCoreChatHandler(config);
  return { POST: handler, GET: handler, OPTIONS: handler };
}

/**
 * Create a Next.js App Router compatible admin handler. Mount inside a
 * catch-all route so any sub-path (login, /api/*, /static/*) reaches the
 * handler:
 *
 *   // app/admin/chatbot/[[...rest]]/route.js
 *   import { createAdminRoute } from 'personal-assistant-chatbot/server/next';
 *   export const { GET, POST, PUT, DELETE } = createAdminRoute({ ... });
 *
 * @param {import('../admin/handler.js').AdminHandlerConfig} config
 * @returns {{ GET: (request: Request) => Promise<Response>, POST: (request: Request) => Promise<Response>, PUT: (request: Request) => Promise<Response>, DELETE: (request: Request) => Promise<Response> }}
 */
export function createAdminRoute(config) {
  const handler = createCoreAdminHandler(config);
  return { GET: handler, POST: handler, PUT: handler, DELETE: handler };
}
