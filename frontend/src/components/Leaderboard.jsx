import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { GAME_ADDRESS, IS_CONFIGURED } from '../config';
import { gameAbi } from '../abi';

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * All-time winners from RoundSettled logs, kept live via event watcher.
 */
export default function Leaderboard() {
  const client = usePublicClient();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!client || !IS_CONFIGURED) return;
    const tally = new Map();
    const fold = (logs) => {
      for (const log of logs) {
        const { winner, winnerPayout } = log.args;
        const cur = tally.get(winner) ?? { wins: 0, claimed: 0n };
        tally.set(winner, { wins: cur.wins + 1, claimed: cur.claimed + winnerPayout });
      }
      setRows(
        [...tally.entries()]
          .map(([addr, v]) => ({ addr, ...v }))
          .sort((a, b) => (b.claimed > a.claimed ? 1 : -1))
          .slice(0, 10)
      );
    };

    client
      .getContractEvents({
        address: GAME_ADDRESS, abi: gameAbi,
        eventName: 'RoundSettled', fromBlock: 0n,
      })
      .then(fold)
      .catch(() => {});

    const unwatch = client.watchContractEvent({
      address: GAME_ADDRESS, abi: gameAbi,
      eventName: 'RoundSettled', onLogs: fold, pollingInterval: 500,
    });
    return unwatch;
  }, [client]);

  return (
    <div className="bg-white border-4 border-ink rounded-2xl shadow-chunk-lg p-5">
      <div className="micro">Hall of farm — all time</div>
      <table className="w-full border-collapse text-[14.5px] mt-3">
        <thead>
          <tr>
            {['#', 'Farmer', 'Wins', 'Harvested'].map((h) => (
              <th key={h} className="text-left text-[11px] tracking-[.12em] uppercase text-spud-dark px-2 py-1.5 border-b-[3px] border-ink">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.addr} className={i === 0 ? 'bg-butter font-bold' : ''}>
              <td className="px-2 py-2 border-b border-dashed border-ink/25">{i + 1}</td>
              <td className="px-2 py-2 border-b border-dashed border-ink/25 font-mono text-[13.5px]">{short(r.addr)}</td>
              <td className="px-2 py-2 border-b border-dashed border-ink/25">{r.wins}</td>
              <td className="px-2 py-2 border-b border-dashed border-ink/25">
                {Number(formatEther(r.claimed)).toFixed(4)} ETH
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-2 py-4 text-spud-dark/60">no harvests yet — be the first</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
