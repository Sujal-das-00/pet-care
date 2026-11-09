import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { serviceUnavailable } from '../utils/errors.js';

let client;
export const storageConfigured = () => Boolean(env.r2.endpoint && env.r2.accessKeyId && env.r2.secretAccessKey);

function s3() {
  if (!storageConfigured()) throw serviceUnavailable('File storage is not configured');
  client ??= new S3Client({
    region: 'auto', // Cloudflare R2
    endpoint: env.r2.endpoint,
    credentials: { accessKeyId: env.r2.accessKeyId, secretAccessKey: env.r2.secretAccessKey },
  });
  return client;
}

export const presignUpload = (key, contentType, sizeBytes) =>
  getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: 300 },
  );

export const presignDownload = (key) =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }), { expiresIn: 300 });

export async function objectExists(key) {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    return true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

export const deleteObject = (key) => s3().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
