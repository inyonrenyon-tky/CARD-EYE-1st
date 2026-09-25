import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PHOTO_ERROR = 'カード画像を読み込めませんでした。もう一度撮影してください。';

export class PhotoReadError extends Error {
  constructor(message = PHOTO_ERROR) {
    super(message);
    this.name = 'PhotoReadError';
  }
}

function photoType(uri: string) {
  const path = uri.toLowerCase().split('?')[0];
  if (/\.(heic|heif)$/.test(path)) {
    throw new PhotoReadError('HEIC画像には対応していません。JPEGまたはPNGで撮り直してください。');
  }
  return path.endsWith('.png') ? 'image/png' as const : 'image/jpeg' as const;
}

function checkSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new PhotoReadError();
  if (size > MAX_IMAGE_BYTES) {
    throw new PhotoReadError('画像が5MBを超えています。小さい画像で撮り直してください。');
  }
}

/** Copy the camera's temporary file before leaving the capture screen. */
export async function holdPhoto(uri: string): Promise<string> {
  const mimeType = photoType(uri);
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      if (!response.ok) throw new PhotoReadError();
      checkSize((await response.blob()).size);
      return uri;
    }
    const source = new File(uri);
    if (!source.exists) throw new PhotoReadError();
    const size = source.size;
    checkSize(size);
    const destination = new File(
      Paths.cache,
      `card-eye-scan-${Date.now()}-${Math.random().toString(36).slice(2)}.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
    );
    await source.copy(destination);
    if (!destination.exists || destination.size !== size) throw new PhotoReadError();
    return destination.uri;
  } catch (error) {
    if (error instanceof PhotoReadError) throw error;
    throw new PhotoReadError();
  }
}

export async function readPhoto(uri: string) {
  const mimeType = photoType(uri);
  try {
    if (Platform.OS !== 'web') {
      const file = new File(uri);
      if (!file.exists) throw new PhotoReadError();
      checkSize(file.size);
      const imageBase64 = await file.base64();
      if (!imageBase64) throw new PhotoReadError();
      return { imageBase64, mimeType };
    }
    const response = await fetch(uri);
    if (!response.ok) throw new PhotoReadError();
    const blob = await response.blob();
    checkSize(blob.size);
    const webMimeType = blob.type === 'image/png' ? 'image/png' as const : mimeType;
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result ?? '');
        const comma = result.indexOf(',');
        if (comma < 0) reject(new PhotoReadError());
        else resolve(result.slice(comma + 1));
      };
      reader.onerror = () => reject(new PhotoReadError());
      reader.readAsDataURL(blob);
    });
    if (!imageBase64) throw new PhotoReadError();
    return { imageBase64, mimeType: webMimeType };
  } catch (error) {
    if (error instanceof PhotoReadError) throw error;
    throw new PhotoReadError();
  }
}