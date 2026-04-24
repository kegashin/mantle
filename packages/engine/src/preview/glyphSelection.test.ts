import { describe, expect, it } from 'vitest';

import {
  findBlankGlyphIndex,
  shouldUseBlankGlyph
} from './glyphSelection';

describe('glyphSelection', () => {
  it('finds the blank glyph when the charset includes a space', () => {
    expect(findBlankGlyphIndex('@%#*+=-:. ')).toBe(9);
  });

  it('does not force a blank glyph for charsets without spaces', () => {
    expect(findBlankGlyphIndex('#*:.')).toBe(-1);
    expect(shouldUseBlankGlyph(0.95, 0.02, -1)).toBe(false);
  });

  it('suppresses bright low-detail cells into blanks', () => {
    expect(shouldUseBlankGlyph(0.95, 0.02, 9)).toBe(true);
    expect(shouldUseBlankGlyph(0.95, 0.12, 9)).toBe(false);
    expect(shouldUseBlankGlyph(0.82, 0.02, 9)).toBe(false);
  });
});
