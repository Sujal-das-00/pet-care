// PawCircle design tokens — warm cream, sage green, pastel peach/lavender/yellow/blue,
// rounded cards and rounded type, per the Kagosuke-style reference screens.
export const colors = {
  bg: '#FDF8F2',
  surface: '#FFFFFF',
  surfaceWarm: '#FFFBF6',
  ink: '#3B2A1E', // headings (warm brown-black)
  inkSoft: '#6E5E52', // body
  inkMute: '#A39587', // captions, inactive icons
  line: '#F1E7DB',

  green: '#3E7D32', // primary actions
  greenDark: '#2F6326',
  greenSoft: '#E6F0DC', // mint/sage surface
  greenTrack: '#E7E2D9',
  greenBar: '#8DB872',

  peach: '#FDEBDD',
  peachInk: '#C4622D',
  orange: '#F08A4B', // paw logo accent
  lavender: '#EDE5F8',
  lavenderInk: '#4B2E83',
  yellow: '#FBF1D3',
  yellowInk: '#8A6A12',
  blue: '#E3F0F8',
  blueInk: '#2F6C95',
  pink: '#FCE4E4',
  danger: '#C9453B',
  gold: '#F2B33D',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, huge: 40 };
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const gutter = 20;

export const shadow = {
  card: {
    shadowColor: '#8A6A4A',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: '#2F6326',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
};

// Nunito (rounded) for Latin text; Japanese glyphs fall back to the system rounded/gothic face.
export const fonts = {
  regular: 'Nunito_500Medium',
  semibold: 'Nunito_700Bold',
  bold: 'Nunito_800ExtraBold',
};

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36, color: colors.ink },
  h1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, color: colors.ink },
  h2: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 26, color: colors.ink },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  tiny: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: colors.inkMute },
  button: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 20, color: '#FFFFFF' },
};
