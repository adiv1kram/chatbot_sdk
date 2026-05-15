/**
 * Public type definitions for the SDK. Defined here in JSDoc so the build can
 * emit matching .d.ts files and TypeScript consumers get IntelliSense.
 */

/**
 * @typedef {Object} ProfileExperience
 * @property {string} [company]
 * @property {string} [role]
 * @property {string} [startDate]
 * @property {string|null} [endDate] - null means current.
 * @property {string} [description]
 * @property {string[]} [skills]
 */

/**
 * @typedef {Object} ProfileEducation
 * @property {string} [institution]
 * @property {string} [degree]
 * @property {number|string} [year]
 * @property {string} [marks] - Free-form grade / CGPA / honors. Fits any region's grading system.
 */

/**
 * @typedef {'certification'|'research'|'award'|'felicitation'|'publication'|'other'} CredentialType
 *
 * @typedef {Object} ProfileCredential
 * @property {CredentialType} [type]
 * @property {string} [title]
 * @property {string} [issuer]
 * @property {string} [date]
 * @property {string} [url]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} ProfileProject
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [url]
 * @property {string[]} [tech]
 */

/**
 * @typedef {'consulting'|'full_time'|'mentorship'|'advisory'|'speaking'|'other'} OfferingType
 */

/**
 * @typedef {Object} ProfileOffering
 * @property {OfferingType} [type]
 * @property {string} [description]
 * @property {string} [availability]
 * @property {string} [rateRange]
 */

/**
 * @typedef {Object} ContactField
 * @property {string} [value]
 * @property {boolean} [shareInChat] - If false, bot routes through lead-capture flow instead of sharing.
 */

/**
 * @typedef {Object} ProfileContact
 * @property {ContactField} [linkedin]
 * @property {ContactField} [calendly]
 * @property {ContactField} [email]
 * @property {ContactField} [phone]
 * @property {ContactField} [website]
 */

/**
 * @typedef {Object} ProfilePreferences
 * @property {'friendly'|'formal'|'casual'} [tone]
 * @property {string[]} [languages]
 * @property {string} [timeZone]
 * @property {string[]} [locations]
 */

/**
 * @typedef {Object} ProfileGuardrails
 * @property {string[]} [neverDiscuss]
 * @property {string[]} [alwaysMention]
 */

/**
 * @typedef {Object} ProfileDisclosure
 * @property {string} [botGreeting] - Override for the bot's opening line. Blank = auto-built from name.
 */

/**
 * @typedef {Object} Profile
 * @property {string} [name]
 * @property {string} [headline]
 * @property {string} [bio]
 * @property {string} [photoUrl]
 * @property {ProfileExperience[]} [experience]
 * @property {ProfileEducation[]} [education]
 * @property {ProfileProject[]} [projects]
 * @property {ProfileCredential[]} [credentials]
 * @property {string[]} [skills]
 * @property {ProfileOffering[]} [offerings]
 * @property {ProfileContact} [contact]
 * @property {ProfilePreferences} [preferences]
 * @property {ProfileGuardrails} [guardrails]
 * @property {string} [freeform] - Anything else the professional wants the bot to know that doesn't fit a structured field. Bot reads this verbatim.
 * @property {ProfileDisclosure} [disclosure]
 */

/**
 * @typedef {'user'|'assistant'} ChatRole
 */

/**
 * @typedef {Object} ChatMessage
 * @property {ChatRole} role
 * @property {string} content
 */

/**
 * @typedef {'spam'|'info_only'|'opportunity'|'needs_followup'} IntentClassification
 */

/**
 * @typedef {Object} VisitorInfo
 * @property {string} [name]
 * @property {string} [company]
 * @property {string} [email]
 */

/**
 * @typedef {Object} LeadBrief
 * @property {string} topic
 * @property {string[]} highlights
 * @property {string} [nextStep]
 */

/**
 * @typedef {Object} Lead
 * @property {IntentClassification} classification
 * @property {number} confidence
 * @property {VisitorInfo} visitor
 * @property {LeadBrief} brief
 * @property {ChatMessage[]} transcript
 */

/**
 * @typedef {Object} ChatEnd
 * @property {ChatMessage[]} transcript
 * @property {IntentClassification} classification
 * @property {number} confidence
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {() => Promise<string|null>} read - Return the raw stored content, or null if not yet written.
 * @property {(content: string) => Promise<void>} write - Persist new content, overwriting any existing.
 * @property {boolean} [supportsSecrets] - True if this adapter is acceptable for storing API keys / secrets. The github adapter sets this to false so the admin route refuses to use it for secrets.
 */

// Pure type module — no runtime exports.
export {};
