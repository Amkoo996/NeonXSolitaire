import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider, signInWithPopup } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { LogIn, Gamepad2, PlayCircle, ShieldCheck, Trophy, Users, BarChart3, Globe } from 'lucide-react';

interface MenuProps {
  onStartGolf: () => void;
  onRankings: () => void;
  onStartMultiplayer: () => void;
  onSetupProfile: () => void;
}

export const Menu = ({ onStartGolf, onRankings, onStartMultiplayer, onSetupProfile }: MenuProps) => {
  const [profile, setProfile] = React.useState<any>(null);

  React.useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'players', auth.currentUser.uid), (snap) => {
      setProfile(snap.data());
    });
    return () => unsub();
  }, [auth.currentUser?.uid]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-[#030303] overflow-hidden relative font-sans">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-pink-600/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        
        {/* Animated grid line */}
        <motion.div 
          animate={{ y: ['0%', '100%'] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent top-0"
        />
      </div>

      {/* Profile Header */}
      <div className="absolute top-6 right-6 md:top-10 md:right-10 flex items-center gap-4 bg-white/5 backdrop-blur-2xl p-2 pl-5 md:p-3 md:pl-6 rounded-full border border-white/10 z-20 shadow-2xl">
         {!auth.currentUser ? (
           <button 
             onClick={handleLogin}
             className="flex items-center gap-3 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all group font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.4)]"
           >
             <LogIn size={16} />
             <span>Connect Terminal</span>
           </button>
         ) : (
           <div className="flex items-center gap-4">
             <div className="flex flex-col items-end hidden md:flex">
               <span className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-400 opacity-60">Auth Success</span>
               <span className="text-xs font-black text-white px-1">
                 {profile?.name || auth.currentUser?.displayName || 'Ghost User'}
               </span>
             </div>
             <button 
               onClick={onSetupProfile}
               className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center text-2xl transition-all group relative overflow-hidden"
               style={{ borderColor: profile?.color || '#3b82f6', boxShadow: `0 0 15px ${profile?.color}44` }}
             >
                <div className="absolute inset-0 bg-current opacity-10" />
                <span className="drop-shadow-sm group-hover:scale-110 transition-transform relative z-10">
                  {profile?.profileIcon || '👤'}
                </span>
             </button>
           </div>
         )}
      </div>

      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="z-10 flex flex-col items-center text-center px-6"
      >
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8 px-5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center gap-2"
        >
           <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_white]" />
           <span className="text-blue-400 text-[9px] font-black uppercase tracking-[0.5em]">System.Ready()</span>
        </motion.div>
        
        <h1 className="text-7xl md:text-[12rem] font-display text-white mb-2 leading-none tracking-tighter relative group">
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-blue-500 drop-shadow-[0_0_50px_rgba(59,130,246,0.3)]">NEON</span>
          <span className="text-blue-500 ml-4 group-hover:neon-text-pink transition-all duration-700">X</span>
        </h1>
        
        <p className="text-blue-400/40 text-sm md:text-xl mb-16 max-w-xl font-black tracking-[0.2em] uppercase italic bg-gradient-to-r from-transparent via-blue-400/10 to-transparent py-2 border-y border-blue-500/5">
          Solitaire Evolution • Rounds 1-10
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full max-w-5xl">
          <MenuButton 
            icon={<PlayCircle className="fill-blue-500" />} 
            label="ELITE MISSION" 
            sub="Single Player Persistence"
            onClick={onStartGolf}
            primary
            color="white"
          />
          <MenuButton 
            icon={<Users className="text-pink-400" />} 
            label="PVP SYNC" 
            sub="Neural Score Arena"
            onClick={onStartMultiplayer}
            color="pink"
          />
          <MenuButton 
            icon={<Trophy className="text-blue-400" />} 
            label="LEADERBOARD" 
            sub="Global Ranking Protocol"
            onClick={onRankings}
            color="blue"
            className="md:col-span-2"
          />
        </div>

        <div className="mt-20 flex gap-8 items-center opacity-20 hidden md:flex">
           <div className="flex items-center gap-2">
             <BarChart3 size={14} className="text-blue-400" />
             <span className="text-[8px] font-black uppercase tracking-[0.3em]">Network.Ping: 12ms</span>
           </div>
           <div className="flex items-center gap-2">
             <Globe size={14} className="text-blue-400" />
             <span className="text-[8px] font-black uppercase tracking-[0.3em]">Region.Earth_Active</span>
           </div>
        </div>
      </motion.div>
    </div>
  );
};

const MenuButton = ({ icon, label, sub, onClick, primary = false, color = 'blue', disabled = false, className = '' }: any) => {
  const getColors = () => {
    if (disabled) return 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-50 cursor-not-allowed grayscale';
    if (primary) return 'bg-white border-white text-slate-950 shadow-[0_0_30px_rgba(255,255,255,0.2)] cursor-pointer';
    if (color === 'pink') return 'bg-black/60 border-pink-500/30 text-pink-500 hover:border-pink-500 hover:bg-pink-500/10 shadow-[0_0_30px_rgba(236,72,153,0.1)] cursor-pointer';
    if (color === 'blue') return 'bg-black/60 border-blue-500/30 text-blue-500 hover:border-blue-500 hover:bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.1)] cursor-pointer';
    return 'bg-slate-900/40 border-white/5 hover:border-white/10 text-slate-300 cursor-pointer';
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-4 md:gap-6 p-5 md:p-8 rounded-3xl md:rounded-[2.5rem] border transition-all text-left group relative overflow-hidden ${getColors()} ${className}`}
    >
      <div className="p-3 md:p-5 rounded-2xl transition-all group-hover:scale-110 bg-white/5 group-hover:bg-white/10">
         {React.cloneElement(icon as React.ReactElement, { size: 24 })}
      </div>
      <div className="flex flex-col relative z-20">
         <span className="font-display tracking-widest text-lg md:text-2xl uppercase italic">{label}</span>
         <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] opacity-40">{sub}</span>
      </div>
    </motion.button>
  );
};
