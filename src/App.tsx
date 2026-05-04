import React, { useState, useEffect } from 'react';
import { GameState } from './types';
import { Menu } from './components/Menu';
import { ProfileSetup } from './components/ProfileSetup';
import { Board } from './components/Board';
import { ScoreModal } from './components/ScoreModal';
import { Rankings } from './components/Rankings';
import { Lobby } from './components/Lobby';
import { GAME_SETTINGS, PLAYER_COLORS } from './constants';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { auth, db, OperationType, handleFirestoreError } from './lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, collection, onSnapshot, query, where } from 'firebase/firestore';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [totalScore, setTotalScore] = useState(0);
  const [prevTotalScore, setPrevTotalScore] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [lastRoundCleared, setLastRoundCleared] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showFixGuide, setShowFixGuide] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isFastMode, setIsFastMode] = useState(false);

  useEffect(() => {
    if (!roomId || !auth.currentUser) return;
    const roomRef = doc(db, 'rooms', roomId);
    const unsub = onSnapshot(roomRef, (snap) => {
      const data = snap.data();
      if (!data) return;
      
      if (data.currentRound !== undefined && data.currentRound !== currentRound) {
        setCurrentRound(data.currentRound);
        // If the round increased while we were in a sub-state, move to playing
        if (gameState === 'round_over' || gameState === 'lobby') {
          setGameState('playing');
        }
      }
      
      if (data.status === 'playing' && gameState === 'lobby') {
        setGameState('playing');
        if (data.currentRound) setCurrentRound(data.currentRound);
      }
    });
    return () => unsub();
  }, [roomId, currentRound, gameState]);

  const handleProfileSetup = () => {
    setGameState('profile');
  };

  const handleProfileComplete = () => {
    setGameState('menu');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
       setRoomId(joinCode);
       setGameState('lobby');
    }

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setAuthError(null);
        setShowFixGuide(false);
        const playerRef = doc(db, 'players', u.uid);
        try {
          const snap = await getDoc(playerRef);
          if (!snap.exists()) {
             await setDoc(playerRef, {
               updatedAt: serverTimestamp(),
               profileIcon: '🐱',
               name: u.displayName || `PLAYER_${u.uid.slice(-4).toUpperCase()}`,
               color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]
             });
          }
        } catch (e) {
          console.error("Firestore Identity Sync Error:", e);
          handleFirestoreError(e, OperationType.WRITE, `players/${u.uid}`);
        }
      } else {
          signInAnonymously(auth).catch((error) => {
            console.error("Auth Error:", error);
            if (error.code === 'auth/admin-restricted-operation') {
              setAuthError(`AUTHENTICATION RESTRICTED: Firebase needs setup.`);
              setShowFixGuide(true);
            } else {
              setAuthError(error.message);
            }
          });
      }
    });
    return unsubAuth;
  }, []);

  const saveScoreToLeaderboard = async (score: number) => {
     if (!auth.currentUser || score <= 0) return;
     try {
        const playerRef = doc(db, 'players', auth.currentUser.uid);
        const playerSnap = await getDoc(playerRef);
        const playerData = playerSnap.data() || {};
        
        const scoreId = `${auth.currentUser.uid}_${Date.now()}`;
        await setDoc(doc(db, 'leaderboard', scoreId), {
           userId: auth.currentUser.uid,
           name: playerData.name || 'ANONYMOUS',
           score: score,
           color: playerData.color || '#fff',
           timestamp: serverTimestamp()
        });
     } catch (e) {
        console.error('Leaderboard Error:', e);
     }
  };

  const handleStartGolf = () => {
    setTotalScore(0);
    setPrevTotalScore(0);
    setCurrentRound(1);
    setIsFastMode(false);
    setGameState('playing');
  };

  const handleStartMultiplayer = () => {
    const newRoomId = Math.random().toString(36).substring(7).toUpperCase();
    setRoomId(newRoomId);
    setGameState('lobby');
    window.history.pushState({}, '', `?join=${newRoomId}`);
  };

  const handleRoundOver = (roundScore: number, cleared: boolean) => {
    setPrevTotalScore(totalScore);
    const newTotal = totalScore + roundScore;
    setTotalScore(newTotal);
    setLastRoundCleared(cleared);

    if (roomId && auth.currentUser) {
       const playerRoomRef = doc(db, 'rooms', roomId, 'players', auth.currentUser.uid);
       setDoc(playerRoomRef, { score: newTotal, lastUpdate: serverTimestamp() }, { merge: true });
    }
    
    if (currentRound >= (isFastMode ? 1 : GAME_SETTINGS.TOTAL_ROUNDS)) {
      setGameState('game_over');
      saveScoreToLeaderboard(newTotal);
    } else {
      setGameState('round_over');
    }
  };

  const handleNextRound = async () => {
    if (gameState === 'game_over') {
      setGameState('rankings');
      return;
    }

    const nextRound = currentRound + 1;

    if (roomId && auth.currentUser) {
      const roomRef = doc(db, 'rooms', roomId);
      try {
        await setDoc(roomRef, { 
          currentRound: nextRound,
          status: 'playing',
          lastUpdate: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error('Room progression error', err);
      }
    }

    setCurrentRound(nextRound);
    setGameState('playing');
  };

  const [roundKey, setRoundKey] = useState(0);

  const handleRestartRound = () => {
    setTotalScore(prevTotalScore);
    setRoundKey(prev => prev + 1);
    setGameState('playing');
  };

  const handleRestart = () => {
    setGameState('menu');
    setRoomId(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  return (
    <div className="min-h-screen bg-black text-slate-100 selection:bg-blue-500 selection:text-white flex flex-col font-sans overflow-hidden relative">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,#0f172a_0%,#020617_100%)]" />
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
      
      <AnimatePresence>
        {showFixGuide && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <div className="bg-[#111] border-2 border-amber-500/30 p-10 rounded-[3rem] max-w-xl w-full shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8">
                 <button onClick={() => setShowFixGuide(false)} className="text-slate-500 hover:text-white transition-colors uppercase font-black text-xs">Close</button>
               </div>

               <div className="flex items-center gap-4 mb-8">
                 <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500">
                    <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                       <RefreshCw size={24} />
                    </motion.div>
                 </div>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter text-amber-500">Fix Auth Error</h2>
               </div>

               <div className="space-y-6 text-left">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Instructions:</p>
                    <ol className="text-sm space-y-4 text-slate-200">
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                        <span>Go to your <a href={`https://console.firebase.google.com/project/${(auth.app.options as any).projectId}/authentication/providers`} target="_blank" rel="noreferrer" className="text-amber-500 underline font-bold">Firebase Console</a></span>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                        <span>Click <b>"Add new provider"</b> and select <b>"Anonymous"</b></span>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center text-[10px] font-black shrink-0">3</span>
                        <span>Click <b>"Enable"</b> and save.</span>
                      </li>
                    </ol>
                  </div>

                  <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                     <p className="text-[10px] text-blue-400 uppercase tracking-widest font-black mb-1">Project ID</p>
                     <p className="text-lg font-mono text-white">{(auth.app.options as any).projectId}</p>
                  </div>
               </div>

               <button 
                 onClick={() => window.location.reload()}
                 className="w-full mt-10 py-4 bg-amber-500 rounded-2xl text-black font-black uppercase tracking-widest hover:scale-[1.02] transition-transform active:scale-95"
               >
                 I've enabled it - Refresh App
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {gameState === 'profile' && (
          <ProfileSetup 
            onComplete={handleProfileComplete} 
            onCancel={() => setGameState('menu')}
          />
        )}

        {authError && !showFixGuide && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6"
          >
            <div className="bg-red-500/10 border-2 border-red-500/50 backdrop-blur-xl p-4 rounded-2xl flex flex-col gap-2">
               <p className="text-red-400 text-[10px] font-black uppercase tracking-widest">System Restriction Detected</p>
               <p className="text-white text-xs font-bold leading-relaxed">{authError}</p>
            </div>
          </motion.div>
        )}

        {gameState === 'menu' && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4 }}
            className="w-full flex flex-col"
          >
            <Menu 
              onStartGolf={handleStartGolf} 
              onRankings={() => setGameState('rankings')} 
              onStartMultiplayer={handleStartMultiplayer}
              onSetupProfile={handleProfileSetup}
            />
          </motion.div>
        )}

        {gameState === 'lobby' && roomId && (
           <motion.div
             key="lobby"
             initial={{ opacity: 0, scale: 1.1 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.9 }}
             className="w-full flex flex-col"
           >
             <Lobby 
               roomId={roomId} 
               onStart={() => setGameState('playing')} 
               onQuit={handleRestart}
             />
           </motion.div>
        )}

        {gameState === 'rankings' && (
          <motion.div
            key="rankings"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full flex flex-col"
          >
            <Rankings onBack={() => setGameState('menu')} currentScore={totalScore} />
          </motion.div>
        )}

        {gameState === 'playing' && (
          <motion.div
            key={`playing-${currentRound}-${roundKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full flex flex-col"
          >
            <Board 
              onGameOver={() => setGameState('game_over')}
              onRoundOver={handleRoundOver}
              onMenu={handleRestart}
              currentRound={currentRound}
              roomId={roomId}
              isFastMode={isFastMode}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(gameState === 'round_over' || gameState === 'game_over') && (
          <ScoreModal 
            score={totalScore}
            cleared={lastRoundCleared}
            round={currentRound}
            totalRounds={GAME_SETTINGS.TOTAL_ROUNDS}
            onNext={handleNextRound}
            onRestartRound={handleRestartRound}
            onQuit={handleRestart}
            isGameOver={gameState === 'game_over'}
          />
        )}
      </AnimatePresence>

      {/* Global Ambient Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-blue-500/5 blur-[120px] rounded-full" />
         <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}
