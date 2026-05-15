/**
 * Filesystem-backed storage. Reads and writes a single JSON file on disk.
 *
 * Works on any stateful host (VPS, Docker, Render, Railway, Fly, self-hosted).
 * Does NOT work on serverless platforms with read-only filesystems (Vercel,
 * Netlify, Cloudflare Workers) — pick the github or s3 adapter for those.
 *
 * node:fs and node:path are loaded lazily so the storage barrel module stays
 * importable on edge runtimes that lack node builtins.
 *
 * @param {import('./index.js').FilesystemStorageConfig} config
 * @returns {import('../core/types.js').StorageAdapter}
 */
export function createFilesystemStorage(config) {
  if (!config.path || typeof config.path !== 'string') {
    throw new Error('createFilesystemStorage: config.path is required');
  }
  const rawPath = config.path;

  /** @type {Promise<{readFile: any, writeFile: any, mkdir: any, dirname: any, resolveAbs: (p: string) => string}>|null} */
  let modsP = null;
  async function nodeMods() {
    if (modsP) return modsP;
    modsP = (async () => {
      const [fs, path] = await Promise.all([
        import('node:fs/promises'),
        import('node:path'),
      ]);
      const resolveAbs = (p) =>
        path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      return {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
        dirname: path.dirname,
        resolveAbs,
      };
    })();
    return modsP;
  }

  return {
    supportsSecrets: true,
    async read() {
      const m = await nodeMods();
      try {
        return await m.readFile(m.resolveAbs(rawPath), 'utf8');
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
          return null;
        }
        throw err;
      }
    },
    async write(content) {
      const m = await nodeMods();
      const abs = m.resolveAbs(rawPath);
      await m.mkdir(m.dirname(abs), { recursive: true });
      await m.writeFile(abs, content, 'utf8');
    },
  };
}
