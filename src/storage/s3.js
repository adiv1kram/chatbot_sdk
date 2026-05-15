/**
 * S3-compatible storage. Works with AWS S3, Cloudflare R2, Backblaze B2, MinIO,
 * and any other S3-compatible service.
 *
 * Requires `@aws-sdk/client-s3` as an optional peer dependency — install it in
 * the dev's app if they pick this adapter:
 *
 *   npm install @aws-sdk/client-s3
 *
 * @param {import('./index.js').S3StorageConfig} config
 * @returns {import('../core/types.js').StorageAdapter}
 */
export function createS3Storage(config) {
  const { bucket, key, region } = config;
  if (!bucket || !key || !region) {
    throw new Error('createS3Storage: config.bucket, config.key, config.region are all required');
  }

  /** @type {Promise<{client: any, GetObjectCommand: any, PutObjectCommand: any, NoSuchKey: any}>|null} */
  let clientPromise = null;
  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      let mod;
      try {
        mod = await import('@aws-sdk/client-s3');
      } catch {
        throw new Error(
          'S3 storage requires @aws-sdk/client-s3 — install it in your app: npm install @aws-sdk/client-s3'
        );
      }
      const { S3Client, GetObjectCommand, PutObjectCommand, NoSuchKey } = mod;
      const credentials =
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined;
      const client = new S3Client({
        region,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
        ...(credentials ? { credentials } : {}),
      });
      return { client, GetObjectCommand, PutObjectCommand, NoSuchKey };
    })();
    return clientPromise;
  }

  return {
    // Assumes the bucket has correct ACLs / IAM policies. If your bucket is
    // public, do NOT use this adapter for secrets.
    supportsSecrets: true,
    async read() {
      const { client, GetObjectCommand, NoSuchKey } = await getClient();
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!res.Body) return null;
        return await streamToString(res.Body);
      } catch (err) {
        if (err && (err.name === 'NoSuchKey' || err instanceof NoSuchKey)) return null;
        if (err && err.$metadata && err.$metadata.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async write(content) {
      const { client, PutObjectCommand } = await getClient();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: content,
          ContentType: 'application/json',
        })
      );
    },
  };
}

async function streamToString(body) {
  if (typeof body.transformToString === 'function') return body.transformToString();
  // Node Readable fallback.
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
