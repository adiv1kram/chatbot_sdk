/**
 * Builds the LLM system prompt from a professional's profile.
 *
 * The prompt encodes:
 * - First-person persona with upfront AI disclosure.
 * - Strict no-fabrication rules and guardrails.
 * - Contact-sharing policy derived from per-field privacy flags.
 * - Mid-chat identity-capture instructions.
 *
 * @param {import('./types.js').Profile} profile
 * @param {{ nearLimitNudge?: boolean }} [opts] - When nearLimitNudge is true, a one-shot instruction is appended telling the bot to politely ask for name + email this turn (the chat is about to hit a rate-limit).
 * @returns {string}
 */
export function buildSystemPrompt(profile, opts = {}) {
  const name = profile.name;
  const tone = profile.preferences?.tone ?? 'friendly';

  const sections = [
    `You are ${name}'s AI assistant. You speak about ${name} in the first person ("I", "me", "my"), but you must clearly disclose that you are an AI assistant whenever the visitor asks or when context calls for it.`,
    '',
    'CRITICAL RULES:',
    `1. NEVER fabricate or invent information about ${name}. Use ONLY the profile below.`,
    `2. If asked something not in the profile, say: "That's not something I have on hand — I can pass it to ${name} and they'll follow up."`,
    `3. NEVER make up salary, availability, future commitments, or rates. Route those to a follow-up with ${name}.`,
    `4. Stay ${tone} but professional. Keep replies concise (2–4 sentences when possible).`,
  ];

  const guardrails = profile.guardrails;
  if (guardrails?.neverDiscuss?.length) {
    sections.push('');
    sections.push('TOPICS YOU MUST NOT DISCUSS:');
    for (const item of guardrails.neverDiscuss) sections.push(`- ${item}`);
  }
  if (guardrails?.alwaysMention?.length) {
    sections.push('');
    sections.push('THINGS WORTH MENTIONING WHEN RELEVANT:');
    for (const item of guardrails.alwaysMention) sections.push(`- ${item}`);
  }

  sections.push('');
  sections.push('CONTACT SHARING POLICY:');
  const shareable = [];
  const gated = [];
  for (const [key, field] of Object.entries(profile.contact ?? {})) {
    if (!field?.value) continue;
    if (field.shareInChat) shareable.push({ key, value: field.value });
    else gated.push(key);
  }
  if (shareable.length) {
    sections.push('You may share these contact details directly when relevant:');
    for (const { key, value } of shareable) sections.push(`- ${key}: ${value}`);
  } else {
    sections.push(
      `No contact details may be shared directly. Always route to follow-up with ${name}.`
    );
  }
  if (gated.length) {
    sections.push('');
    sections.push(`Do NOT share these contact fields in chat: ${gated.join(', ')}.`);
    sections.push(
      `For these, say something like: "Share your name and email and ${name} will reach out."`
    );
  }

  sections.push('');
  sections.push('CONVERSATION GOAL:');
  sections.push(
    `- Help the visitor understand whether ${name} is a fit for what they need.`,
    `- Once intent looks real (job, consulting, mentorship, collaboration), naturally ask for the visitor's name, company, and email so ${name} can follow up.`,
    `- Do NOT demand identity upfront — collect mid-chat once it's worth collecting.`
  );

  sections.push('');
  sections.push(`PROFILE FOR ${name.toUpperCase()}:`);
  if (profile.headline) sections.push(`Headline: ${profile.headline}`);
  if (profile.bio) sections.push(`Bio: ${profile.bio}`);

  if (profile.experience?.length) {
    sections.push('');
    sections.push('Experience:');
    for (const e of profile.experience) {
      const range = `${e.startDate} – ${e.endDate ?? 'present'}`;
      const skills = e.skills?.length ? ` [skills: ${e.skills.join(', ')}]` : '';
      const desc = e.description ? `\n    ${e.description}` : '';
      sections.push(`- ${e.role} at ${e.company} (${range})${skills}${desc}`);
    }
  }

  if (profile.education?.length) {
    sections.push('');
    sections.push('Education:');
    for (const e of profile.education) {
      const yearPart = e.year ? ` (${e.year})` : '';
      const marksPart = e.marks ? ` — ${e.marks}` : '';
      sections.push(`- ${e.degree}, ${e.institution}${yearPart}${marksPart}`);
    }
  }

  if (profile.credentials?.length) {
    const grouped = {};
    for (const c of profile.credentials) {
      const key = c.type || 'other';
      (grouped[key] ||= []).push(c);
    }
    const TYPE_LABEL = {
      certification: 'Certifications',
      research: 'Research',
      award: 'Awards',
      felicitation: 'Felicitations',
      publication: 'Publications',
      other: 'Other credentials',
    };
    const order = ['certification', 'research', 'publication', 'award', 'felicitation', 'other'];
    for (const t of order) {
      if (!grouped[t]?.length) continue;
      sections.push('');
      sections.push(`${TYPE_LABEL[t]}:`);
      for (const c of grouped[t]) {
        const parts = [c.title || '(untitled)'];
        if (c.issuer) parts.push(`— ${c.issuer}`);
        if (c.date) parts.push(`(${c.date})`);
        if (c.url) parts.push(`[${c.url}]`);
        let line = `- ${parts.join(' ')}`;
        if (c.notes) line += `\n    ${c.notes}`;
        sections.push(line);
      }
    }
  }

  if (profile.projects?.length) {
    sections.push('');
    sections.push('Projects:');
    for (const p of profile.projects) {
      const tech = p.tech?.length ? ` [${p.tech.join(', ')}]` : '';
      const url = p.url ? ` — ${p.url}` : '';
      const desc = p.description ? `\n    ${p.description}` : '';
      sections.push(`- ${p.name}${tech}${url}${desc}`);
    }
  }

  if (profile.offerings?.length) {
    sections.push('');
    sections.push('Offerings (what kinds of engagements I take on):');
    for (const o of profile.offerings) {
      const avail = o.availability ? `\n    Availability: ${o.availability}` : '';
      const rate = o.rateRange ? `\n    Rate range: ${o.rateRange}` : '';
      sections.push(`- ${o.type}: ${o.description}${avail}${rate}`);
    }
  }

  if (profile.skills?.length) {
    sections.push('');
    sections.push(`Skills: ${profile.skills.join(', ')}`);
  }

  if (profile.preferences) {
    const p = profile.preferences;
    const bits = [];
    if (p.languages?.length) bits.push(`languages: ${p.languages.join(', ')}`);
    if (p.timeZone) bits.push(`time zone: ${p.timeZone}`);
    if (p.locations?.length) bits.push(`locations: ${p.locations.join(', ')}`);
    if (bits.length) {
      sections.push('');
      sections.push(`Preferences: ${bits.join('; ')}`);
    }
  }

  if (profile.freeform && profile.freeform.trim()) {
    sections.push('');
    sections.push('ADDITIONAL CONTEXT FROM THE PROFESSIONAL (read this carefully — it is in their own words):');
    sections.push(profile.freeform.trim());
  }

  if (opts.nearLimitNudge) {
    sections.push('');
    sections.push('URGENT — JUST FOR THIS REPLY:');
    sections.push(
      `This visitor is approaching the chat limit. After answering their message briefly, naturally invite them to share their name and email so ${name} can reach them directly. Phrase it as: "I want to make sure you get a real answer — could you share your name and email so ${name} can follow up?" Keep it warm, not transactional.`
    );
  }

  return sections.join('\n');
}
