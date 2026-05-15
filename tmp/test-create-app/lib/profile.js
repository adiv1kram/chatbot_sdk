// lib/profile.js — your professional profile.
// Run `npx personal-assistant-chatbot init ./resume.pdf --out lib/profile.js`
// to autopopulate the ✅ sections from a resume.

/** @type {import('personal-assistant-chatbot/server').ChatHandlerConfig['profile']} */
export const profile = {
  // ✅ Replace with your details (or autopopulate from a resume).
  name: 'Your Name',
  headline: 'Your role · X years · 1–3 specialties',
  bio: 'A short first-person paragraph about you.',
  experience: [
    // {
    //   company: 'Acme Corp',
    //   role: 'Senior Engineer',
    //   startDate: '2023-01',
    //   endDate: null,
    //   description: 'What you do here.',
    //   skills: ['Go', 'Postgres'],
    // },
  ],
  education: [],
  projects: [],

  // 📝 TODO — what kinds of engagements you take on.
  offerings: [
    // { type: 'consulting', description: '…', availability: '…', rateRange: '$…' },
    // { type: 'full_time', description: '…', availability: '…' },
  ],

  // 📝 TODO — contact details + per-field decision on whether the bot may share them.
  contact: {
    // linkedin: { value: 'https://linkedin.com/in/...', shareInChat: true },
    // calendly: { value: 'https://calendly.com/...',  shareInChat: true },
    // email:    { value: 'you@example.com',            shareInChat: false },
  },

  preferences: {
    tone: 'friendly',
    languages: ['English'],
    locations: ['Remote'],
  },

  guardrails: {
    // neverDiscuss: ['salary at current company'],
    // alwaysMention: ['prefers remote-first roles'],
  },

  disclosure: {
    botGreeting:
      "Hi, I'm an AI assistant — I can answer about my background, projects, and availability. They'll see a summary of our chat after.",
  },
};
