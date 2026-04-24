import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import { readCredentials } from '../common/credentials.js';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

async function getR2Config(db: any, tenantId: string): Promise<R2Config> {
  // Try DB config first
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'storage')))
    .limit(1);

  if (config?.isEnabled) {
    const creds = readCredentials(config.credentials) as Record<string, string>;
    const settings = (config.settings ?? {}) as Record<string, string>;
    if (creds.accessKeyId && creds.secretAccessKey && settings.accountId) {
      return {
        accountId: settings.accountId,
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        bucketName: settings.bucketName || 'rivertown-psa',
      };
    }
  }

  // Fall back to env vars
  return {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'rivertown-psa',
  };
}

function createS3Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.accountId ? `https://${config.accountId}.r2.cloudflarestorage.com` : undefined,
    credentials: config.accessKeyId ? {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    } : undefined,
  });
}

export async function uploadFile(db: any, tenantId: string, key: string, body: Buffer, contentType: string): Promise<void> {
  const config = await getR2Config(db, tenantId);
  const s3 = createS3Client(config);
  await s3.send(new PutObjectCommand({ Bucket: config.bucketName, Key: key, Body: body, ContentType: contentType }));
}

export async function getFileUrl(db: any, tenantId: string, key: string, expiresIn = 3600): Promise<string> {
  const config = await getR2Config(db, tenantId);
  const s3 = createS3Client(config);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.bucketName, Key: key }), { expiresIn });
}

export async function deleteFile(db: any, tenantId: string, key: string): Promise<void> {
  const config = await getR2Config(db, tenantId);
  const s3 = createS3Client(config);
  await s3.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}

export async function isR2Configured(db: any, tenantId: string): Promise<boolean> {
  const config = await getR2Config(db, tenantId);
  return !!(config.accountId && config.accessKeyId && config.secretAccessKey);
}

export async function testR2Connection(db: any, tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getR2Config(db, tenantId);
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
      return { success: false, error: 'Storage credentials are not configured' };
    }
    const s3 = createS3Client(config);
    await s3.send(new HeadBucketCommand({ Bucket: config.bucketName }));
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    return { success: false, error: message };
  }
}
