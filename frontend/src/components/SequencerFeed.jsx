import { useEffect, useRef, useState } from 'react';
import { SEQUENCER_FEED_WS, GAME_ADDRESS } from '../config';

const MAX_LINES = 60;

/**
 * Terminal-window tail of the sequencer feed, ms-stamped locally.
 * Game txs highlighted in butter.
 */
export default function SequencerFeed() {
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState('connecting');
  const scrollRef = useRef();
  const stickRef = useRef(true);

  useEffect(() => {
    let ws;
    let retry;
    const connect = () => {
      try {
        ws = new WebSocket(SEQUENCER_FEED_WS);
      } catch {
        setStatus('unavailable');
        return;
      }
      ws.onopen = () => setStatus('live');
      ws.onclose = () => {
        setStatus('reconnecting');
        retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        const t = new Date();
        const stamp = `${t.toLocaleTimeString('en-GB')}.${String(t.getMilliseconds()).padStart(3, '0')}`;
        let entries = [];
        try {
          const data = JSON.parse(evt.data);
          const msgs = data.messages ?? [data];
          entries = msgs.map((m) => {
            const raw = JSON.stringify(m);
            const isGame = GAME_ADDRESS !== '0x0000000000000000000000000000000000000000' &&
              raw.toLowerCase().includes(GAME_ADDRESS.slice(2).toLowerCase());
            return {
              stamp,
              seq: m.sequenceNumber ?? '—',
              text: raw.length > 100 ? raw.slice(0, 100) + '…' : raw,
              isGame,
            };
          });
        } catch {
          entries = [{ stamp, seq: '—', text: String(evt.data).slice(0, 100), isGame: false }];
        }
        setLines((prev) => [...prev, ...entries].slice(-MAX_LINES));
      };
    };
    connect();
    return () => { clearTimeout(retry); ws?.close(); };
  }, []);

  // Scroll only the feed's own container — scrollIntoView would also scroll
  // every ancestor, hijacking the page on each message. Follows the tail
  // unless the user has scrolled up to read older lines (stickRef, updated
  // by the container's onScroll).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="bg-soil border-4 border-ink rounded-2xl shadow-chunk-lg overflow-hidden flex flex-col">
      <div className="flex items-center gap-1.5 bg-soil-light px-3.5 py-2.5 border-b-[3px] border-ink">
        <span className="w-[11px] h-[11px] rounded-full border-2 border-ink bg-tomato" />
        <span className="w-[11px] h-[11px] rounded-full border-2 border-ink bg-butter" />
        <span className={`w-[11px] h-[11px] rounded-full border-2 border-ink ${status === 'live' ? 'bg-grass' : 'bg-spud'}`} />
        <span className="ml-2.5 text-[#D9BF95] text-xs font-bold tracking-widest">
          SEQUENCER FEED — {SEQUENCER_FEED_WS.replace('wss://', '')} · {status}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.clientHeight - el.scrollTop < 40;
        }}
        className="p-4 h-64 overflow-y-auto font-mono text-[12.5px] leading-relaxed text-[#EADFC8]"
      >
        {lines.map((l, i) => (
          <div key={i}>
            <span className="text-[#7FA46B]">{l.stamp}</span>{' '}
            <span className="text-[#B98A55]">#{l.seq}</span>{' '}
            <span className={l.isGame ? 'text-butter font-bold' : ''}>{l.text}</span>
          </div>
        ))}
        {lines.length === 0 && <p className="text-[#EADFC8]/40">awaiting sequencer messages…</p>}
      </div>
    </div>
  );
}
