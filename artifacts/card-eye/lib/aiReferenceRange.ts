type PriceBand = { min: number | null; max: number | null };

type ConditionEstimates = {
  ungradedExcellent?: PriceBand | null;
  ungradedMint?: PriceBand | null;
};

export function beautifulPlusReferenceRange(estimates?: ConditionEstimates | null) {
  const excellent = estimates?.ungradedExcellent;
  const mint = estimates?.ungradedMint;
  if (
    excellent?.min == null || excellent.max == null ||
    mint?.min == null || mint.max == null ||
    excellent.min > excellent.max || mint.min > mint.max ||
    mint.min < excellent.min ||
    mint.max < excellent.max
  ) return null;

  return { min: excellent.min, max: mint.max };
}