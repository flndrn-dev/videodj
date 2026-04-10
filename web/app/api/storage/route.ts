/**
 * Storage API — handles pre-signed URL generation for MinIO uploads/downloads
 *
 * POST /api/storage — get upload URL (browser uploads directly to MinIO)
 * GET /api/storage?key=xxx — get stream URL (browser streams directly from MinIO)
 */

import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'https://s3.videodj.studio'
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'videodj_admin'
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'v1de0dj_m1n10_s3cure!'
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'videodj-files'

const s3 = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
  forcePathStyle: true,
  // Disable automatic checksum middleware — browser uploads don't compute CRC32
  // and MinIO doesn't strictly require it. Without this, pre-signed URLs include
  // x-amz-checksum-crc32 in the signature and uploads fail with "Bad Request".
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

// Ensure bucket exists on first call
let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  try {
    await s3.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }))
  }
  bucketReady = true
}

// POST — get pre-signed upload URL
export async function POST(req: NextRequest) {
  try {
    const { key, contentType, fileSize } = await req.json()
    if (!key || !contentType) {
      return NextResponse.json({ error: 'key and contentType required' }, { status: 400 })
    }

    // Max file size: 2GB
    if (fileSize && fileSize > 2 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2GB)' }, { status: 400 })
    }

    await ensureBucket()

    const command = new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

    return NextResponse.json({ uploadUrl, key })
  } catch (err) {
    console.error('Storage upload URL error:', err)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }
}

// GET — get pre-signed stream URL
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get('key')
    if (!key) {
      return NextResponse.json({ error: 'key parameter required' }, { status: 400 })
    }

    const command = new GetObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
    })

    const streamUrl = await getSignedUrl(s3, command, { expiresIn: 86400 }) // 24 hours

    return NextResponse.json({ streamUrl })
  } catch (err) {
    console.error('Storage stream URL error:', err)
    return NextResponse.json({ error: 'Failed to generate stream URL' }, { status: 500 })
  }
}
