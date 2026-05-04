import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, Globe, Medal, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { PLAYER_COLORS } from '../constants';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

interface RankingsProps {
  onBack: () => void;
  currentScore?: number;
}

export const Rankings = ({ onBack, currentScore }: RankingsProps) => {
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'leaderboard'),
      orderBy('score', 'desc'),
      limit(10)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setRankings(docs);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'leaderboard'));

    return unsub;
  }, []);

  return (
    <div className="w-full max-w-4xl min-h-screen md:min-h-0 md:h-[80vh] bg-[#030303] md:glass-card md:rounded-[3rem] md:border-2 border-white/5 flex flex-col relative overflow-hidden p-6 md:p-12 font-sans mx-auto shadow-[0_0_100px_rgba(59,130,246,0.1)]">
      {/* Background Ambience */}
      <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15)_0%,transparent_70%)] pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full">
        <div className="w-full flex items-center justify-between mb-8 md:mb-12">
          <button 
            onClick={onBack}
            className="flex items-center gap-3 text-slate-400 hover:text-white transition-all group"
          >
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 group-hover:border-blue-500/50 group-hover:bg-blue-500/10 transition-all">
              <ArrowLeft size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] hidden sm:block">Back</span>
          </button>
          
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">Global Terminal</span>
            <span className="text-3xl md:text-5xl font-display text-white italic tracking-tighter leading-none">LEADERBOARD</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
          {loading ? (
            <div className="flex flex-col items-center py-24 opacity-40">
               <Globe className="w-10 h-10 animate-spin mb-4 text-blue-500" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Syncing Data Streams...</span>
            </div>
          ) : rankings.map((rank, idx) => (
            <motion.div 
              key={rank.id}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                "flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-[2rem] border transition-all relative overflow-hidden group",
                idx === 0 
                  ? "bg-blue-500/10 border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.1)]" 
                  : "bg-white/2 border-white/5 hover:border-white/20 hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-4 md:gap-6">
                <div className={cn(
                   "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center font-display italic text-lg md:text-xl",
                   idx === 0 ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]" : 
                   idx === 1 ? "bg-slate-300 text-slate-950" : 
                   idx === 2 ? "bg-amber-600 text-white" : 
                   "bg-white/5 text-slate-500"
                )}>
                  {idx + 1}
                </div>
                
                <div className="relative group-hover:scale-110 transition-transform">
                   <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-xl md:text-2xl" style={{ backgroundColor: rank.color || PLAYER_COLORS[idx % PLAYER_COLORS.length] + '44', border: `2px solid ${rank.color || PLAYER_COLORS[idx % PLAYER_COLORS.length]}` }}>
                      {idx === 0 ? '👑' : idx < 3 ? '🎖️' : '👤'}
                   </div>
                   {idx < 3 && (
                     <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-[10px] text-black font-black">
                        {idx === 0 ? '!' : '#'}
                     </div>
                   )}
                </div>
                
                <div className="flex flex-col">
                   <span className={cn("font-bold tracking-tight text-sm md:text-lg", idx === 0 ? "text-blue-400" : "text-white")}>
                     {rank.name || 'ANONYMOUS'}
                   </span>
                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Phase: 10/10</span>
                </div>
              </div>
              
              <div className="flex flex-col items-end">
                 <span className={cn(
                   "text-xl md:text-3xl font-display italic tabular-nums leading-none tracking-tighter",
                   idx === 0 ? "text-blue-400 text-glow" : "text-white"
                 )}>
                   {rank.score.toLocaleString()}
                 </span>
                 <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Credits</span>
              </div>
            </motion.div>
          ))}
          
          {!loading && rankings.length === 0 && (
            <div className="flex flex-col items-center py-24 opacity-40">
               <Trophy className="w-12 h-12 mb-4 text-slate-700" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em]">No records found in local sector</span>
            </div>
          )}
        </div>

        {currentScore !== undefined && !loading && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mt-6 flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-[2rem] bg-pink-600 border border-pink-400 shadow-[0_0_40px_rgba(236,72,153,0.3)] relative overflow-hidden shrink-0"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-pink-500/50 to-transparent pointer-events-none" />
            <div className="flex items-center gap-4 md:gap-6 text-white relative z-10">
               <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center font-display italic text-lg md:text-xl">
                 YOU
               </div>
               <div className="flex flex-col">
                 <span className="font-black tracking-widest text-[10px] md:text-xs uppercase italic drop-shadow-md">Active Identity Score</span>
                 <span className="text-[8px] font-bold text-pink-100 uppercase tracking-[.3em] opacity-80">Synchronized Terminal</span>
               </div>
            </div>
            <div className="flex flex-col items-end text-white relative z-10">
               <span className="text-xl md:text-4xl font-display italic tracking-tighter drop-shadow-md">
                 {currentScore.toLocaleString()}
               </span>
               <span className="text-[8px] font-black text-pink-100 uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded mt-1">Peak</span>
            </div>
          </motion.div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent pointer-events-none" />
    </div>
  );
};
