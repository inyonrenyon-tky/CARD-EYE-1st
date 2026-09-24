import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export async function readPhoto(uri: string) {
  const path = uri.toLowerCase().split('?')[0];
  if (/\.(heic|heif)$/.test(path)) {
    throw new Error('HEIC画像には対応していません。JPEGまたはPNGで撮り直してください。');
  }
  if (Platform.OS !== 'web') {
    const file = new File(uri);
    if (!file.exists) throw new Error('画像を読み込めませんでした');
    if (file.size > 5 * 1024 * 1024) throw new Error('画像が5MBを超えています。小さい画像で撮り直してください。');
    const base64 = await file.base64();
    const mimeType = path.endsWith('.png') ? 'image/png' as const : 'image/jpeg' as const;
    return { imageBase64: base64, mimeType };
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error('画像を読み込めませんでした');
  const blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024) throw new Error('画像が5MBを超えています。小さい画像で撮り直してください。');
  const mimeType = blob.type === 'image/png' || path.endsWith('.png')
    ? 'image/png' as const
    : 'image/jpeg' as const;
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('画像データを変換できませんでした'));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('画像データを変換できませんでした'));
    reader.readAsDataURL(blob);
  });
  return { imageBase64: base64, mimeType };
}