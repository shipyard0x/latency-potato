import { useEffect, useRef, useState } from 'react';

/**
 * Inline countdown chip — ms resolution via requestAnimationFrame,
 * flips tomato-red under 5s.
 */
export default function Timer({ roundEndTime, idle = false }) {
  const [msLeft, setMsLeft] = useState(0);
  const raf = useRef();

  useEffect(() => {
    const end = roundEndTime ? Number(roundEndTime) * 1000 : 0;
    const tick = () => {
      setMsLeft(Math.max(0, end - Date.now()));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [roundEndTime]);

  const mm = String(Math.floor(msLeft / 60000)).padStart(2, '0');
  const ss = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0');
  const ms = String(msLeft % 1000).padStart(3, '0');
  const danger = msLeft > 0 && msLeft < 5000;

  return (
    <div className="inline-flex items-baseline gap-3.5 bg-white border-[3px] border-ink rounded-xl px-5 py-3 shadow-chunk-md mb-5">
      <span className="text-[11px] font-bold tracking-[.12em] text-spud-dark">
        {msLeft === 0 ? (idle ? 'GRAB TO START' : 'ROUND OVER') : 'GOES COLD IN'}
      </span>
      <span
        className={`font-pixel text-2xl md:text-3xl tabular-nums ${danger ? 'text-tomato' : 'text-spud-deep'}`}
      >
        {mm}:{ss}:<span className="text-lg md:text-xl">{ms}</span>
      </span>
    </div>
  );
}
