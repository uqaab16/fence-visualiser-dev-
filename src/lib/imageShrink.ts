// SR-08: shrink a customer's property photo in the browser before it is stored (keeps Supabase Free storage small).
export const MAX_PHOTO_WIDTH = 1600;
export const PHOTO_JPEG_QUALITY = 0.8;

/** Target size: scale down so the width is at most maxWidth, keep the aspect ratio, never scale up. */
export function computeTargetSize(width: number, height: number, maxWidth = MAX_PHOTO_WIDTH): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return { width: maxWidth, height: Math.max(1, Math.round(height * scale)) };
}

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    // 'from-image' applies the phone's EXIF rotation so portrait photos are not stored sideways
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image could not be decoded'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Returns a JPEG (max 1600px wide, quality 0.8). Throws if the file is not a decodable image. */
export async function shrinkImage(blob: Blob): Promise<Blob> {
  const decoded = await decode(blob);
  try {
    const { width, height } = computeTargetSize(decoded.width, decoded.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.fillStyle = '#ffffff'; // PNG/WebP transparency becomes white instead of black in JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY));
    if (!out) throw new Error('Could not encode JPEG');
    return out;
  } finally {
    decoded.close();
  }
}
