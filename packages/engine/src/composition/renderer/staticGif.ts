type StaticGifImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type AnimatedGifFrame = StaticGifImageData & {
  delayMs?: number | undefined;
};

export type StaticGifOptions = {
  delayMs?: number | undefined;
  loop?: boolean | undefined;
  loopCount?: number | undefined;
};

export type AnimatedGifOptions = StaticGifOptions;

export type AnimatedGifEncoder = {
  readonly frameCount: number;
  addFrame: (imageData: StaticGifImageData, options?: Pick<AnimatedGifFrame, 'delayMs'>) => void;
  finish: () => Uint8Array;
};

const GIF_HEADER = 'GIF89a';
const GIF_TRAILER = 0x3b;
const GIF_IMAGE_SEPARATOR = 0x2c;
const GIF_EXTENSION = 0x21;
const GIF_APPLICATION_EXTENSION = 0xff;
const GIF_GRAPHIC_CONTROL = 0xf9;
const GIF_COLOR_TABLE_SIZE = 256;
const GIF_LZW_MIN_CODE_SIZE = 8;
const GIF_CLEAR_CODE = 1 << GIF_LZW_MIN_CODE_SIZE;
const GIF_END_CODE = GIF_CLEAR_CODE + 1;
const GIF_FIRST_FREE_CODE = GIF_END_CODE + 1;
const GIF_MAX_CODE = 4095;
const GIF_DICTIONARY_KEY_SHIFT = 8;

export const MAX_STATIC_GIF_PIXELS = 12_000_000;
export const MAX_ANIMATED_GIF_PIXELS = 2_500_000;

function writeAscii(bytes: number[], text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    bytes.push(text.charCodeAt(index));
  }
}

function writeUint16(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >> 8) & 0xff);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function delayCentiseconds(delayMs: number | undefined): number {
  if (delayMs == null || !Number.isFinite(delayMs)) return 300;
  return clampInteger(delayMs / 10, 1, 65535);
}

function paletteColor(level: number, max: number): number {
  return Math.round((level / max) * 255);
}

function createUniformPalette(): Uint8Array {
  const palette = new Uint8Array(GIF_COLOR_TABLE_SIZE * 3);

  for (let red = 0; red < 8; red += 1) {
    for (let green = 0; green < 8; green += 1) {
      for (let blue = 0; blue < 4; blue += 1) {
        const index = (red << 5) | (green << 2) | blue;
        const offset = index * 3;
        palette[offset] = paletteColor(red, 7);
        palette[offset + 1] = paletteColor(green, 7);
        palette[offset + 2] = paletteColor(blue, 3);
      }
    }
  }

  return palette;
}

function rgbaToPaletteIndex(
  data: Uint8ClampedArray,
  offset: number
): number {
  const alpha = data[offset + 3]! / 255;
  const red = Math.round(data[offset]! * alpha + 255 * (1 - alpha));
  const green = Math.round(data[offset + 1]! * alpha + 255 * (1 - alpha));
  const blue = Math.round(data[offset + 2]! * alpha + 255 * (1 - alpha));

  return ((red >> 5) << 5) | ((green >> 5) << 2) | (blue >> 6);
}

function indexPixels(imageData: StaticGifImageData): Uint8Array {
  const pixelCount = imageData.width * imageData.height;
  const indexed = new Uint8Array(pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    indexed[pixel] = rgbaToPaletteIndex(imageData.data, pixel * 4);
  }

  return indexed;
}

function encodeLzw(indices: Uint8Array): Uint8Array {
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = GIF_LZW_MIN_CODE_SIZE + 1;
  let nextCode = GIF_FIRST_FREE_CODE;
  const dictionary = new Map<number, number>();

  const writeCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;

    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  const resetDictionary = () => {
    dictionary.clear();
    codeSize = GIF_LZW_MIN_CODE_SIZE + 1;
    nextCode = GIF_FIRST_FREE_CODE;
  };

  writeCode(GIF_CLEAR_CODE);

  let prefix = indices[0]!;
  for (let index = 1; index < indices.length; index += 1) {
    const suffix = indices[index]!;
    const candidate = (prefix << GIF_DICTIONARY_KEY_SHIFT) | suffix;
    const candidateCode = dictionary.get(candidate);

    if (candidateCode != null) {
      prefix = candidateCode;
      continue;
    }

    writeCode(prefix);

    if (nextCode <= GIF_MAX_CODE) {
      dictionary.set(candidate, nextCode);
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) {
        codeSize += 1;
      }
    } else {
      writeCode(GIF_CLEAR_CODE);
      resetDictionary();
    }

    prefix = suffix;
  }

  writeCode(prefix);
  writeCode(GIF_END_CODE);

  if (bitCount > 0) {
    bytes.push(bitBuffer & 0xff);
  }

  return Uint8Array.from(bytes);
}

