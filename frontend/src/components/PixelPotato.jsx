import { useEffect, useRef } from 'react';

/**
 * Hand-mapped pixel-art potato mascot, rendered to canvas.
 * `size` = pixels per sprite cell (4 = logo, 20 = hero mascot).
 */
const SPRITE = [
  '......GG......',
  '.....GG.......',
  '....XXXX......',
  '..XX C  XX....',
  '.X  C     X...',
  '.X         X..',
  'X    B  B   X.',
  'X    B  B   X.',
  'X           X.',
  'X  C        X.',
  'X    BBBB   X.',
  '.X    BB   X..',
  '.X        C X.',
  '..XX      XX..',
  '....XXXXXX....',
  '..............',
];
const PAL = { X: '#221507', B: '#221507', C: '#8C5A2B', G: '#3E8E41', ' ': '#C68B4E' };

export default function PixelPotato({ size = 4, className = '' }) {
  const ref = useRef();
  useEffect(() => {
    const cx = ref.current.getContext('2d');
    SPRITE.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (PAL[ch]) {
          cx.fillStyle = PAL[ch];
          cx.fillRect(x * size, y * size, size, size);
        }
      })
    );
  }, [size]);
  const dim = 14 * size;
  return (
    <canvas
      ref={ref}
      width={dim}
      height={dim}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
