import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Copy, Check, Play, LogOut, Shield, Zap, Globe } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, serverTimestamp, deleteDoc, query, orderBy } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface LobbyProps {
  roomId: string;
  onStart: () => void;
  onQuit: () => void;
}

export const Lobby = ({ roomId, onStart, onQuit }: LobbyProps) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [roomStatus, setRoomStatus] = useState<'lobby' | 'playing'>('lobby');
  const shareUrl = `${window.location.origin}${window.location.pathname}?join=${roomId}`;

  useEffect(() => {
    if (!auth.currentUser) return;

    // Join room in Firestore
    const playerRef = doc(db, 'rooms', roomId, 'players', auth.currentUser.uid);
    
    getDoc(doc(db, 'players', auth.currentUser.uid)).then(snap => {
      const profile = snap.data();
      setDoc(playerRef, {
        id: auth.currentUser!.uid,
        name: profile?.name || auth.currentUser?.displayName || `GUEST_${auth.currentUser?.uid.slice(-4)}`,
        isReady: true,
        lastUpdate: serverTimestamp(),
        score: 0,
        color: profile?.color || '#3b82f6'
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `rooms/${roomId}/players`));
    }).catch(err => handleFirestoreError(err, OperationType.GET, `players/${auth.currentUser?.uid}`));

    // Initialize room if not exists
    const roomRef = doc(db, 'rooms', roomId);
    getDoc(roomRef).then(snap => {
      if (!snap.exists()) {
        setDoc(roomRef, {
          createdAt: serverTimestamp(),
          status: 'lobby',
          gameType: 'golf'
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `rooms/${roomId}`));
      }
    });

    // Listen to players
    const q = query(collection(db, 'rooms', roomId, 'players'), orderBy('lastUpdate', 'desc'));
    const unsubPlayers = onSnapshot(q, (snap) => {
      setPlayers(snap.docs.map(d => d.data()));
    });

    return () => {
      unsubPlayers();
      // Optional: Leave room
      deleteDoc(playerRef).catch(console.error);
    };
  }, [roomId, onStart]);

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async () => {
    await setDoc(doc(db, 'rooms', roomId), { 
      status: 'playing',
      currentRound: 1 
    }, { merge: true });
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col lg:grid lg:grid-cols-12 gap-6 p-4 md:p-8 relative z-10 font-sans">
      {/* Left Column: Room Info & Invite */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 md:gap-6 order-2 lg:order-1">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-10 border-white/5 relative overflow-hidden group shadow-[0_0_50px_rgba(59,130,246,0.1)]"
        >
          {/* Background Glow */}
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1)_0%,transparent_70%)] pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
               <div className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest leading-none">Broadcasting</span>
               </div>
               <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-white/10" />
                  <div className="w-2 h-2 rounded-full bg-white/10" />
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
               </div>
            </div>
            
            <div className="flex flex-col gap-1 mb-6 md:mb-8">
              <span className="text-[10px] font-black text-blue-400/40 uppercase tracking-[0.4em] ml-1">Frequency ID</span>
              <h3 className="text-4xl md:text-7xl font-display text-white italic tracking-tighter leading-none mb-2">
                {roomId}
              </h3>
            </div>

            <div className="space-y-6">
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="p-5 bg-white rounded-[2rem] flex flex-col items-center shadow-[0_0_40px_rgba(255,255,255,0.1)]"
              >
                <div className="p-2">
                  <QRCodeSVG value={shareUrl} size={160} level="M" />
                </div>
                <div className="mt-3 flex items-center gap-2 text-slate-400 font-black text-[8px] uppercase tracking-widest">
                  <Globe size={10} />
                  <span>External Protocol Link</span>
                </div>
              </motion.div>

              <div className="flex flex-col gap-3">
                 <div className="flex gap-2 p-1 bg-black/40 border border-white/10 rounded-2xl">
                    <div className="flex-1 px-4 py-3 text-[10px] font-mono text-slate-500 truncate flex items-center">
                      {shareUrl}
                    </div>
                 </div>
                 <button 
                   onClick={copyLink}
                   className={cn(
                     "w-full py-4 rounded-xl transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-lg",
                     copied ? "bg-cyan-500 text-cyan-950 scale-95" : "bg-white text-black hover:bg-slate-100 active:scale-95"
                   )}
                 >
                   {copied ? <Check size={14} /> : <Copy size={14} />}
                   <span>{copied ? 'Link Synchronized' : 'Copy Uplink'}</span>
                 </button>
              </div>
            </div>
          </div>
        </motion.div>

        <button 
          onClick={onQuit}
          className="h-16 md:h-20 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 rounded-[2rem] flex items-center justify-center gap-4 transition-all group"
        >
          <LogOut size={18} className="text-pink-500 group-hover:-translate-x-2 transition-transform" />
          <span className="text-[10px] font-black text-pink-500 uppercase tracking-[0.2em]">Abort Sync</span>
        </button>
      </div>

      {/* Right Column: Player List & Start */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-4 md:gap-6 order-1 lg:order-2">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 glass-card border-white/5 rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-10 backdrop-blur-3xl flex flex-col relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 blur-[120px] pointer-events-none rounded-full" />
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div className="flex items-center gap-4 md:gap-6">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_30px_rgba(37,99,235,0.3)]">
                <Users size={24} md:size={32} />
              </div>
              <div>
                <h4 className="text-xl md:text-3xl font-display text-white italic uppercase tracking-tighter leading-none">MANIFEST</h4>
                <p className="text-[10px] font-black text-blue-400/40 uppercase tracking-[0.3em] mt-1">{players.length} Active Nodes</p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-3 mb-8 overflow-y-auto max-h-[480px] md:max-h-[520px] pr-2 custom-scrollbar relative z-10">
            <AnimatePresence>
              {players.map((player, idx) => (
                <motion.div 
                  key={player.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-4 md:p-5 bg-white/2 border border-white/5 rounded-2xl md:rounded-[2rem] flex items-center justify-between group hover:bg-white/5 hover:border-white/20 transition-all duration-300"
                >
                  <div className="flex items-center gap-4 md:gap-5">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center relative overflow-hidden group-hover:scale-105 transition-transform" style={{ color: player.color, backgroundColor: `${player.color}22`, border: `2px solid ${player.color}` }}>
                       <span className="text-xl md:text-2xl font-black drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                         {player.profileIcon || player.name.charAt(0)}
                       </span>
                    </div>
                    <div className="flex flex-col">
                      <p className="text-sm md:text-lg font-bold text-white uppercase italic tracking-tight flex items-center gap-2">
                        {player.name}
                        {player.id === auth.currentUser?.uid && (
                          <span className="text-[8px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-black italic border border-blue-500/20">YOU</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                         <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                         <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Link Stabilized</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 md:gap-8">
                    <div className="hidden sm:flex flex-col items-end">
                       <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5 italic">Status</p>
                       <p className="text-xs font-display text-blue-400 italic">READY</p>
                    </div>
                    <div className="h-8 md:h-12 w-px bg-white/5" />
                    <Zap size={18} className={cn(player.id === auth.currentUser?.uid ? "text-cyan-400 text-glow" : "text-slate-700")} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStartGame}
            disabled={players.length < 1}
            className="w-full h-20 md:h-28 bg-blue-600 hover:bg-blue-500 disabled:opacity-20 disabled:cursor-not-allowed group rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-between px-8 md:px-12 transition-all relative overflow-hidden shadow-[0_10px_40px_rgba(59,130,246,0.3)]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/20 to-transparent translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-700" />
            <div className="flex flex-col items-start relative z-10">
              <span className="text-[8px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.4em] mb-1 italic">Authorization Level 10</span>
              <span className="text-xl md:text-4xl font-display text-white uppercase tracking-tighter italic leading-none">START PHASE SYNC</span>
            </div>
            <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-2xl group-hover:bg-white group-hover:text-blue-600 transition-all duration-300">
              <Play className="fill-current w-6 h-6 md:w-8 md:h-8 translate-x-0.5" />
            </div>
          </motion.button>
        </motion.div>

        <div className="flex items-center justify-center gap-6 py-2 opacity-30">
           <div className="flex items-center gap-2">
             <Globe size={12} />
             <span className="text-[8px] font-black uppercase tracking-[0.3em] italic text-blue-400">Mesh Sync Active</span>
           </div>
           <div className="flex items-center gap-2">
             <Shield size={12} />
             <span className="text-[8px] font-black uppercase tracking-[0.3em] italic text-blue-400">Secure Protocol</span>
           </div>
        </div>
      </div>
    </div>
  );
};
