import { createChatHandler as createCoreChatHandler } from './index.js';
import { createAdminHandler as createCoreAdminHandler } from '../admin/handler.js';

/**
 * Create an Express middleware that delegates to the core Web Standards chat
 * handler. Body bytes are preserved verbatim so JSON, text, and multipart all
 * round-trip through Request correctly.
 *
 * Do NOT mount `express.json()` (or any body parser) on the route this
 * middleware serves — the middleware reads the raw stream itself.
 *
 * @param {import('./index.js').ChatHandlerConfig} config
 */
export function createChatMiddleware(config) {
  return wrapAsExpress(createCoreChatHandler(config));
}

/**
 * Create an Express middleware for the admin handler. Mount with a wildcard so
 * sub-paths reach it:
 *
 *   app.use('/admin/chatbot', createAdminMiddleware({ ... }));
 *
 * @param {import('../admin/handler.js').AdminHandlerConfig} config
 */
export function createAdminMiddleware(config) {
  return wrapAsExpress(createCoreAdminHandler(config));
}

/**
 * @param {(request: Request) => Promise<Response>} handler
 */
function wrapAsExpress(handler) {
  return async (req, res, _next) => {
    try {
      const url = `http://${req.headers.host ?? 'localhost'}${req.originalUrl ?? req.url ?? '/'}`;
      const bodyBuf = await readBodyBytes(req);
      const init = {
        method: req.method,
        headers: new Headers(req.headers),
      };
      if (bodyBuf.length > 0 && req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = bodyBuf;
        // duplex is required for streaming bodies in Node's undici Request impl.
        init.duplex = 'half';
      }
      const request = new Request(url, init);
      const response = await handler(request);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const ab = await response.arrayBuffer();
      res.send(Buffer.from(ab));
    } catch (err) {
      res.status(500).json({
        error: 'middleware_failed',
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  };
}

/**
 * Read the raw request body as a Buffer. Preserves binary content (PDF
 * uploads, etc.) that string conversion would corrupt.
 * @param {any} req
 * @returns {Promise<Buffer>}
 */
function readBodyBytes(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      if (Buffer.isBuffer(req.body)) return resolve(req.body);
      if (typeof req.body === 'string') return resolve(Buffer.from(req.body, 'utf8'));
      // Re-encode if some upstream middleware already parsed to an object.
      return resolve(Buffer.from(JSON.stringify(req.body), 'utf8'));
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
