/**
 * Prepares a photo for upload in the browser: applies EXIF orientation, crops (optional),
 * resizes, and re-encodes as JPEG. Re-encoding through a canvas drops all metadata,
 * including GPS location. The server strips metadata again as a second safeguard.
 */
export async function prepareImage(file: File, maxSize: number, crop: 'square' | 'free'): Promise<Blob> {
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is too large. Use one under 25 MB.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('We couldn’t read that image. Try a JPEG or PNG.');
  }
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (crop === 'square') { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
  if (!blob) throw new Error('We couldn’t process that image.');
  if (blob.size > 5 * 1024 * 1024) throw new Error('That image is still too large after resizing.');
  return blob;
}
