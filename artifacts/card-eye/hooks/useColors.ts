import colors from '@/constants/colors';
import { designTokens as playfulTokens } from '@/variants/playful/design-tokens';
import { useDesignVariant } from '@/hooks/DesignVariantContext';

/**
 * The original night palette remains the CURRENT appearance. PLAYFUL uses its
 * independent copied cream palette without changing either token source.
 */
export function useColors() {
  const { variant } = useDesignVariant();
  if (variant === 'playful') {
    return { ...playfulTokens.colors.light, radius: playfulTokens.radius.medium };
  }
  return { ...colors.dark, radius: colors.radius };
}
