/**
 * Cloud Storage client for videoDJ.Studio
 *
 * Handles video file uploads to MinIO (via pre-signed URLs) and
 * streaming playback (via pre-signed download URLs).
 *
 * Flow:
 * 1. Upload: browser → pre-signed URL → MinIO (direct, no server proxy)
 * 2. Playback: browser → pre-signed URL → MinIO stream (direct)
 * 3. Metadata: saved to PostgreSQL via API routes
 *
 * Falls back to IndexedDB when cloud storage is not configured.
 */

const STORAGE_API = '/api/storage'

/**
 * Check if cloud storage is available (MinIO configured)
 */
export function isCloudStorageEnabled(): boolean {
  return typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_MINIO_ENABLED
}

/**
 * Upload a video file to MinIO via pre-signed URL.
 * Returns the MinIO key for the file.
 */
export async function uploadToCloud(
  file: File,
  userId: string,
  trackId: string,
  onProgress?: (pct: number) => void
): Promise<{ key: string; url: string }> {
  const key = `users/${userId}/tracks/${trackId}/${file.name}`

  // Get pre-signed upload URL from our API
  const res = await fetch(STORAGE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      contentType: file.type || 'video/mp4',
      fileSize: file.size,
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to get upload URL')
  }

  const { uploadUrl } = await res.json()

  // Upload directly to MinIO
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }

    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.send(file)
  })

  return { key, url: uploadUrl.split('?')[0] }
}

/**
 * Get a streaming URL for a track stored in MinIO.
 * Returns a pre-signed URL valid for 24 hours.
 */
export async function getStreamUrl(minioKey: string): Promise<string> {
  const res = await fetch(`${STORAGE_API}?key=${encodeURIComponent(minioKey)}`)
  if (!res.ok) throw new Error('Failed to get stream URL')
  const { streamUrl } = await res.json()
  return streamUrl
}

/**
 * Upload a thumbnail to MinIO.
 */
export async function uploadThumbnail(
  blob: Blob,
  userId: string,
  trackId: string
): Promise<string> {
  const key = `users/${userId}/thumbnails/${trackId}.jpg`

  const res = await fetch(STORAGE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      contentType: 'image/jpeg',
      fileSize: blob.size,
    }),
  })

  if (!res.ok) throw new Error('Failed to get thumbnail upload URL')
  const { uploadUrl } = await res.json()

  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  })

  return key
}
