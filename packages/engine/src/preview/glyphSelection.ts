export const BLANK_GLYPH_LUMINANCE_THRESHOLD = 0.9;
export const BLANK_GLYPH_EDGE_THRESHOLD = 0.06;

export function getGlyphCharacters(glyphSet: string) {
  return Array.from(glyphSet);
}

export function findBlankGlyphIndex(glyphSet: string) {
  return getGlyphCharacters(glyphSet).lastIndexOf(' ');
}

export function shouldUseBlankGlyph(
  normalized: number,
  localEdge: number,
  blankGlyphIndex: number
) {
  return (
    blankGlyphIndex >= 0 &&
    normalized >= BLANK_GLYPH_LUMINANCE_THRESHOLD &&
    localEdge <= BLANK_GLYPH_EDGE_THRESHOLD
  );
}
