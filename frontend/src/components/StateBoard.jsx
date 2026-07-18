import { formatEther } from 'viem';

const short = (a) => (a && a !== '0x0000000000000000000000000000000000000000'
  ? `${a.slice(0, 6)}…${a.slice(-4)}`
  : 'nobody yet 👀');

export default function StateBoard({ holder, price, jackpot, you }) {
  const youHold = you && holder && you.toLowerCase() === holder.toLowerCase();
  return (
    <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* Current holder */}
      <div className="card text-center">
        <p className="pixel-label mb-2">👑 POTATO HOLDER</p>
        <p className="font-body text-3xl text-ink">
          <span className="animate-blink inline-block mr-1">👑</span>
          {short(holder)}
        </p>
        {youHold && (
          <p className="font-pixel text-[9px] text-grass-dark mt-1">THAT'S YOU! HANG ON!</p>
        )}
      </div>

      {/* Snipe price */}
      <div className="card text-center bg-cream-dark">
        <p className="pixel-label mb-2">🏷️ PRICE TO STEAL IT</p>
        <p className="font-body text-3xl text-spud-deep font-bold">
          {price != null ? `${Number(formatEther(price)).toFixed(5)} ETH` : '…'}
        </p>
        <p className="font-body text-lg text-spud-dark">+10% each grab · last farmer pockets +5%</p>
      </div>

      {/* Jackpot */}
      <div className="card text-center bg-butter shadow-chunk-lg">
        <p className="font-pixel text-[10px] text-spud-deep mb-2">💰 MASHED POT</p>
        <p className="font-body text-4xl text-ink font-bold">
          {jackpot != null ? `${Number(formatEther(jackpot)).toFixed(4)} ETH` : '…'}
        </p>
        <p className="font-body text-lg text-spud-deep">half goes to the last spud standing</p>
      </div>
    </div>
  );
}
