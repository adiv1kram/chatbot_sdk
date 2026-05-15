import * as v from 'valibot';

const ContactFieldObjectSchema = v.object({
  value: v.optional(v.string(), ''),
  shareInChat: v.optional(v.boolean(), false),
});

/**
 * Contact fields are normally `{ value, shareInChat }` objects but we also
 * accept a bare string for forgiveness when someone hand-edits profile.json.
 * Bare strings are upgraded to `{ value: <extracted-url-or-string>, shareInChat: true }`.
 * If the string is a markdown link like "[label](url)" we extract just the URL.
 */
const ContactFieldSchema = v.union([
  ContactFieldObjectSchema,
  v.pipe(
    v.string(),
    v.transform((s) => {
      const md = s.match(/\((https?:\/\/[^)\s]+)\)/);
      return { value: md ? md[1] : s, shareInChat: true };
    })
  ),
]);

const ExperienceSchema = v.object({
  company: v.optional(v.string(), ''),
  role: v.optional(v.string(), ''),
  startDate: v.optional(v.string(), ''),
  endDate: v.optional(v.nullable(v.string()), null),
  description: v.optional(v.string(), ''),
  skills: v.optional(v.array(v.string()), []),
});

const EducationSchema = v.object({
  institution: v.optional(v.string(), ''),
  degree: v.optional(v.string(), ''),
  year: v.optional(v.union([v.number(), v.string()]), ''),
  marks: v.optional(v.string(), ''),
});

const CredentialTypeSchema = v.picklist([
  'certification',
  'research',
  'award',
  'felicitation',
  'publication',
  'other',
]);

const CredentialSchema = v.object({
  type: v.optional(CredentialTypeSchema, 'other'),
  title: v.optional(v.string(), ''),
  issuer: v.optional(v.string(), ''),
  date: v.optional(v.string(), ''),
  url: v.optional(v.string(), ''),
  notes: v.optional(v.string(), ''),
});

const ProjectSchema = v.object({
  name: v.optional(v.string(), ''),
  description: v.optional(v.string(), ''),
  url: v.optional(v.string(), ''),
  tech: v.optional(v.array(v.string()), []),
});

const OfferingTypeSchema = v.picklist([
  'consulting',
  'full_time',
  'mentorship',
  'advisory',
  'speaking',
  'other',
]);

const OfferingObjectSchema = v.object({
  type: v.optional(OfferingTypeSchema, 'other'),
  description: v.optional(v.string(), ''),
  availability: v.optional(v.string(), ''),
  rateRange: v.optional(v.string(), ''),
});

/**
 * Offerings are normally `{ type, description, ... }` but a bare string is
 * accepted for hand-edited profiles. It gets coerced into a generic "other"
 * offering with the string as the description.
 */
const OfferingSchema = v.union([
  OfferingObjectSchema,
  v.pipe(
    v.string(),
    v.transform((s) => ({ type: 'other', description: s, availability: '', rateRange: '' }))
  ),
]);

const ContactSchema = v.object({
  linkedin: v.optional(ContactFieldSchema),
  calendly: v.optional(ContactFieldSchema),
  email: v.optional(ContactFieldSchema),
  phone: v.optional(ContactFieldSchema),
  website: v.optional(ContactFieldSchema),
});

const PreferencesSchema = v.object({
  tone: v.optional(v.picklist(['friendly', 'formal', 'casual']), 'friendly'),
  languages: v.optional(v.array(v.string()), []),
  timeZone: v.optional(v.string(), ''),
  locations: v.optional(v.array(v.string()), []),
});

const GuardrailsSchema = v.object({
  neverDiscuss: v.optional(v.array(v.string()), []),
  alwaysMention: v.optional(v.array(v.string()), []),
});

const DisclosureSchema = v.object({
  botGreeting: v.optional(v.string(), ''),
});

/**
 * Profile schema — every field is optional so that an empty profile (the
 * professional hasn't filled in /admin yet) round-trips through parse without
 * error. The chat path gates on isProfileConfigured() before using the profile.
 */
export const ProfileSchema = v.object({
  name: v.optional(v.string(), ''),
  headline: v.optional(v.string(), ''),
  bio: v.optional(v.string(), ''),
  photoUrl: v.optional(v.string(), ''),
  experience: v.optional(v.array(ExperienceSchema), []),
  education: v.optional(v.array(EducationSchema), []),
  projects: v.optional(v.array(ProjectSchema), []),
  credentials: v.optional(v.array(CredentialSchema), []),
  skills: v.optional(v.array(v.string()), []),
  offerings: v.optional(v.array(OfferingSchema), []),
  contact: v.optional(ContactSchema, {}),
  preferences: v.optional(PreferencesSchema, {}),
  guardrails: v.optional(GuardrailsSchema, {}),
  freeform: v.optional(v.string(), ''),
  disclosure: v.optional(DisclosureSchema, {}),
});

export const ChatMessageSchema = v.object({
  role: v.picklist(['user', 'assistant']),
  content: v.pipe(v.string(), v.minLength(1), v.maxLength(8000)),
});

const VisitorInputSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.maxLength(200)), ''),
  email: v.optional(v.pipe(v.string(), v.maxLength(254)), ''),
  company: v.optional(v.pipe(v.string(), v.maxLength(200)), ''),
  note: v.optional(v.pipe(v.string(), v.maxLength(2000)), ''),
});

export const ChatRequestSchema = v.object({
  action: v.optional(v.picklist(['message', 'end', 'final_lead']), 'message'),
  sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  messages: v.pipe(v.array(ChatMessageSchema), v.minLength(1), v.maxLength(100)),
  visitor: v.optional(VisitorInputSchema),
});

/**
 * Parse and validate a chat request body. Throws a valibot error on bad input.
 * @param {unknown} input
 * @returns {{ sessionId: string, action: 'message'|'end', messages: Array<{role: 'user'|'assistant', content: string}> }}
 */
export function validateChatRequest(input) {
  return v.parse(ChatRequestSchema, input);
}

/**
 * Parse and validate a profile object. Returns a profile with all optional
 * fields filled to safe defaults (empty strings / arrays). Throws valibot
 * error only on type mismatches, not on missing fields.
 * @param {unknown} input
 * @returns {import('./types.js').Profile}
 */
export function validateProfile(input) {
  return v.parse(ProfileSchema, input ?? {});
}

/**
 * True when the profile is filled in enough for the chatbot to be useful. The
 * widget hides itself and the chat endpoint returns "not configured" until
 * this is true. Minimum bar: a name exists.
 * @param {import('./types.js').Profile | null | undefined} profile
 * @returns {boolean}
 */
export function isProfileConfigured(profile) {
  return !!(profile && typeof profile.name === 'string' && profile.name.trim().length > 0);
}

/**
 * The canonical "empty" profile shape — what /admin starts with on first load.
 * @returns {import('./types.js').Profile}
 */
export function emptyProfile() {
  return validateProfile({});
}

/**
 * Distinguish valibot validation errors from other errors.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isValidationError(err) {
  return err instanceof v.ValiError;
}
