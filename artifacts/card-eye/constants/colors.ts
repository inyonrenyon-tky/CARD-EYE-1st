import { designTokens } from './design-tokens';

// Compatibility layer for existing useColors() consumers.
const colors = {
  light: designTokens.colors.light,
  dark: designTokens.colors.dark,
  radius: designTokens.radius.medium,
};

export default colors;