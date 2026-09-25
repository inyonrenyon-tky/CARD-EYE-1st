const collectorNumberPattern = /(?:^|\s)([A-Z0-9-]{1,12}\/[A-Z0-9-]{1,12})(?:\s|$)/i;

export function getCollectorNumber(value: string | null | undefined): string | null {
  return value?.match(collectorNumberPattern)?.[1] ?? null;
}