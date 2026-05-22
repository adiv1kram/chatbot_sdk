/**
 * Build the email body for an inbound lead. Returns { subject, html, text }.
 *
 * Inline styles only — most email clients ignore <style> blocks. Plain-text
 * fallback is included as a multipart/alternative sibling.
 *
 * @param {Object} args
 * @param {string} args.professionalName - The chatbot owner's display name (used in subject + intro).
 * @param {import('../core/types.js').Lead} args.lead - Lead object from onLead.
 * @param {import('../core/types.js').ChatMessage[]} args.transcript - Full transcript at end-of-chat.
 * @param {string} [args.siteUrl] - Optional link back to the public chatbot URL.
 * @param {'opportunity'|'needs_followup'} [args.classification] - Drives the subject wording (opportunity vs lead). Defaults to 'opportunity' for backwards compatibility.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildLeadEmail({
  professionalName,
  lead,
  transcript,
  siteUrl,
  classification = 'opportunity',
}) {
  const visitor = lead.visitor || {};
  const brief = lead.brief || {};
  const visitorLabel = visitor.name || visitor.email || 'A visitor';
  const isOpp = classification === 'opportunity';
  const headline = isOpp ? 'opportunity' : 'lead';
  const subject = `New ${headline} via your AI assistant — ${visitorLabel}`;

  const highlights = Array.isArray(brief.highlights) ? brief.highlights.filter(Boolean) : [];
  const transcriptLines = Array.isArray(transcript) ? transcript : [];

  const html = renderHtml({
    professionalName,
    visitor,
    brief,
    highlights,
    transcriptLines,
    siteUrl,
    headline,
  });
  const text = renderText({
    professionalName,
    visitor,
    brief,
    highlights,
    transcriptLines,
    siteUrl,
    headline,
  });

  return { subject, html, text };
}

function renderHtml({
  professionalName,
  visitor,
  brief,
  highlights,
  transcriptLines,
  siteUrl,
  headline,
}) {
  const action = headline === 'opportunity' ? 'flagged a real opportunity' : 'captured a new lead';
  const intro = professionalName
    ? `Your AI assistant just ${action} for ${escapeHtml(professionalName)}.`
    : `Your AI assistant just ${action}.`;
  const cardHeading = headline === 'opportunity' ? 'New opportunity' : 'New lead';

  const visitorRows = [
    visitor.name && row('Name', escapeHtml(visitor.name)),
    visitor.email &&
      row(
        'Email',
        `<a href="mailto:${escapeAttr(visitor.email)}">${escapeHtml(visitor.email)}</a>`
      ),
    visitor.company && row('Company', escapeHtml(visitor.company)),
  ]
    .filter(Boolean)
    .join('');

  const highlightsHtml = highlights.length
    ? `<ul style="margin:8px 0 0 18px;padding:0;color:#1f2937;font-size:14px;line-height:1.55">
        ${highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
      </ul>`
    : '<p style="margin:6px 0 0;color:#6b7280;font-size:13px">No highlights extracted.</p>';

  const transcriptHtml = transcriptLines.length
    ? transcriptLines
        .map((m) => {
          const role = m.role === 'user' ? 'Visitor' : 'Assistant';
          const color = m.role === 'user' ? '#1d4ed8' : '#0f766e';
          return `<div style="margin:10px 0">
            <div style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.04em">${role}</div>
            <div style="font-size:14px;color:#111827;white-space:pre-wrap;line-height:1.55">${escapeHtml(m.content || '')}</div>
          </div>`;
        })
        .join('')
    : '<p style="color:#6b7280;font-size:13px">No transcript captured.</p>';

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
        <tr><td style="padding:24px 28px 8px">
          <h1 style="margin:0;font-size:18px;color:#111827">${escapeHtml(cardHeading)}</h1>
          <p style="margin:6px 0 0;color:#374151;font-size:14px">${intro}</p>
        </td></tr>

        <tr><td style="padding:18px 28px 0">
          <h2 style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Topic</h2>
          <p style="margin:0;color:#111827;font-size:15px;font-weight:500">${escapeHtml(brief.topic || 'Untitled')}</p>
        </td></tr>

        ${
          visitorRows
            ? `<tr><td style="padding:18px 28px 0">
              <h2 style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Visitor</h2>
              <table cellspacing="0" cellpadding="0" border="0" style="font-size:14px;color:#111827">${visitorRows}</table>
            </td></tr>`
            : ''
        }

        <tr><td style="padding:18px 28px 0">
          <h2 style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Highlights</h2>
          ${highlightsHtml}
        </td></tr>

        ${
          brief.nextStep
            ? `<tr><td style="padding:18px 28px 0">
              <h2 style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Next step</h2>
              <p style="margin:0;color:#111827;font-size:14px">${escapeHtml(brief.nextStep)}</p>
            </td></tr>`
            : ''
        }

        <tr><td style="padding:18px 28px 0">
          <h2 style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Conversation</h2>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px">${transcriptHtml}</div>
        </td></tr>

        <tr><td style="padding:20px 28px 24px">
          <p style="margin:0;color:#6b7280;font-size:12px">
            Sent by your AI assistant${siteUrl ? ` · <a href="${escapeAttr(siteUrl)}" style="color:#2563eb;text-decoration:none">${escapeHtml(siteUrl)}</a>` : ''}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function row(label, valueHtml) {
  return `<tr>
    <td style="padding:2px 12px 2px 0;color:#6b7280;font-size:13px;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:2px 0;color:#111827;font-size:14px">${valueHtml}</td>
  </tr>`;
}

function renderText({
  professionalName,
  visitor,
  brief,
  highlights,
  transcriptLines,
  siteUrl,
  headline,
}) {
  const action = headline === 'opportunity' ? 'flagged a real opportunity' : 'captured a new lead';
  const lines = [];
  lines.push(
    professionalName
      ? `Your AI assistant just ${action} for ${professionalName}.`
      : `Your AI assistant just ${action}.`
  );
  lines.push('');
  lines.push(`Topic: ${brief.topic || 'Untitled'}`);
  if (visitor.name) lines.push(`Visitor: ${visitor.name}`);
  if (visitor.email) lines.push(`Email: ${visitor.email}`);
  if (visitor.company) lines.push(`Company: ${visitor.company}`);
  if (highlights.length) {
    lines.push('');
    lines.push('Highlights:');
    for (const h of highlights) lines.push(`- ${h}`);
  }
  if (brief.nextStep) {
    lines.push('');
    lines.push(`Next step: ${brief.nextStep}`);
  }
  lines.push('');
  lines.push('--- Conversation ---');
  for (const m of transcriptLines) {
    lines.push('');
    lines.push(`${m.role === 'user' ? 'VISITOR' : 'ASSISTANT'}:`);
    lines.push(m.content || '');
  }
  if (siteUrl) {
    lines.push('');
    lines.push(`Sent by your AI assistant — ${siteUrl}`);
  }
  return lines.join('\n');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}
