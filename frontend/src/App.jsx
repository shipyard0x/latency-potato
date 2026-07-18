import { useAccount, useConnect, useDisconnect, useReadContracts } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';
import { GAME_ADDRESS, IS_CONFIGURED } from './config';
import { gameAbi } from './abi';
import PixelPotato from './components/PixelPotato';
import Timer from './components/Timer';
import TakeButton from './components/TakeButton';
import SequencerFeed from './components/SequencerFeed';
import Leaderboard from './components/Leaderboard';

const short = (a) =>
  a && a !== '0x0000000000000000000000000000000000000000'
    ? `${a.slice(0, 6)}…${a.slice(-4)}`
    : 'nobody yet';

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const { data } = useReadContracts({
    contracts: [
      { address: GAME_ADDRESS, abi: gameAbi, functionName: 'currentHolder' },
      { address: GAME_ADDRESS, abi: gameAbi, functionName: 'currentPrice' },
      { address: GAME_ADDRESS, abi: gameAbi, functionName: 'roundEndTime' },
      { address: GAME_ADDRESS, abi: gameAbi, functionName: 'jackpotPool' },
      { address: GAME_ADDRESS, abi: gameAbi, functionName: 'potatoPriceNow' },
      { address: GAME_ADDRESS, abi: gameAbi, functionName: 'round' },
    ],
    query: { refetchInterval: 200, enabled: IS_CONFIGURED },
  });

  const [holder, price, endTime, jackpot, potatoPrice, round] =
    (data ?? []).map((r) => r?.result);

  const jackpotFmt = jackpot != null ? Number(formatEther(jackpot)).toFixed(4) : '…';
  const tickerItems = `JACKPOT ${jackpotFmt} ETH ◆ HOLDER ${short(holder)} ◆ ROUND #${round ?? '…'} ◆ BLOCKS EVERY 100MS ◆ `;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ---------------------------------------------- ticker */}
      <div className="bg-ink text-cream overflow-hidden whitespace-nowrap border-b-[3px] border-ink">
        <div className="inline-block py-1.5 text-[13px] font-medium tracking-wider animate-marquee">
          {tickerItems.repeat(4)}
        </div>
      </div>

      {/* ---------------------------------------------- nav */}
      <nav className="w-full max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <PixelPotato size={4} />
          <span className="font-pixel text-sm text-spud-deep leading-relaxed">
            LATENCY<br />POTATO
          </span>
        </div>
        <div className="hidden md:flex gap-7 text-[15px] font-medium text-spud-dark">
          <a href="#play" className="text-ink underline decoration-butter decoration-[3px] underline-offset-4">Play</a>
          <a href="#board" className="hover:text-ink">Leaderboard</a>
          <a href="#how" className="hover:text-ink">How it works</a>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://x.com/LatencyPotato"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Latency Potato on X"
            className="pressable bg-white border-[3px] border-ink rounded-full p-2.5 shadow-chunk hover:bg-cream-dark"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-ink" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
            </svg>
          </a>
          <button
            onClick={() => (isConnected ? disconnect() : connect({ connector: injected() }))}
            className="pressable font-bold text-sm bg-white border-[3px] border-ink rounded-full px-4 py-2 shadow-chunk"
          >
            {isConnected ? short(address) : 'Connect wallet'}
          </button>
        </div>
      </nav>

      {/* ---------------------------------------------- hero */}
      <section id="play" className="w-full max-w-6xl mx-auto px-6 mt-4 grid grid-cols-1 lg:grid-cols-[1.3fr_.9fr] gap-9 items-center">
        <div>
          <div className="micro">Round #{round ?? '…'} · live on Robinhood Chain</div>
          <h1 className="text-4xl md:text-[52px] leading-[1.05] font-bold tracking-tight mt-2">
            Don't hold the bag.<br />
            <span className="bg-butter px-2 rounded-md box-decoration-clone">Hold the potato.</span>
          </h1>
          <p className="text-[17px] text-spud-dark mt-4 mb-5 max-w-[44ch] leading-relaxed">
            Every grab bumps the price 10% and hands the last farmer their money
            back plus 5%. Timer hits zero while you're holding? Half the pot is
            yours. Blocks land every 100ms — first come, first served, no gas wars.
          </p>
          <Timer roundEndTime={endTime} />
          <TakeButton priceEth={price} pricePotato={potatoPrice} />
        </div>

        <div className="relative bg-cream-dark border-4 border-ink rounded-3xl shadow-chunk-xl p-7 rotate-[1.6deg]">
          <span className="absolute -top-4 -right-3 bg-tomato text-white font-bold text-[13px] border-[3px] border-ink rounded-full px-3.5 py-2 rotate-[7deg] shadow-chunk">
            HOT!
          </span>
          <PixelPotato size={20} className="mx-auto" />
          <p className="text-center mt-4 text-[15px] text-spud-dark">
            currently held by <b className="text-ink text-[17px]">{short(holder)}</b>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------- stats strip */}
      <section className="w-full max-w-6xl mx-auto px-6 mt-11">
        <div className="grid grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr] border-4 border-ink rounded-2xl overflow-hidden bg-white shadow-chunk-lg">
          <div className="p-5 md:border-r-[3px] border-ink bg-butter">
            <div className="micro !text-spud-deep">Jackpot pool</div>
            <div className="text-3xl font-bold mt-1">{jackpotFmt} ETH</div>
            <div className="text-[13px] text-spud-deep mt-0.5">50% to the winner · 40% rolls over</div>
          </div>
          <div className="p-5 md:border-r-[3px] border-ink">
            <div className="micro">Round</div>
            <div className="text-3xl font-bold mt-1">#{round ?? '…'}</div>
          </div>
          <div className="p-5 md:border-r-[3px] border-ink">
            <div className="micro">Price</div>
            <div className="text-3xl font-bold mt-1">
              {price != null ? Number(formatEther(price)).toFixed(5) : '…'}
            </div>
            <div className="text-[13px] text-spud-dark mt-0.5">ETH · +10% per grab</div>
          </div>
          <div className="p-5">
            <div className="micro">Block time</div>
            <div className="text-3xl font-bold mt-1">100ms</div>
            <div className="text-[13px] text-spud-dark mt-0.5">FCFS · no priority gas</div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- feed + board */}
      <section id="board" className="w-full max-w-6xl mx-auto px-6 my-10 grid grid-cols-1 lg:grid-cols-[1.15fr_.85fr] gap-6">
        <SequencerFeed />
        <Leaderboard />
      </section>

      {/* ---------------------------------------------- how it works */}
      <section id="how" className="w-full max-w-6xl mx-auto px-6 mb-12">
        <div className="micro">How it works</div>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight mt-1 mb-6">
          Three rules. One potato.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border-4 border-ink rounded-2xl shadow-chunk-lg p-6">
            <div className="font-pixel text-2xl text-spud-deep mb-3">1</div>
            <h3 className="font-bold text-lg mb-2">Grab it</h3>
            <p className="text-[15px] text-spud-dark leading-relaxed">
              Pay the current price to snatch the potato. Every grab bumps the
              price 10% — and the farmer you robbed instantly gets their money
              back <b className="text-ink">plus 5% profit</b>. 3% feeds the
              jackpot, 2% keeps the lights on.
            </p>
          </div>
          <div className="bg-white border-4 border-ink rounded-2xl shadow-chunk-lg p-6">
            <div className="font-pixel text-2xl text-spud-deep mb-3">2</div>
            <h3 className="font-bold text-lg mb-2">Hold it</h3>
            <p className="text-[15px] text-spud-dark leading-relaxed">
              If the round timer hits zero while you're holding,{' '}
              <b className="text-ink">half the jackpot is yours</b>. 40% rolls
              into the next round's pot, 10% goes to the devs. Then the price
              resets and it all starts again.
            </p>
          </div>
          <div className="bg-white border-4 border-ink rounded-2xl shadow-chunk-lg p-6">
            <div className="font-pixel text-2xl text-spud-deep mb-3">3</div>
            <h3 className="font-bold text-lg mb-2">Be fast</h3>
            <p className="text-[15px] text-spud-dark leading-relaxed">
              Blocks land every <b className="text-ink">100ms</b>, first come
              first served — no gas wars, no priority auctions. Pure wire speed.
              Paying with $POTATO is 5% cheaper, and the tokens get burned.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- footer */}
      <footer className="border-t-[3px] border-ink bg-cream-dark mt-auto">
        <div className="w-full max-w-6xl mx-auto px-6 py-5 flex flex-wrap justify-between items-center gap-3 text-[13.5px] text-spud-dark">
          <span>
            Latency Potato · a latency race, not financial advice · game contract{' '}
            <span className="font-mono">{short(GAME_ADDRESS)}</span>
          </span>
          <span className="inline-flex items-center gap-2 bg-white border-2 border-ink rounded-full px-3 py-1 font-bold text-ink">
            <i className="w-2 h-2 rounded-full bg-grass inline-block" />
            Robinhood Chain · 4663
          </span>
        </div>
      </footer>
    </div>
  );
}
