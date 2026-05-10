import { describe, expect, it } from 'vitest';

import { createAnimatedGifEncoder, encodeAnimatedGif, encodeStaticGif } from './staticGif';

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function includesAscii(bytes: Uint8Array, text: string): boolean {
  return ascii(bytes, 0, bytes.length).includes(text);
}

function findSequence(bytes: Uint8Array, sequence: number[]): number {
  for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
    if (sequence.every((value, offset) => bytes[index + offset] === value)) {
      return index;
    }
  }

  return -1;
}

function countSequence(bytes: Uint8Array, sequence: number[]): number {
  let count = 0;
  for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
    if (sequence.every((value, offset) => bytes[index + offset] === value)) {
      count += 1;
    }
  }
  return count;
}

describe('encodeStaticGif', () => {
  it('encodes a single-frame gif file', () => {
    const gif = encodeStaticGif({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 0, 255, 255
      ])
    });

    expect(ascii(gif, 0, 6)).toBe('GIF89a');
    expect(gif[6]).toBe(2);
    expect(gif[7]).toBe(0);
    expect(gif[8]).toBe(1);
    expect(gif[9]).toBe(0);
    expect(gif[10]).toBe(0xf7);
    expect(includesAscii(gif, 'NETSCAPE2.0')).toBe(true);
    expect(gif.at(-1)).toBe(0x3b);
  });

  it('stores delay metadata and allows disabling loop metadata', () => {
    const gif = encodeStaticGif(
      {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([255, 255, 255, 255])
      },
      {
        delayMs: 1250,
        loop: false
      }
    );

    expect(includesAscii(gif, 'NETSCAPE2.0')).toBe(false);
    expect(findSequence(gif, [0x21, 0xf9, 4, 0, 125, 0, 0, 0])).toBeGreaterThan(-1);
  });

  it('stores a finite loop count when requested', () => {
    const gif = encodeStaticGif(
      {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([255, 255, 255, 255])
      },
      {
        loopCount: 3
      }
    );

    expect(includesAscii(gif, 'NETSCAPE2.0')).toBe(true);
    expect(findSequence(gif, [3, 1, 3, 0, 0])).toBeGreaterThan(-1);
  });

  it('encodes multiple full frames', () => {
    const gif = encodeAnimatedGif([
      {
        width: 1,
        height: 1,
        delayMs: 100,
        data: new Uint8ClampedArray([255, 0, 0, 255])
      },
      {
        width: 1,
        height: 1,
        delayMs: 200,
        data: new Uint8ClampedArray([0, 0, 255, 255])
      }
    ]);

    expect(ascii(gif, 0, 6)).toBe('GIF89a');
    expect(countSequence(gif, [0x2c, 0, 0, 0, 0, 1, 0, 1, 0])).toBe(2);
    expect(findSequence(gif, [0x21, 0xf9, 4, 0, 10, 0, 0, 0])).toBeGreaterThan(-1);
    expect(findSequence(gif, [0x21, 0xf9, 4, 0, 20, 0, 0, 0])).toBeGreaterThan(-1);
  });

  it('streams frames through the encoder', () => {
    const encoder = createAnimatedGifEncoder({
      width: 1,
      height: 1,
      loop: false
    });

    encoder.addFrame({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 255])
    });

    const gif = encoder.finish();
    expect(encoder.frameCount).toBe(1);
    expect(includesAscii(gif, 'NETSCAPE2.0')).toBe(false);
  });

  it('rejects dimensions outside the gif range', () => {
    expect(() =>
      encodeStaticGif({
        width: 0,
        height: 1,
        data: new Uint8ClampedArray()
      })
    ).toThrow(/GIF export size/);
  });

  it('rejects oversized static gif exports before reading pixels', () => {
    expect(() =>
      encodeStaticGif({
        width: 4096,
        height: 4096,
        data: new Uint8ClampedArray()
      })
    ).toThrow(/too large/);
  });
});
