import { useId, useRef, useState, useEffect } from 'react';

/**
 * @typedef {Object} ChatTheme
 * @property {string} [color] - Brand color for the user bubble + accents (defaults to #3b82f6).
 * @property {string} [avatarUrl] - URL for the avatar shown in the header.
 * @property {string} [welcomeMessage] - Greeting shown before the first message.
 * @property {string} [botName] - Display name in the chat header.
 */

/**
 * @typedef {Object} IntentChip
 * @property {string} label
 * @property {string} [icon]
 */

/**
 * @typedef {Object} ChatWidgetProps
 * @property {string} endpoint - URL the widget POSTs chat messages to.
 * @property {ChatTheme} [theme]
 * @property {IntentChip[]} [intentChips] - Quick-reply chips shown before the first message.
 */

const DEFAULT_COLOR = '#3b82f6';
const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

/**
 * Chat widget with streaming responses, intent chips, clickable links, and
 * an explicit "End chat" button that triggers the SDK's classifier + callbacks.
 *
 * @param {ChatWidgetProps} props
 */
export function ChatWidget({ endpoint, theme = {}, intentChips }) {
  const [messages, setMessages] = useState(
    /** @type {Array<{role: 'user'|'assistant', content: string}>} */ ([])
  );
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [ended, setEnded] = useState(false);
  const [endSummary, setEndSummary] = useState(
    /** @type {null | { classification: string, actionable: boolean }} */ (null)
  );
  const [isMobile, setIsMobile] = useState(false);
  const [readiness, setReadiness] = useState(
    /** @type {'probing'|'ready'|'unconfigured'} */ ('probing')
  );
  const [limitState, setLimitState] = useState(
    /** @type {null | { hitLimit: string|null, hint: string }} */ (null)
  );
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: '', email: '', company: '', note: '' });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const scrollRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const sessionId = useId();

  // Probe the endpoint to see whether the professional has filled in their
  // profile yet. If not, the widget renders nothing — visitors should never
  // see an unconfigured chatbot.
  useEffect(() => {
    let cancelled = false;
    fetch(endpoint, { method: 'GET', headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => {
        if (cancelled) return;
        setReadiness(data?.configured ? 'ready' : 'unconfigured');
      })
      .catch(() => {
        if (!cancelled) setReadiness('unconfigured');
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const color = theme.color ?? DEFAULT_COLOR;
  const botName = theme.botName ?? 'AI Assistant';
  const welcome = theme.welcomeMessage ?? 'Hi! Ask me anything.';
  const chips = intentChips ?? [];

  // Track mobile breakpoint for responsive sizing.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(max-width: 480px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Keep the scroll pinned to the bottom.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  // Auto-focus the input on mount; refocus after each turn so users can keep typing.
  useEffect(() => {
    if (!ended && !pending) inputRef.current?.focus();
  }, [ended, pending]);

  async function send(text) {
    const trimmed = text.trim();
    if (!trimmed || pending || ended) return;
    const userMessage = { role: /** @type {const} */ ('user'), content: trimmed };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setPending(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'message', sessionId, messages: next }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setLimitState({
          hitLimit: data?.hitLimit || null,
          hint: data?.contact?.hint || 'Share your email so I can follow up directly.',
        });
        return;
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data?.reason || data?.error || `Request failed (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      setMessages([...next, { role: 'assistant', content: '' }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: 'assistant', content: acc }]);
      }
      if (!acc.trim()) setError('Received an empty response');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPending(false);
    }
  }

  async function submitLead(e) {
    if (e) e.preventDefault();
    if (leadSubmitting) return;
    const trimmedName = leadForm.name.trim();
    const trimmedEmail = leadForm.email.trim();
    if (!trimmedEmail) {
      setError('Please share an email so they can reach you back.');
      return;
    }
    setLeadSubmitting(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'final_lead',
          sessionId,
          messages,
          visitor: {
            name: trimmedName,
            email: trimmedEmail,
            company: leadForm.company.trim(),
            note: leadForm.note.trim(),
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.reason || data?.error || `Submit failed (${res.status})`);
        return;
      }
      setLeadSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLeadSubmitting(false);
    }
  }

  async function endChat() {
    if (pending || ended || messages.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'end', sessionId, messages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.reason || data?.error || `End failed (${res.status})`);
        return;
      }
      setEndSummary({
        classification: data.classification ?? 'info_only',
        actionable: !!data.actionable,
      });
      setEnded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(input);
  }

  const showChips = chips.length > 0 && messages.length === 0 && !ended;

  // Render nothing while probing or if the profile isn't configured. Visitors
  // see an empty space rather than a broken/unfinished chatbot.
  if (readiness !== 'ready') return null;

  return (
    <div
      role="dialog"
      aria-label={`Chat with ${botName}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: isMobile ? '100%' : 380,
        height: isMobile ? '80vh' : 520,
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'white',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: 14,
        color: '#111827',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fafafa',
        }}
      >
        {theme.avatarUrl ? (
          <img
            src={theme.avatarUrl}
            alt=""
            width={32}
            height={32}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: color,
              opacity: 0.85,
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{botName}</div>
        {!ended && messages.length > 0 && (
          <button
            type="button"
            onClick={endChat}
            disabled={pending}
            aria-label="End this chat and send a summary"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: 'white',
              cursor: pending ? 'not-allowed' : 'pointer',
              color: '#374151',
            }}
          >
            End chat
          </button>
        )}
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        style={{
          flex: 1,
          padding: '12px 14px',
          overflowY: 'auto',
          background: '#fff',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#6b7280', lineHeight: 1.45 }}>{welcome}</div>
        )}

        {showChips && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 12,
            }}
          >
            {chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => send(chip.label)}
                disabled={pending}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: `1px solid ${color}`,
                  background: 'white',
                  color: color,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  lineHeight: 1,
                }}
              >
                {chip.icon ? `${chip.icon} ` : ''}
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} userColor={color} />
        ))}

        {pending && !ended && (
          <div style={{ color: '#9ca3af', fontStyle: 'italic', marginTop: 8 }}>thinking…</div>
        )}

        {endSummary && (
          <div
            role="status"
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: endSummary.actionable ? '#ecfdf5' : '#f3f4f6',
              color: endSummary.actionable ? '#065f46' : '#374151',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {endSummary.actionable
              ? 'Thanks — summary sent. You should hear back soon.'
              : 'Chat ended. Thanks for stopping by.'}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              color: '#b91c1c',
              background: '#fef2f2',
              padding: '8px 10px',
              borderRadius: 8,
              marginTop: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {limitState && !leadSubmitted ? (
        <form
          onSubmit={submitLead}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '12px 14px',
            borderTop: '1px solid #e5e7eb',
            background: '#fffbeb',
          }}
        >
          <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
            <strong>Chat limit reached.</strong> {limitState.hint}
          </div>
          <input
            type="text"
            value={leadForm.name}
            onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
            placeholder="Your name"
            disabled={leadSubmitting}
            style={leadInputStyle}
          />
          <input
            type="email"
            value={leadForm.email}
            onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
            placeholder="Your email"
            required
            disabled={leadSubmitting}
            style={leadInputStyle}
          />
          <input
            type="text"
            value={leadForm.company}
            onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
            placeholder="Company (optional)"
            disabled={leadSubmitting}
            style={leadInputStyle}
          />
          <textarea
            value={leadForm.note}
            onChange={(e) => setLeadForm({ ...leadForm, note: e.target.value })}
            placeholder="Anything else? (optional)"
            rows={2}
            disabled={leadSubmitting}
            style={{ ...leadInputStyle, resize: 'vertical' }}
          />
          <button
            type="submit"
            disabled={leadSubmitting || !leadForm.email.trim()}
            style={{
              padding: '9px 14px',
              border: 'none',
              borderRadius: 8,
              background: color,
              color: 'white',
              fontWeight: 600,
              cursor: leadSubmitting || !leadForm.email.trim() ? 'not-allowed' : 'pointer',
              opacity: leadSubmitting || !leadForm.email.trim() ? 0.6 : 1,
              minHeight: 40,
              fontSize: 14,
            }}
          >
            {leadSubmitting ? 'Sending…' : 'Send to ' + botName.replace(/'s AI Assistant.*/i, '')}
          </button>
        </form>
      ) : limitState && leadSubmitted ? (
        <div
          role="status"
          style={{
            padding: '14px',
            borderTop: '1px solid #e5e7eb',
            background: '#f0fdf4',
            color: '#065f46',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Thanks — your details were sent. You'll hear back soon.
        </div>
      ) : (
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: 8,
          padding: 10,
          borderTop: '1px solid #e5e7eb',
          background: '#fafafa',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ended ? 'Chat ended' : 'Type a message…'}
          disabled={pending || ended}
          aria-label="Message"
          autoComplete="off"
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
            background: ended ? '#f3f4f6' : 'white',
            minHeight: 40,
          }}
        />
        <button
          type="submit"
          disabled={pending || ended || !input.trim()}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 8,
            background: color,
            color: 'white',
            fontWeight: 600,
            cursor: pending || ended || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: pending || ended || !input.trim() ? 0.6 : 1,
            minHeight: 40,
            minWidth: 64,
          }}
        >
          Send
        </button>
      </form>
      )}
    </div>
  );
}

const leadInputStyle = {
  padding: '8px 10px',
  border: '1px solid #fcd34d',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
  background: 'white',
  fontFamily: 'inherit',
  color: '#111827',
};

function MessageBubble({ role, content, userColor }) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        margin: '8px 0',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          borderRadius: 14,
          background: isUser ? userColor : '#f3f4f6',
          color: isUser ? 'white' : '#111827',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.45,
        }}
      >
        {content ? renderWithLinks(content, isUser) : '…'}
      </div>
    </div>
  );
}

/**
 * Split content on URLs and render http(s) URLs as anchor tags. Plain text segments
 * preserved as-is so streaming updates still display naturally.
 *
 * @param {string} content
 * @param {boolean} onColored
 */
function renderWithLinks(content, onColored) {
  const parts = content.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: onColored ? 'white' : '#1d4ed8',
            textDecoration: 'underline',
            wordBreak: 'break-all',
          }}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
