import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWidget } from '../react/index.jsx';

/**
 * @typedef {Object} VanillaMountOptions
 * @property {string} endpoint - URL of the chat handler.
 * @property {import('../react/index.jsx').ChatTheme} [theme]
 * @property {import('../react/index.jsx').IntentChip[]} [intentChips]
 */

/**
 * Mount the chat widget into a DOM element identified by CSS selector or a
 * direct element reference.
 *
 * @param {string|Element} target
 * @param {VanillaMountOptions} options
 * @returns {{ unmount: () => void }}
 */
export function mount(target, options) {
  if (typeof window === 'undefined') {
    throw new Error('PersonalAssistant.mount can only be called in a browser environment');
  }
  if (!options || typeof options.endpoint !== 'string') {
    throw new Error('PersonalAssistant.mount: options.endpoint is required');
  }
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) {
    throw new Error(`PersonalAssistant.mount: target not found for "${String(target)}"`);
  }
  const root = createRoot(el);
  root.render(createElement(ChatWidget, options));
  return {
    unmount: () => root.unmount(),
  };
}

// Expose on window for <script>-tag consumers of the IIFE bundle.
if (typeof window !== 'undefined') {
  // @ts-ignore - global property assigned for non-module usage
  window.PersonalAssistant = { mount };
}
