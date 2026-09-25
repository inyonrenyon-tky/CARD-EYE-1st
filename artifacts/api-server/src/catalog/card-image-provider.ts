export type CardImageProviderInput = {
  cardName: string;
  cardNumber: string;
  series: string;
  rarity: string;
};

export type CardImageProviderImage = {
  source: string;
  externalId: string;
  imageUrl: string;
  sourceUrl: string;
  cardName: string;
  collectorNumber: string;
  setCode: string;
  setName: string | null;
  rarity: string;
  rightsInformation: string;
  licenseStatus: string;
  approvedForDisplay: boolean;
};

export type CardImageProviderResult =
  | { status: "matched"; image: CardImageProviderImage }
  | { status: "unmatched" | "ambiguous" | "unavailable" };

/** Provider boundary for verified, licensed remote card-image references. */
export interface CardImageProvider {
  lookup(input: CardImageProviderInput): Promise<CardImageProviderResult>;
}

export type PrimaryCardImage = {
  verified: boolean;
  usableInCardEye: boolean;
  licenseStatus: string;
};

export function isApprovedPrimaryImage(image: PrimaryCardImage | null | undefined): boolean {
  return !!image
    && image.verified
    && image.usableInCardEye
    && ["display_only_authorized_by_card_eye_owner", "display_only_authorized_by_provider"].includes(image.licenseStatus);
}