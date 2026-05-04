import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ArrowRight, RotateCcw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '../lib/utils';

interface ScoreModalProps {
  score: number;
  cleared: boolean;
  round: number;
  totalRounds: number;
  onNext: () => void;
  onRestartRound: () => void;
  onQuit: () => void;
  isGameOver?: boolean;
}

export const ScoreModal = ({ 
  score, 
  cleared, 
  round, 
  totalRounds, 
  onNext, 
  onRestartRound,
  onQuit, 
  isGameOver = false 
}: ScoreModalProps) => {
  const [countdown, setCountdown] = useState(15);
  const [showShare, setShowShare] = useState(false);
  const roomUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?join=${Math.random().toString(36).substring(7)}` : '';

  useEffect(() => {
    if (isGameOver || showShare) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isGameOver, onNext, showShare]);

  const copyLink = () => {
    navigator.clipboard.writeText(roomUrl);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6"
    >
      <div className="absolute inset-0 bg-[#030303]/90 backdrop-blur-3xl" />
      
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[40rem] h-[40rem] bg-blue-500/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[40rem] h-[40rem] bg-pink-500/10 blur-[150px] rounded-full animate-pulse delay-1000" />
      </div>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-xl glass-card rounded-[3rem] md:rounded-[4rem] border-white/5 p-8 md:p-12 flex flex-col items-center overflow-hidden"
      >
          {/* Top Glow Overlay */}
          <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />
          
          <div className="relative mb-8 text-center">
            <motion.div 
              animate={{ rotateY: [0, 180, 360] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(59,130,246,0.3)]"
            >
               <Trophy className="w-10 h-10 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            </motion.div>
            
            <h2 className="text-4xl md:text-6xl font-display italic tracking-tighter uppercase text-white mb-2 leading-none">
              {isGameOver ? 'VICTORY ARCHIVE' : 'HOLE SECURED'}
            </h2>
            <div className="flex items-center justify-center gap-3">
              <span className="h-px w-6 bg-white/10" />
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em]">
                {isGameOver ? 'TERMINAL MASTER' : `PHASE ${round} OFFLINE`}
              </span>
              <span className="h-px w-6 bg-white/10" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-8">
            {/* Score Display */}
            <div className="bg-white/5 border border-white/10 rounded-[2rem] p-6 text-center relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-[10px] font-black text-blue-400/40 uppercase tracking-widest mb-1">TOTAL CREDITS</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-4xl md:text-5xl font-display text-white italic tracking-tighter text-glow">
                    {score.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Display */}
            <div className="bg-white/5 border border-white/10 rounded-[2rem] p-6 text-center relative overflow-hidden">
               <p className="text-[10px] font-black text-blue-400/40 uppercase tracking-widest mb-1">RANK STATUS</p>
               <span className={cn(
                 "text-2xl md:text-3xl font-display italic tracking-tighter uppercase",
                 cleared ? "text-cyan-400" : "text-pink-500"
               )}>
                 {cleared ? 'ELITE SYNC' : 'LINK PARTIAL'}
               </span>
            </div>
          </div>

          {/* Actions */}
          <div className="w-full flex flex-col gap-3">
            <button 
              onClick={onNext}
              className="group relative w-full h-16 md:h-20 bg-blue-600 hover:bg-blue-500 rounded-2xl md:rounded-[2rem] flex items-center justify-between px-8 md:px-10 transition-all active:scale-[0.98] overflow-hidden shadow-[0_10px_30px_rgba(59,130,246,0.3)]"
            >
              <div className="relative z-10 flex flex-col items-start">
                <span className="text-[8px] md:text-[10px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">PHASE STEP</span>
                <span className="text-lg md:text-2xl font-display text-white uppercase tracking-tighter italic">
                  {isGameOver ? 'SECURE STANDINGS' : 'NEXT TEE INITIALIZE'}
                </span>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white/20 rounded-xl flex items-center justify-center text-white relative z-10">
                <ArrowRight className="w-5 h-5 md:w-6 md:h-6 group-hover:translate-x-1 transition-transform" />
              </div>
              
              {!isGameOver && !showShare && (
                <div className="absolute bottom-0 left-0 h-1 bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${(countdown / 15) * 100}%` }} />
              )}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={onRestartRound}
                className="h-12 md:h-14 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl md:rounded-2xl flex items-center justify-center gap-3 transition-all group active:scale-95"
              >
                <RotateCcw className="w-4 h-4 text-white group-hover:rotate-[-90deg] transition-transform" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest hidden sm:block">REBOOT PHASE</span>
                <span className="text-[10px] font-black text-white uppercase tracking-widest sm:hidden">REBOOT</span>
              </button>
              
              <button 
                onClick={onQuit}
                className="h-12 md:h-14 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 rounded-xl md:rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <span className="text-[10px] font-black text-pink-500 uppercase tracking-widest">DISCONNECT</span>
              </button>
            </div>
          </div>

          {!isGameOver && !showShare && (
            <p className="mt-6 text-[10px] font-black text-blue-400/40 uppercase tracking-[0.4em] animate-pulse">
              SYNCING IN <span className="text-white">{countdown}S</span>
            </p>
          )}

          {/* Social Link */}
          <div className="mt-8 pt-6 border-t border-white/5 w-full">
            <button 
              onClick={() => setShowShare(!showShare)}
              className="mx-auto flex items-center gap-3 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all text-white/60 text-[10px] font-black uppercase tracking-widest"
            >
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
              <span>LINK TERMINAL</span>
            </button>

            <AnimatePresence>
              {showShare && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 p-6 bg-white/[0.02] border border-white/5 rounded-[2rem] flex flex-col items-center">
                    <div className="p-3 bg-white rounded-xl mb-6 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                      <QRCodeSVG value={roomUrl} size={140} level="M" />
                    </div>
                    <div className="flex gap-2 w-full">
                      <div className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-[10px] font-mono text-slate-400 truncate">
                        {roomUrl}
                      </div>
                      <button 
                        onClick={copyLink}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase rounded-lg transition-all"
                      >
                        COPY
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
      </motion.div>
    </motion.div>
  );
};
