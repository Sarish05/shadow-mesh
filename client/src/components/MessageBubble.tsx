import { useEffect, useRef, useState } from 'react';
import { type ChatMessage } from '../store/chatStore';
import { Play, Pause, Clock, ShieldCheck, Check, CheckCheck } from 'lucide-react';

import { Trash2 } from 'lucide-react';

interface Props { msg: ChatMessage; onDelete?: () => void; }

export default function MessageBubble({ msg, onDelete }: Props) {
  const [playing, setPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!msg.expiresAt) return;
    const update = () => setTimeLeft(Math.max(0, msg.expiresAt - Date.now()));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [msg.expiresAt]);

  function toggleAudio() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }

  const isMine = msg.isMine;

  return (
    <div className={`flex w-full mb-4 group relative ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col gap-1 max-w-[85%] md:max-w-md ${isMine ? 'items-end' : 'items-start'}`}>

        <div className={`relative shadow-sm ${
          msg.contentType === 'text' 
            ? (isMine 
                ? 'rounded-2xl px-4 py-2.5 bg-[var(--primary)] text-white' 
                : 'rounded-2xl px-4 py-2.5 bg-[var(--bg-surface)] text-[var(--text-primary)]')
            : 'bg-transparent p-0'
        }`}>

          {/* Delete Icon */}
          {onDelete && (
            <button
              onClick={onDelete}
              className={`absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-[var(--bg-surface)] shadow-md text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-hover)] opacity-0 group-hover:opacity-100 transition-all z-10 ${
                isMine ? '-left-12' : '-right-12'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Text */}
          {msg.contentType === 'text' && (
            <p className="leading-relaxed whitespace-pre-wrap break-words text-[15px] m-0">
              {msg.text}
            </p>
          )}

          {/* Image */}
          {msg.contentType === 'image' && msg.imageUrl && (
            <div>
               <img
                src={msg.imageUrl}
                alt="decrypted image"
                className="rounded-lg max-w-full max-h-[260px] object-cover"
              />
            </div>
          )}

          {/* Voice */}
          {msg.contentType === 'voice' && msg.audioUrl && (
            <div className="flex items-center gap-3 min-w-[160px]">
              <button
                onClick={toggleAudio}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                  isMine ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-[var(--primary-dim)] hover:bg-[var(--bg-hover)] text-[var(--primary)]'
                }`}
              >
                {playing ? <Pause className="w-4 h-4 ml-0.5" /> : <Play className="w-4 h-4 ml-1" />}
              </button>
              <div className="flex-1 flex gap-0.5 items-center h-8">
                {/* Visualizer bars */}
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full opacity-60 ${isMine ? 'bg-white' : 'bg-[var(--primary)]'}`}
                    style={{
                      height: `${20 + Math.abs(Math.sin(i * 0.9)) * 60}%`,
                      animation: playing ? `pulse-glow ${0.5 + (i % 3) * 0.15}s ease-in-out infinite` : 'none'
                    }}
                  />
                ))}
              </div>
              <audio ref={audioRef} src={msg.audioUrl} onEnded={() => setPlaying(false)} className="hidden" />
            </div>
          )}
        </div>

        {/* Footer row */}
        <div className={`flex items-center gap-2 mt-1 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-[var(--text-muted)] tracking-wide">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          {msg.expiresAt > 0 && timeLeft !== null && (
            <span className={`flex items-center gap-1 text-[10px] font-medium ${
              timeLeft < 10000 ? 'text-[var(--danger)] animate-pulse' : 'text-[var(--text-secondary)]'
            }`}>
              <Clock className="w-2.5 h-2.5" />
              {timeLeft > 0 ? `${Math.ceil(timeLeft / 1000)}s` : '0s'}
            </span>
          )}

          {isMine && (
             <span className="text-[10px] text-[var(--text-muted)]">
             {msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-[var(--primary)]" /> : <Check className="w-3.5 h-3.5" />}
           </span>
          )}

          {!isMine && (
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
               <ShieldCheck className="w-3 h-3 text-[var(--success)]" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}





