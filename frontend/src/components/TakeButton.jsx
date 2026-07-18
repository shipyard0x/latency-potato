import { useState } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { formatEther, maxUint256 } from 'viem';
import { GAME_ADDRESS, TOKEN_ADDRESS, IS_CONFIGURED } from '../config';
import { gameAbi, erc20Abi } from '../abi';

export default function TakeButton({ priceEth, pricePotato }) {
  const [payWith, setPayWith] = useState('ETH');
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const { data: allowance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', GAME_ADDRESS],
    query: { enabled: IS_CONFIGURED && !!address && payWith === 'POTATO', refetchInterval: 1000 },
  });

  const needsApproval =
    payWith === 'POTATO' && pricePotato != null && (allowance ?? 0n) < pricePotato;

  const nextPrice = priceEth != null ? (priceEth * 110n) / 100n : null;
  const refund = priceEth != null ? (priceEth * 105n) / 100n : null;
  const fmt = (v, d = 5) => (v != null ? Number(formatEther(v)).toFixed(d) : '…');

  const fire = () => {
    if (needsApproval) {
      writeContract({
        address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'approve',
        args: [GAME_ADDRESS, maxUint256],
      });
    } else if (payWith === 'ETH') {
      writeContract({
        address: GAME_ADDRESS, abi: gameAbi, functionName: 'takePotato',
        value: priceEth, gas: 300000n,
      });
    } else {
      writeContract({
        address: GAME_ADDRESS, abi: gameAbi, functionName: 'takePotatoWithToken',
        gas: 300000n,
      });
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={fire}
          disabled={!isConnected || isPending}
          className="font-pixel text-sm md:text-base bg-butter text-ink border-4 border-ink
                     rounded-2xl px-7 py-5 shadow-chunk-lg hover:bg-butter-dark
                     transition active:translate-x-1.5 active:translate-y-1.5 active:shadow-none
                     disabled:opacity-40"
        >
          {isPending ? 'IN FLIGHT…' : needsApproval ? 'APPROVE $POTATO' : 'GRAB THE POTATO'}
        </button>
        <div className="text-[15px]">
          <b className="text-lg">
            {payWith === 'ETH'
              ? `${fmt(priceEth)} ETH`
              : `${pricePotato != null ? Number(formatEther(pricePotato)).toLocaleString() : '…'} $POTATO`}
          </b>
          <br />
          <span className="text-spud-dark">
            {payWith === 'ETH'
              ? `next price ${fmt(nextPrice)} · you get back ${fmt(refund)}`
              : 'tokens are burned · 5% cheaper than ETH'}
          </span>
        </div>
      </div>

      <div className="inline-flex border-[3px] border-ink rounded-full overflow-hidden bg-white text-[13px] font-bold mt-4">
        {['ETH', 'POTATO'].map((m) => (
          <button
            key={m}
            onClick={() => setPayWith(m)}
            className={`px-4 py-2 ${payWith === m ? 'bg-grass' : 'text-spud-dark hover:bg-cream-dark'}`}
          >
            {m === 'ETH' ? 'Pay with ETH' : 'Pay with $POTATO −5%'}
          </button>
        ))}
      </div>
    </div>
  );
}