function writeDataSubBlocks(bytes: number[], data: Uint8Array): void {
  for (let offset = 0; offset < data.length; offset += 255) {
    const chunk = data.subarray(offset, offset + 255);
    bytes.push(chunk.length, ...chunk);
  }
  bytes.push(0);
}

function writeNetscapeLoopExtension(bytes: number[], loopCount = 0): void {
  bytes.push(GIF_EXTENSION, GIF_APPLICATION_EXTENSION, 11);
  writeAscii(bytes, 'NETSCAPE2.0');
  bytes.push(3, 1);
  writeUint16(bytes, clampInteger(loopCount, 0, 65535));
  bytes.push(0);
}

export function encodeStaticGif(
  imageData: StaticGifImageData,
  options: StaticGifOptions = {}
): Uint8Array {
  const { width, height, data } = imageData;
  if (width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new Error('GIF export size is outside the supported 1-65535px range.');
  }
  if (width * height > MAX_STATIC_GIF_PIXELS) {
    throw new Error(
      `GIF export is too large. Keep static GIF exports under ${MAX_STATIC_GIF_PIXELS.toLocaleString('en-US')} pixels by lowering scale or canvas size.`
    );
  }
  if (data.length < width * height * 4) {
    throw new Error('GIF export received incomplete image data.');
  }

  const encoder = createAnimatedGifEncoder({
    width,
    height,
    loop: options.loop,
    loopCount: options.loopCount
  });
  encoder.addFrame({ width, height, data }, { delayMs: options.delayMs });
  return encoder.finish();
}

function writeGifFrame(
  bytes: number[],
  imageData: StaticGifImageData,
  delayMs: number | undefined
): void {
  const { width, height } = imageData;
  const indices = indexPixels(imageData);
  const lzwData = encodeLzw(indices);

  bytes.push(GIF_EXTENSION, GIF_GRAPHIC_CONTROL, 4, 0);
  writeUint16(bytes, delayCentiseconds(delayMs));
  bytes.push(0, 0);
  bytes.push(GIF_IMAGE_SEPARATOR);
  writeUint16(bytes, 0);
  writeUint16(bytes, 0);
  writeUint16(bytes, width);
  writeUint16(bytes, height);
  bytes.push(0);
  bytes.push(GIF_LZW_MIN_CODE_SIZE);
  writeDataSubBlocks(bytes, lzwData);
}

export function createAnimatedGifEncoder(
  options: AnimatedGifOptions & Pick<StaticGifImageData, 'width' | 'height'>
): AnimatedGifEncoder {
  const { width, height } = options;
  if (width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new Error('GIF export size is outside the supported 1-65535px range.');
  }

  let frameCount = 0;
  let closed = false;
  const bytes: number[] = [];
  const palette = createUniformPalette();

  writeAscii(bytes, GIF_HEADER);
  writeUint16(bytes, width);
  writeUint16(bytes, height);
  bytes.push(0xf7, 0, 0);
  bytes.push(...palette);

  if (options.loop ?? true) {
    writeNetscapeLoopExtension(bytes, options.loopCount);
  }

  return {
    get frameCount() {
      return frameCount;
    },
    addFrame(imageData, frameOptions = {}) {
      if (closed) {
        throw new Error('GIF encoder is already closed.');
      }
      if (imageData.width !== width || imageData.height !== height) {
        throw new Error('Animated GIF frames must share the same dimensions.');
      }
      if (imageData.data.length < width * height * 4) {
        throw new Error('GIF export received incomplete image data.');
      }

      writeGifFrame(bytes, imageData, frameOptions.delayMs ?? options.delayMs);
      frameCount += 1;
    },
    finish() {
      if (closed) {
        return Uint8Array.from(bytes);
      }
      if (frameCount < 1) {
        throw new Error('Animated GIF export needs at least one frame.');
      }

      bytes.push(GIF_TRAILER);
      closed = true;
      return Uint8Array.from(bytes);
    }
  };
}

export function encodeAnimatedGif(
  frames: readonly AnimatedGifFrame[],
  options: AnimatedGifOptions = {}
): Uint8Array {
  const firstFrame = frames[0];
  if (!firstFrame) {
    throw new Error('Animated GIF export needs at least one frame.');
  }
  if (firstFrame.width * firstFrame.height > MAX_ANIMATED_GIF_PIXELS) {
    throw new Error(
      `GIF export is too large. Keep animated GIF exports under ${MAX_ANIMATED_GIF_PIXELS.toLocaleString('en-US')} pixels by lowering scale or canvas size.`
    );
  }

  const encoder = createAnimatedGifEncoder({
    width: firstFrame.width,
    height: firstFrame.height,
    loop: options.loop,
    loopCount: options.loopCount,
    delayMs: options.delayMs
  });

  for (const frame of frames) {
    encoder.addFrame(frame, { delayMs: frame.delayMs });
  }

  return encoder.finish();
}
