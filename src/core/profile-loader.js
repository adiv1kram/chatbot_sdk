import { validateProfile, emptyProfile, isValidationError } from './validators.js';

/**
 * Load the profile via a storage adapter, validate it, and return a fully
 * normalized profile object. If the storage has nothing yet, returns the empty
 * profile (which {@link isProfileConfigured} will report as not-yet-configured).
 *
 * @param {import('./types.js').StorageAdapter} storage
 * @returns {Promise<import('./types.js').Profile>}
 */
export async function loadProfile(storage) {
  let raw;
  try {
    raw = await storage.read();
  } catch (err) {
    throw new Error(
      `Failed to read profile from storage: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (raw == null || raw === '') return emptyProfile();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Stored profile is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    return validateProfile(parsed);
  } catch (err) {
    if (isValidationError(err)) {
      throw new Error(
        `Stored profile failed validation: ${err.issues?.map((i) => i.message).join('; ')}`
      );
    }
    throw err;
  }
}

/**
 * Validate, serialize, and write a profile via a storage adapter. The stored
 * form is JSON-stringified with two-space indent so the on-disk file stays
 * human-readable for devs who prefer to edit it directly.
 *
 * @param {import('./types.js').StorageAdapter} storage
 * @param {unknown} input
 * @returns {Promise<import('./types.js').Profile>}
 */
export async function saveProfile(storage, input) {
  const validated = validateProfile(input);
  await storage.write(JSON.stringify(validated, null, 2));
  return validated;
}
