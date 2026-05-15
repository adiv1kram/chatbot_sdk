import { createFilesystemStorage } from './filesystem.js';
import { createGithubStorage } from './github.js';
import { createS3Storage } from './s3.js';

export { createFilesystemStorage, createGithubStorage, createS3Storage };

/**
 * @typedef {Object} FilesystemStorageConfig
 * @property {'filesystem'} type
 * @property {string} path - Absolute or cwd-relative path where the profile JSON is read/written.
 *
 * @typedef {Object} GithubStorageConfig
 * @property {'github'} type
 * @property {string} owner - GitHub user or organization (e.g. "octocat").
 * @property {string} repo - Repository name (e.g. "my-site").
 * @property {string} path - Path inside the repo (e.g. "lib/profile.json").
 * @property {string} token - Fine-grained PAT or classic token with `contents:write` on the repo.
 * @property {string} [branch] - Branch to commit to. Defaults to the repo's default branch.
 * @property {string} [commitMessage] - Commit message used when saving. Default: "chore: update profile".
 * @property {string} [authorName] - Commit author name. Default: "personal-assistant-chatbot".
 * @property {string} [authorEmail] - Commit author email. Default: "bot@personal-assistant-chatbot".
 *
 * @typedef {Object} S3StorageConfig
 * @property {'s3'} type
 * @property {string} bucket
 * @property {string} key - Object key (e.g. "profiles/main.json").
 * @property {string} region
 * @property {string} [endpoint] - Custom endpoint for S3-compatible services (R2, Backblaze, etc.).
 * @property {string} [accessKeyId] - If omitted, falls back to the AWS SDK's default credential chain.
 * @property {string} [secretAccessKey]
 * @property {boolean} [forcePathStyle] - Set true for most S3-compatible non-AWS endpoints.
 *
 * @typedef {FilesystemStorageConfig | GithubStorageConfig | S3StorageConfig} StorageConfig
 */

/**
 * Build a storage adapter from a serializable config object. Throws if the
 * `type` is unrecognized — fail loud at handler-construction time rather than
 * silently dropping writes later.
 *
 * @param {StorageConfig} config
 * @returns {import('../core/types.js').StorageAdapter}
 */
export function createStorage(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('createStorage: config object is required');
  }
  switch (config.type) {
    case 'filesystem':
      return createFilesystemStorage(config);
    case 'github':
      return createGithubStorage(config);
    case 's3':
      return createS3Storage(config);
    default:
      throw new Error(
        `createStorage: unknown storage type "${/** @type {{type: string}} */ (config).type}". ` +
          'Supported: "filesystem", "github", "s3".'
      );
  }
}
