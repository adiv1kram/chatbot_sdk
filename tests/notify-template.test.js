import { describe, it, expect } from 'vitest';
import { buildLeadEmail } from '../src/notify/index.js';

describe('buildLeadEmail', () => {
  const baseLead = {
    classification: 'opportunity',
    confidence: 0.9,
    visitor: { name: 'Sarah Chen', email: 'sarah@x.co', company: 'Acme' },
    brief: {
      topic: 'VP of Engineering role',
      highlights: ['Series B', '$400–500k'],
      nextStep: 'Sarah will book via Calendly',
    },
    transcript: [
      { role: 'user', content: 'Are you open to leadership roles?' },
      { role: 'assistant', content: "I'd be happy to discuss leadership roles." },
    ],
  };

  it('builds subject from visitor name', () => {
    const { subject } = buildLeadEmail({
      professionalName: 'Jordan',
      lead: baseLead,
      transcript: baseLead.transcript,
    });
    expect(subject).toContain('Sarah Chen');
    expect(subject).toMatch(/opportunity/i);
  });

  it('falls back to visitor email when no name', () => {
    const lead = { ...baseLead, visitor: { email: 'sarah@x.co' } };
    const { subject } = buildLeadEmail({ professionalName: 'Jordan', lead, transcript: [] });
    expect(subject).toContain('sarah@x.co');
  });

  it('includes the brief topic, highlights, and next step in the HTML and text bodies', () => {
    const { html, text } = buildLeadEmail({
      professionalName: 'Jordan',
      lead: baseLead,
      transcript: baseLead.transcript,
    });
    expect(html).toContain('VP of Engineering role');
    expect(html).toContain('Series B');
    expect(html).toContain('Calendly');
    expect(text).toContain('VP of Engineering role');
    expect(text).toContain('Series B');
    expect(text).toContain('Calendly');
  });

  it('renders both visitor and assistant turns in the transcript', () => {
    const { html, text } = buildLeadEmail({
      professionalName: 'Jordan',
      lead: baseLead,
      transcript: baseLead.transcript,
    });
    expect(html).toContain('Are you open to leadership roles?');
    // Apostrophe is HTML-entity-escaped in the rendered email.
    expect(html).toContain('happy to discuss leadership roles');
    expect(text).toContain('VISITOR');
    expect(text).toContain('ASSISTANT');
  });

  it('escapes HTML in user-supplied content to avoid injection', () => {
    const lead = {
      ...baseLead,
      visitor: { name: 'Mallory <script>', email: 'm@x.co' },
      brief: { ...baseLead.brief, topic: '<img src=x onerror=alert(1)>' },
    };
    const { html } = buildLeadEmail({ professionalName: 'Jordan', lead, transcript: [] });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles missing optional fields without throwing', () => {
    const lead = {
      classification: 'opportunity',
      confidence: 0.5,
      visitor: {},
      brief: { topic: 'Untitled', highlights: [] },
      transcript: [],
    };
    const { subject, html, text } = buildLeadEmail({
      professionalName: '',
      lead,
      transcript: [],
    });
    expect(subject).toBeTruthy();
    expect(html).toContain('No highlights extracted');
    expect(text).toContain('Untitled');
  });
});
