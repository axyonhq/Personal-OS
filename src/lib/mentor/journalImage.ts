import { heicTo, isHeic } from 'heic-to'

const SUPPORTED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function looksLikeHeic(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  return /\.hei[cf]$/i.test(file.name)
}

export function isJournalImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  // Some desktop browsers omit MIME for iPhone HEIC drops
  return looksLikeHeic(file)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Normalize uploads (incl. iPhone HEIC) to a vision-API-supported image payload. */
export async function prepareJournalImage(
  file: File,
): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }> {
  let blob: Blob = file
  let mediaType = (file.type || '').toLowerCase()

  const heic = looksLikeHeic(file) || (await isHeic(file).catch(() => false))
  if (heic) {
    blob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    })
    mediaType = 'image/jpeg'
  }

  if (!SUPPORTED_MEDIA.has(mediaType)) {
    mediaType = 'image/jpeg'
  }

  return {
    base64: await blobToBase64(blob),
    mediaType: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  }
}
