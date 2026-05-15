import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/core/system-prompt.js';

const baseProfile = {
  name: 'Alex Morgan',
  headline: 'Senior Engineer',
  bio: 'Backend platforms.',
};

describe('buildSystemPrompt', () => {
  it('opens by naming the professional', () => {
    const prompt = buildSystemPrompt(baseProfile);
    expect(prompt.startsWith("You are Alex Morgan's AI assistant")).toBe(true);
  });

  it('includes the critical no-fabrication rules', () => {
    const prompt = buildSystemPrompt(baseProfile);
    expect(prompt).toContain('NEVER fabricate');
    expect(prompt).toContain("That's not something I have on hand");
    expect(prompt).toContain('NEVER make up salary');
  });

  it('lists shareable contacts and excludes gated ones', () => {
    const prompt = buildSystemPrompt({
      ...baseProfile,
      contact: {
        linkedin: { value: 'https://linkedin.com/in/alex', shareInChat: true },
        email: { value: 'alex@example.com', shareInChat: false },
        calendly: { value: 'https://cal/alex', shareInChat: true },
      },
    });
    expect(prompt).toContain('https://linkedin.com/in/alex');
    expect(prompt).toContain('https://cal/alex');
    expect(prompt).not.toContain('alex@example.com');
    expect(prompt).toContain('Do NOT share these contact fields in chat: email');
  });

  it('omits the shareable section when no contacts are shareable', () => {
    const prompt = buildSystemPrompt({
      ...baseProfile,
      contact: {
        email: { value: 'alex@example.com', shareInChat: false },
      },
    });
    expect(prompt).toContain('No contact details may be shared directly');
  });

  it('renders neverDiscuss and alwaysMention guardrails', () => {
    const prompt = buildSystemPrompt({
      ...baseProfile,
      guardrails: {
        neverDiscuss: ['my salary', 'my health'],
        alwaysMention: ['prefers remote'],
      },
    });
    expect(prompt).toContain('TOPICS YOU MUST NOT DISCUSS:');
    expect(prompt).toContain('- my salary');
    expect(prompt).toContain('- my health');
    expect(prompt).toContain('THINGS WORTH MENTIONING WHEN RELEVANT:');
    expect(prompt).toContain('- prefers remote');
  });

  it('includes experience, education, projects, offerings when present', () => {
    const prompt = buildSystemPrompt({
      ...baseProfile,
      experience: [
        {
          company: 'Acme',
          role: 'Engineer',
          startDate: '2023-01',
          endDate: null,
          description: 'Built stuff',
          skills: ['Go', 'Kafka'],
        },
      ],
      education: [{ institution: 'State', degree: 'B.S. CS', year: 2017 }],
      projects: [{ name: 'otel-go', description: 'auto instrumentation' }],
      offerings: [
        {
          type: 'consulting',
          description: 'short gigs',
          availability: '6 hrs/wk',
          rateRange: '$250/hr',
        },
      ],
    });
    expect(prompt).toContain('Engineer at Acme');
    expect(prompt).toContain('Built stuff');
    expect(prompt).toContain('skills: Go, Kafka');
    expect(prompt).toContain('B.S. CS, State (2017)');
    expect(prompt).toContain('otel-go');
    expect(prompt).toContain('consulting: short gigs');
    expect(prompt).toContain('Availability: 6 hrs/wk');
    expect(prompt).toContain('Rate range: $250/hr');
  });

  it('uses friendly as the default tone', () => {
    const prompt = buildSystemPrompt(baseProfile);
    expect(prompt).toContain('Stay friendly');
  });

  it('reflects an overridden tone', () => {
    const prompt = buildSystemPrompt({ ...baseProfile, preferences: { tone: 'formal' } });
    expect(prompt).toContain('Stay formal');
  });
});
