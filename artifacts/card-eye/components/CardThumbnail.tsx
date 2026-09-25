import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { customFetch } from '@workspace/api-client-react';
import type { CardRecord } from '@/constants/mock-data';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/constants/design-tokens';
import { CardImageViewer } from '@/components/CardImageViewer';

export type CardImageIdentity = {
  name: string;
  series: string;
  number: string;
  rarity: string;
  cardId?: string | null;
};

type CatalogImageResponse = {
  card: {
    id: string;
    name: string;
    number: string;
    series: string;
    rarity: string;
    imageUrl: string | null;
  };
};

type RepresentativeImageResponse = {
  cardId: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  status: 'matched' | 'representative' | 'unmatched' | 'ambiguous' | 'unavailable';
};

type CardThumbnailProps = {
  card: CardImageIdentity;
  compact?: boolean;
  tone?: CardRecord['tone'];
  /** A photo may only be supplied by the screen that owns this active scan. */
  scanImageUri?: string | null;
  scanId?: string | null;
  /** Approved catalog/featured image URL returned by the API. */
  imageUrl?: string | null;
};

function resolveIdentity(card: CardImageIdentity) {
  const number = card.number.normalize('NFKC').trim();
  const embeddedSeries = /^([a-z0-9]{2,8})\s+(.+)$/i.exec(number);
  return {
    cardName: card.name.trim(),
    series: card.series.trim() || embeddedSeries?.[1] || '',
    cardNumber: embeddedSeries?.[2]?.trim() || number,
    rarity: card.rarity.trim(),
    cardId: card.cardId ?? null,
  };
}

function isCardImageUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function useCardRepresentativeImage(
  card: CardImageIdentity,
  resolutionOwnerId?: string | null,
  approvedImageUrl?: string | null,
) {
  const identity = resolveIdentity(card);
  const enabled = Boolean(identity.cardName);

  return useQuery({
    queryKey: [
      'representative-card-image',
      identity.cardId,
      identity.cardName,
      identity.series,
      identity.cardNumber,
      identity.rarity,
      resolutionOwnerId ?? null,
    ],
    queryFn: () => customFetch<RepresentativeImageResponse>('/api/cards/representative-image', {
      method: 'POST',
      body: JSON.stringify(identity),
    }),
    enabled: enabled && !isCardImageUrl(approvedImageUrl),
    staleTime: (query) => query.state.data?.status === 'matched' || query.state.data?.status === 'representative'
      ? 24 * 60 * 60 * 1000
      : query.state.data?.status === 'unavailable'
        ? 0
        : 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function CardThumbnail({
  card,
  compact = false,
  scanImageUri,
  scanId,
  imageUrl,
}: CardThumbnailProps) {
  const colors = useColors();
  const approvedImageUrl = isCardImageUrl(imageUrl) ? imageUrl : null;
  const normalizedIdentity = resolveIdentity(card);
  const catalogQuery = useQuery({
    queryKey: ['catalog-card-image', normalizedIdentity.cardId],
    queryFn: () => customFetch<CatalogImageResponse>(
      `/api/cards/catalog/${encodeURIComponent(normalizedIdentity.cardId!)}`,
    ),
    enabled: imageUrl === undefined && !approvedImageUrl && !!normalizedIdentity.cardId && /^[a-f0-9-]{36}$/i.test(normalizedIdentity.cardId),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const catalogImageUrl = isCardImageUrl(catalogQuery.data?.card.imageUrl)
    ? catalogQuery.data.card.imageUrl
    : null;
  const catalogOrProvidedImage = approvedImageUrl ?? catalogImageUrl;
  const imageQuery = useCardRepresentativeImage(card, scanId, catalogOrProvidedImage);
  const representativeImage = catalogOrProvidedImage
    ?? ((imageQuery.data?.status === 'matched' || imageQuery.data?.status === 'representative') && isCardImageUrl(imageQuery.data.imageUrl)
      ? imageQuery.data.imageUrl
      : null);
  const personalScanImage = scanId && scanImageUri ? scanImageUri : null;
  const [failedRepresentativeImage, setFailedRepresentativeImage] = useState<string | null>(null);
  const [failedScanImage, setFailedScanImage] = useState<string | null>(null);
  const [viewingUri, setViewingUri] = useState<string | null>(null);
  const activeRepresentativeImage = representativeImage === failedRepresentativeImage ? null : representativeImage;
  const activeScanImage = personalScanImage === failedScanImage ? null : personalScanImage;
  const showScanFirst = imageQuery.data?.status === 'representative' && !!activeScanImage && !catalogOrProvidedImage;
  const displayingScan = showScanFirst || (!activeRepresentativeImage && !!activeScanImage);
  const displayedUri = displayingScan ? activeScanImage : activeRepresentativeImage;

  return (
    <View
      accessible={!displayedUri}
      accessibilityLabel={displayedUri ? undefined : `${card.name}のカード画像`}
      style={[styles.frame, compact && styles.compactFrame, { backgroundColor: colors.cardElevated }]}
    >
      {displayedUri ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${card.name}の画像を拡大`}
          testID="open-card-image"
          onPress={(event) => {
            event.stopPropagation();
            setViewingUri(displayedUri);
          }}
          style={styles.imagePress}
        >
          <CardImage
            name={card.name}
            uri={displayedUri}
            compact={compact}
            scanImage={displayingScan}
            onError={() => displayingScan
              ? setFailedScanImage(displayedUri)
              : setFailedRepresentativeImage(displayedUri)}
          />
        </Pressable>
      ) : (
        <CardImage name={card.name} compact={compact} />
      )}
      {viewingUri ? <CardImageViewer name={card.name} uri={viewingUri} onClose={() => setViewingUri(null)} /> : null}
    </View>
  );
}

export function CardImage({
  name,
  uri,
  compact = false,
  scanImage = false,
  onError,
}: {
  name: string;
  uri?: string | null;
  compact?: boolean;
  scanImage?: boolean;
  onError?: () => void;
}) {
  const colors = useColors();
  if (uri) {
    return (
      <Image
        accessibilityLabel={`${name}の${scanImage ? '撮影' : '代表'}画像`}
        source={{ uri }}
        resizeMode="contain"
        style={styles.image}
        onError={onError}
      />
    );
  }
  return (
    <View style={[styles.placeholder, { backgroundColor: colors.cardElevated }]}>
      <Feather name="image" size={compact ? 17 : 28} color={colors.mutedForeground} />
      {!compact ? (
        <Text numberOfLines={2} style={[styles.placeholderText, { color: colors.mutedForeground }]}>
          {name}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 0.72,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: designTokens.radius.medium,
  },
  compactFrame: {
    borderRadius: designTokens.radius.small,
    height: '100%',
    aspectRatio: undefined,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePress: { width: '100%', height: '100%' },
  placeholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 },
  placeholderText: { fontSize: 11, textAlign: 'center' },
});