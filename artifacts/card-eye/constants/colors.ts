/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const palette = {
  // Legacy aliases (kept for backward compatibility)
  text: '#f4f8ff',
  tint: '#3b82f6',

  // CARD EYE's midnight navy surfaces
  background: '#07111f',
  foreground: '#f4f8ff',
  card: '#101d30',
  cardForeground: '#f4f8ff',
  cardElevated: '#152640',

  // Electric blue actions and emerald price movement
  primary: '#3b82f6',
  primaryForeground: '#ffffff',
  secondary: '#172942',
  secondaryForeground: '#d8e7ff',
  muted: '#17263a',
  mutedForeground: '#8fa4c0',
  accent: '#1a3150',
  accentForeground: '#e7f0ff',
  positive: '#40d39a',
  positiveSoft: '#12382f',
  warning: '#f7b955',
  warningSoft: '#3a2c15',
  destructive: '#fb7185',
  destructiveForeground: '#ffffff',
  border: '#203653',
  input: '#203653',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 18,
};

export default colors;
