import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { type ChatMessage } from '../store/chatStore';
import { Play, Pause, Clock, ShieldCheck } from 'lucide-react';

interface Props { msg: ChatMessage; }

export default function MessageBubble({ msg }: Props) {
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
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-1`}
    >
      <div className={`flex flex-col gap-1 max-w-xs ${isMine ? 'items-end' : 'items-start'}`}>
        {/* Sender tag */}
        {!isMine && (
          <span className="font-mono text-[10px] text-emerald-600 px-1 uppercase tracking-wider">
            ◆ INCOMING · E2E VERIFIED
          </span>
        )}

        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-3 text-sm wrap-break-word relative ${
          isMine
            ? 'bg-emerald-900/40 border border-emerald-700/40 text-emerald-100'
            : 'bg-[#0d1117] border border-slate-700/50 text-slate-200'
        }`}>
          {msg.contentType === 'text' && (
            <p className="leading-relaxed">{msg.text}</p>
          )}

          {msg.contentType === 'image' && msg.imageUrl && (
            <div className="space-y-2">
              <div className="font-mono text-[10px] text-emerald-600 uppercase tracking-wider">
                ◆ ENCRYPTED IMAGE · EXIF STRIPPED
              </div>
              <img src={msg.imageUrl} alt="decrypted" className="rounded-lg max-w-55 max-h-55 object-cover border border-emerald-900/30" />
            </div>
          )}

          {msg.contentType === 'voice' && msg.audioUrl && (
            <div className="flex items-center gap-3 min-w-45">
              <button
                onClick={toggleAudio}
                className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center hover:bg-emerald-500/40 transition-colors shrink-0"
              >
                {playing ? <Pause className="w-4 h-4 text-emerald-400" /> : <Play className="w-4 h-4 text-emerald-400" />}
              </button>
              <div className="flex gap-px items-end flex-1">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-0.5 rounded-full transition-colors ${playing ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-800'}`}
                    style={{ height: `${5 + Math.abs(Math.sin(i * 0.8)) * 14}px` }}
                  />
                ))}
              </div>
              <audio ref={audioRef} src={msg.audioUrl} onEnded={() => setPlaying(false)} className="hidden" />
            </div>
          )}
        </div>

        {/* Meta */}
        <div className={`flex items-center gap-2 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
          <ShieldCheck className="w-3 h-3 text-emerald-700" />
          <span className="font-mono text-[10px] text-slate-600">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {msg.expiresAt > 0 && timeLeft !== null && (
            <span className={`flex items-center gap-1 font-mono text-[10px] ${timeLeft < 10000 ? 'text-red-500' : 'text-amber-600'}`}>
              <Clock className="w-3 h-3" />
              {timeLeft > 0 ? `${Math.ceil(timeLeft / 1000)}s` : 'WIPED'}
            </span>
          )}
          {isMine && (
            <span className="font-mono text-[10px] text-emerald-800">AES-256-GCM ✓</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
