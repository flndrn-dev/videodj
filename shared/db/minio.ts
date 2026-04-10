/**
 * MinIO (S3-compatible) client for video file storage
 *
 * Video files go to MinIO, metadata goes to PostgreSQL.
 * Pre-signed URLs for direct browser streaming — no proxy needed.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'https://s3.videodj.studio'
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'videodj_admin'
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'v1de0dj_m1n10_s3cure!'
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'videodj-files'

let client: S3Client | null = null

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: MINIO_ENDPOINT,
      region: 'us-east-1', // MinIO ignores this but SDK requires it
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    })
  }
  return client
}

export async function ensureBucket(): Promise<void> {
  const s3 = getClient()
  try {
    await s3.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }))
    console.log(`MinIO: created bucket "${MINIO_BUCKET}"`)
  }
}

/**
 * Generate a pre-signed upload URL for the browser to upload directly to MinIO.
 * The browser POSTs the file directly — no server proxy needed.
 */
export async function getUploadUrl(key: string, contentType: string, expiresInSeconds = 3600): Promise<string> {
  const s3 = getClient()
  const command = new PutObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
}

/**
 * Generate a pre-signed download/stream URL.
 * The browser fetches the video directly from MinIO — no bandwidth through our server.
 */
export async function getStreamUrl(key: string, expiresInSeconds = 86400): Promise<string> {
  const s3 = getClient()
  const command = new GetObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
}

/**
 * Delete a file from MinIO
 */
export async function deleteFile(key: string): Promise<void> {
  const s3 = getClient()
  await s3.send(new DeleteObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: key,
  }))
}

/**
 * Generate the MinIO key for a user's track file.
 * Format: users/{userId}/tracks/{trackId}/{filename}
 */
export function generateKey(userId: string, trackId: string, filename: string): string {
  return `users/${userId}/tracks/${trackId}/${filename}`
}

/**
 * Generate the MinIO key for a thumbnail.
 * Format: users/{userId}/thumbnails/{trackId}.jpg
 */
export function generateThumbnailKey(userId: string, trackId: string): string {
  return `users/${userId}/thumbnails/${trackId}.jpg`
}
