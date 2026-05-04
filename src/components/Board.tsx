import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScorePop } from './ScorePop';
import { ScoreEvent, Card as CardType, TableState } from '../types';
import { deal, canMoveToFoundation } from '../utils/gameLogic';
import { Card } from './Card';
import { GAME_SETTINGS, PLAYER_COLORS } from '../constants';
import { cn } from '../lib/utils';
import { Trophy, RefreshCw, Timer, SkipForward, LogOut } from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, limit, serverTimestamp } from 'firebase/firestore';

interface BoardProps {
  onGameOver: (score: number) => void;
  onRoundOver: (score: number, cleared: boolean) => void;
  onMenu: () => void;
  currentRound: number;
  roomId?: string | null;
  isFastMode?: boolean;
}

const CountingValue = ({ value, delay = 0, onTick }: { value: number, delay?: number, onTick?: () => void }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    let timer: NodeJS.Timeout;
    const timeout = setTimeout(() => {
      const duration = 1000;
      const steps = 60;
      const increment = end / steps;
      let currentStep = 0;
      
      const animate = () => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayValue(end);
        } else {
          const nextVal = Math.floor(increment * currentStep);
          setDisplayValue(nextVal);
          if (onTick && currentStep % 4 === 0) onTick();
          timer = setTimeout(animate, 16);
        }
      };
      animate();
    }, delay * 1000);

    return () => {
      clearTimeout(timeout);
      if (timer) clearTimeout(timer);
    };
  }, [value, delay, onTick]);

  return <span className="text-white font-mono tabular-nums">+{displayValue.toLocaleString()}</span>;
};

let globalAudioCtx: AudioContext | null = null;
const getAudioCtx = () => {
  if (!globalAudioCtx) {
    try {
      globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Audio Context creation failed');
    }
  }
  return globalAudioCtx;
};

export const Board = ({ onGameOver, onRoundOver, onMenu, currentRound, roomId, isFastMode }: BoardProps) => {
  const [state, setState] = useState<TableState | null>(null);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const [initialTime, setInitialTime] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [consecutiveMoves, setConsecutiveMoves] = useState(0);
  const [diamonds, setDiamonds] = useState<boolean[]>([]); 
  const [showSummary, setShowSummary] = useState(false);
  const [bonusCalculation, setBonusCalculation] = useState({
    diamonds: 0,
    time: 0,
    total: 0
  });

  const foundationRef0 = useRef<HTMLDivElement>(null);
  const foundationRef1 = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (event: any, info: any, card: CardType, pyramidIndex: number, cardIndex: number) => {
    if (!state || !foundationRef0.current) return;

    const slot1Rect = foundationRef0.current.getBoundingClientRect();
    const slot2Rect = foundationRef1.current?.getBoundingClientRect();

    const cardX = info.point.x;
    const cardY = info.point.y;

    const isOverSlot1 = cardX >= slot1Rect.left && cardX <= slot1Rect.right &&
                       cardY >= slot1Rect.top && cardY <= slot1Rect.bottom;
    
    const isOverSlot2 = slot2Rect && cardX >= slot2Rect.left && cardX <= slot2Rect.right &&
                       cardY >= slot2Rect.top && cardY <= slot2Rect.bottom;

    if (isOverSlot1 || isOverSlot2) {
      handleCardClick(card, pyramidIndex, cardIndex);
    }
  };

  const playBeep = (freq: number, duration: number, type: 'sine' | 'square' | 'triangle' = 'sine') => {
    try {
      const audioCtx = getAudioCtx();
      if (!audioCtx) return;
      
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio blocked or failed');
    }
  };

  const addScoreEvent = (value: number, multiplier: number, x: number, y: number, type: 'score' | 'bonus' | 'penalty' = 'score', label?: string) => {
    const newEvent: ScoreEvent = {
      id: Math.random().toString(36).substr(2, 9),
      value,
      multiplier,
      x,
      y,
      label,
      type
    };
    setState(prev => prev ? { ...prev, scoreEvents: [...prev.scoreEvents.slice(-5), newEvent] } : null);
    
    setTimeout(() => {
      setState(prev => prev ? { ...prev, scoreEvents: prev.scoreEvents.filter(e => e.id !== newEvent.id) } : null);
    }, 2000);
  };

  const initGame = useCallback(() => {
    const seed = Math.floor(Date.now() / 1000) + currentRound; 
    const tableData = deal(currentRound, seed);
    
    // Decreasing round time
    const baseTime = GAME_SETTINGS.INITIAL_ROUND_TIME || 150;
    const reduction = (currentRound - 1) * 10;
    const roundTimeValue = isFastMode ? 60 : Math.max(60, baseTime - reduction);
    const roundTime = isNaN(roundTimeValue) ? 60 : roundTimeValue;
    
    setState({
      ...tableData,
      currentRound,
      initialStockLength: tableData.stock.length,
      totalRounds: GAME_SETTINGS.TOTAL_ROUNDS,
      score: 0,
      streak: 0,
      maxStreak: 0,
      cardsRemoved: 0,
      slot2Unlocked: false,
      keyFound: false,
      timer: roundTime,
      scoreEvents: [],
      opponents: state ? state.opponents : [], // Preserve opponents if they exist
    });
    setInitialTime(roundTime);
    setDiamonds(new Array(tableData.columns.length).fill(false));
    setLastMoveTime(0);
    setConsecutiveMoves(0);
    setIsFinishing(false);
    setShowSummary(false);
  }, [currentRound, isFastMode]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const handleFinish = () => {
    if (!state) return;
    const allEmpty = state.columns.every(p => p.length === 0);
    const diamondCount = diamonds.filter(d => d).length;
    
    const dBonus = diamondCount * 5000;
    // Time bonus ONLY if all columns cleared (all diamonds collected)
    const tBonus = allEmpty ? (state.timer * 800) : 0;
    const clearBonus = allEmpty ? (25000 + (diamonds.length * 2000)) : 0;
    
    const totalWithBonuses = state.score + dBonus + clearBonus + tBonus;
    
    setBonusCalculation({
      diamonds: dBonus + clearBonus,
      time: tBonus,
      total: isNaN(totalWithBonuses) ? state.score : totalWithBonuses
    });
    setShowSummary(true);
    playBeep(880, 0.8, 'triangle');
  };

  const handleNextRound = () => {
    onRoundOver(bonusCalculation.total, state?.columns.every(p => p.length === 0) || false);
  };

  // Multiplayer Sync - Score Updates
  useEffect(() => {
    if (!auth.currentUser || !state || roomId === null) return;
    const currentRoomId = roomId || 'global_arcade';
    const playerRef = doc(db, 'rooms', currentRoomId, 'players', auth.currentUser.uid);

    const syncScore = async () => {
      try {
        await setDoc(playerRef, {
          score: state.score,
          lastUpdate: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error('Sync error', err);
      }
    };

    const timeout = setTimeout(syncScore, 1000); // Debounce sync
    return () => clearTimeout(timeout);
  }, [state?.score, auth.currentUser?.uid, roomId]);

  // Multiplayer Sync - Initial Setup & Listen
  useEffect(() => {
    if (!auth.currentUser || !state) return;
    const currentRoomId = roomId || 'global_arcade';
    const playerRef = doc(db, 'rooms', currentRoomId, 'players', auth.currentUser.uid);

    getDoc(doc(db, 'players', auth.currentUser.uid)).then(snap => {
      const data = snap.data();
      setDoc(playerRef, {
        name: data?.name || auth.currentUser?.displayName || `PLAYER_${auth.currentUser?.uid.slice(-4).toUpperCase()}`,
        score: state.score,
        color: data?.color || PLAYER_COLORS[0],
        profileIcon: data?.profileIcon || '🐱',
        isReady: true,
        lastUpdate: serverTimestamp()
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `rooms/${currentRoomId}/players`));
    });

    const playersQuery = query(
      collection(db, 'rooms', currentRoomId, 'players'),
      where('lastUpdate', '>', new Date(Date.now() - 300000)),
      limit(6)
    );

    const unsub = onSnapshot(playersQuery, (snapshot) => {
      const others = snapshot.docs
        .filter(d => d.id !== auth.currentUser?.uid)
        .map(d => ({
          id: d.id,
          name: d.data().name,
          score: d.data().score,
          color: d.data().color,
          profileIcon: d.data().profileIcon || '🐶'
        }));
      setState(prev => prev ? { ...prev, opponents: others } : null);
    }, (err) => handleFirestoreError(err, OperationType.GET, `rooms/${currentRoomId}/players`));

    return () => unsub();
  }, [auth.currentUser?.uid, state === null, roomId]);

  const handleCardClick = (card: CardType, pileIndex: number, cardIndex: number) => {
    if (!state || !card.isFaceUp || isFinishing) return;

    // Linear pile logic for all levels: only the top card of any pile is accessible
    const pile = state.columns[pileIndex];
    const isExposed = cardIndex === pile.length - 1;

    if (!isExposed) return;

    const slot1Top = state.foundations[0][state.foundations[0].length - 1];
    const slot2Top = state.foundations[1].length > 0 ? state.foundations[1][state.foundations[1].length - 1] : null;

    const canToSlot1 = canMoveToFoundation(card, slot1Top);
    const canToSlot2 = slot2Top ? canMoveToFoundation(card, slot2Top) : false;

    if (canToSlot1 || canToSlot2) {
      playBeep(523.25 + (consecutiveMoves * 50), 0.2); 
      const newConsecutive = consecutiveMoves + 1;
      setConsecutiveMoves(newConsecutive);
      
      const basePoints = 2000 + (currentRound * 1000);
      const comboMultiplier = 1 + (newConsecutive * 0.5);
      const roundMultiplier = currentRound >= 9 ? 1.5 : 1;
      const moveScore = Math.floor(basePoints * comboMultiplier * roundMultiplier);
      
      let updatedStock = [...state.stock];
      let updatedFoundations = [...state.foundations];
      let slot2JustUnlocked = false;

      const newColumns = state.columns.map((p, pIdx) => {
        if (pIdx === pileIndex) {
          const updated = p.filter(c => c.id !== card.id);
          
          if (updated.length > 0) {
            if (!updated[updated.length - 1].isFaceUp) playBeep(392, 0.1);
            updated[updated.length - 1].isFaceUp = true;
          }

          return updated;
        }
        return p;
      });

      const target = canToSlot1 ? 0 : 1;
      updatedFoundations[target] = [...updatedFoundations[target], card];

      if (newConsecutive === 3 && updatedStock.length > 0) {
        const bonusCard = updatedStock.pop()!;
        bonusCard.isFaceUp = true;
        updatedFoundations[1] = [bonusCard];
        slot2JustUnlocked = true;
        playBeep(659.25, 0.3, 'square');
      }
      
      const newTotalScore = state.score + moveScore;
      const allCleared = newColumns.every(p => p.length === 0);

      if (newColumns[pileIndex].length === 0 && !diamonds[pileIndex]) {
        const newDiamonds = [...diamonds];
        newDiamonds[pileIndex] = true;
        setDiamonds(newDiamonds);
        playBeep(1046.5, 0.3, 'square');
        addScoreEvent(5000, 1, 512, 384, 'bonus', 'DIAMOND UNLOCKED!');
      }

      setState({
        ...state,
        columns: newColumns,
        foundations: updatedFoundations,
        stock: updatedStock,
        score: newTotalScore,
        slot2Unlocked: state.slot2Unlocked || slot2JustUnlocked
      });

      addScoreEvent(moveScore, 1, 512, 384, 'score');

      if (slot2JustUnlocked) {
         addScoreEvent(2500, 1, 512, 400, 'bonus', 'NEON STACK ACTIVE!');
      }

      if (allCleared) {
        addScoreEvent(10000, 1, 512, 200, 'bonus', 'BOARD CLEAR!');
      }
    } else {
      // Penalty for wrong move
      const basePoints = 2000 + (currentRound * 1000);
      const penalty = Math.floor(basePoints / 2);
      addScoreEvent(-penalty, 1, 512, 384, 'penalty', 'WRONG MOVE!');
      setState(prev => prev ? { ...prev, score: Math.max(0, prev.score - penalty) } : null);
      playBeep(110, 0.2, 'square');
    }
  };

  const handleStockClick = () => {
    if (!state || state.stock.length === 0 || isFinishing || showSummary) return;

    playBeep(261.63, 0.15);
    const newStock = [...state.stock];
    const topCard = newStock.pop()!;
    topCard.isFaceUp = true;

    const newFoundations = [[...state.foundations[0], topCard], []];
    
    setConsecutiveMoves(0);
    setState({
      ...state,
      stock: newStock,
      foundations: newFoundations,
      slot2Unlocked: false
    });
  };

  useEffect(() => {
    if (isFinishing && state && !showSummary) {
       handleFinish();
    }
  }, [isFinishing, state, showSummary]);

  useEffect(() => {
    if (!state || isFinishing || showSummary) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (!prev) return null;
        if (prev.timer <= 1) {
          setIsFinishing(true);
          return { ...prev, timer: 0 };
        }
        
        const nextTimer = prev.timer - 1;
        
        // Sound cues
        if (nextTimer === 15) {
          playBeep(440, 0.5); // Warning beep
        } else if (nextTimer <= 10 && nextTimer > 0) {
          playBeep(nextTimer <= 3 ? 880 : 660, 0.1, 'square'); // Countdown beeps
        }

        return { ...prev, timer: nextTimer };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state === null, isFinishing, showSummary]);

  if (!state) return null;

  const totalCardsLeft = state.columns.reduce((acc, col) => acc + col.length, 0);

  return (
    <div ref={boardRef} className="w-full h-[100dvh] bg-[#030303] relative overflow-hidden flex flex-col shadow-[0_0_100px_rgba(59,130,246,0.1)] border-white/5 select-none font-sans">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15)_0%,transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        
        {/* Pulsing Neon Glow */}
        <motion.div 
          animate={{ opacity: [0.05, 0.15, 0.05] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute inset-0 bg-blue-500/5" 
        />
      </div>

      <ScorePop events={state.scoreEvents} />

      {/* HUD: FIXED TOP */}
      <div className="h-10 md:h-24 w-full flex items-center justify-between px-3 md:px-12 z-30 bg-[#030303] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
           <div className="flex flex-col">
             <span className="text-[8px] md:text-[10px] font-black uppercase text-blue-400/60 tracking-[0.2em]">Phase</span>
             <span className="text-xl md:text-3xl font-display text-white italic">
               {state.currentRound}<span className="text-blue-500 text-xs md:text-lg ml-1">/10</span>
             </span>
           </div>
           
           <div className="h-6 md:h-12 w-px bg-white/10" />

           <div className="flex flex-col">
             <span className="text-[8px] md:text-[10px] font-black uppercase text-blue-400/60 tracking-[0.2em]">Score</span>
             <span className="text-xl md:text-3xl font-display text-amber-500 italic tabular-nums">
               {state.score.toLocaleString()}
             </span>
           </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
           <div className="flex flex-col items-center px-2 md:px-4 py-1 rounded-lg md:rounded-xl bg-white/5 border border-white/5">
              <span className="text-[8px] font-black uppercase text-blue-400/60 tracking-widest mb-1 hidden md:block">Diamonds</span>
              <div className="flex gap-0.5 md:gap-1">
                 {diamonds.map((d, i) => (
                   <div key={i} className={cn("w-1.5 h-1.5 md:w-3 md:h-3 rotate-45 border border-blue-400/30", d ? "bg-cyan-400 shadow-[0_0_8px_cyan]" : "bg-white/5")} />
                 ))}
              </div>
           </div>

           <div className="flex flex-col items-end w-20 md:w-40 relative">
              <div className="flex items-center gap-2 relative">
                 <Timer size={14} className={cn("transition-colors z-10", state.timer < 30 ? "text-red-500 animate-pulse" : "text-blue-400")} />
                 <span className={cn("text-lg md:text-3xl font-display italic tabular-nums z-10", state.timer < 15 ? "text-red-500 scale-110 drop-shadow-[0_0_10px_red]" : state.timer < 30 ? "text-red-500" : "text-white")}>
                    {isNaN(state.timer) ? "0:00" : `${Math.floor(state.timer / 60)}:${(state.timer % 60).toString().padStart(2, '0')}`}
                 </span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mt-0.5 overflow-hidden">
                 <motion.div 
                   initial={false}
                   animate={{ 
                     width: `${(state.timer / initialTime) * 100}%`,
                     backgroundColor: state.timer < 15 ? "#ff0000" : state.timer < 30 ? "#ef4444" : state.timer < 60 ? "#f59e0b" : "#3b82f6"
                   }}
                   className="h-full shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                 />
              </div>
           </div>
           
           <button onClick={onMenu} className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-white/5 text-slate-400 flex items-center justify-center hover:bg-red-500/20 transition-all border border-white/10 hover:border-red-500/50 group">
              <LogOut size={16} />
           </button>
        </div>
      </div>

      <AnimatePresence>
        {(state.columns.every(p => p.length === 0) || (state.stock.length === 0)) && !showSummary && !isFinishing && (
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm"
          >
            <motion.button
              whileHover={{ scale: 1.1, boxShadow: "0 0 30px rgba(59,130,246,0.5)" }}
              whileTap={{ scale: 0.9 }}
              onClick={handleFinish}
              className="px-12 py-6 bg-blue-600 text-white rounded-full font-black italic text-3xl shadow-2xl border-4 border-white/20 flex items-center gap-4 group"
            >
              <span>{state.columns.every(p => p.length === 0) ? "COMPLETE PHASE" : "FINISH ROUND"}</span>
              <SkipForward className="group-hover:translate-x-2 transition-transform" size={40} />
            </motion.button>
          </motion.div>
        )}

        {showSummary && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-2xl"
          >
            <motion.div 
              initial={{ y: 50, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              className="w-full max-w-2xl p-12 rounded-[4rem] bg-black/60 border-4 border-white/10 shadow-[0_0_100px_rgba(59,130,246,0.3)] text-center relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
              <h2 className="text-5xl font-black text-white italic mb-12 tracking-tighter uppercase underline decoration-blue-500/50 underline-offset-8">
                 Phase {state.currentRound} Results
              </h2>
              <div className="space-y-6 mb-12">
                 <div className="flex justify-between items-center text-2xl font-bold bg-white/5 p-6 rounded-3xl border border-white/5">
                    <span className="text-blue-400 uppercase tracking-widest italic">Base Score</span>
                    <span className="text-white font-mono tabular-nums">{state.score.toLocaleString()}</span>
                 </div>
                 <motion.div 
                   initial={{ x: -20, opacity: 0 }}
                   animate={{ x: 0, opacity: 1 }}
                   transition={{ delay: 0.3 }}
                   className="flex justify-between items-center text-2xl font-bold bg-white/5 p-6 rounded-3xl border border-white/5"
                 >
                    <span className="text-cyan-400 uppercase tracking-widest italic flex items-center gap-3">
                       <Trophy size={24} /> Diamond Bonus
                    </span>
                    <CountingValue value={bonusCalculation.diamonds} delay={0.5} onTick={() => playBeep(660, 0.05)} />
                 </motion.div>
                 <motion.div 
                   initial={{ x: -20, opacity: 0 }}
                   animate={{ x: 0, opacity: 1 }}
                   transition={{ delay: 0.6 }}
                   className="flex justify-between items-center text-2xl font-bold bg-white/5 p-6 rounded-3xl border border-white/5"
                 >
                    <span className="text-emerald-400 uppercase tracking-widest italic flex items-center gap-3">
                       <Timer size={24} /> Time Bonus
                    </span>
                    <CountingValue value={bonusCalculation.time} delay={1} onTick={() => playBeep(880, 0.05)} />
                 </motion.div>
              </div>
              <div className="h-px w-full bg-white/10 mb-8" />
              <div className="flex justify-between items-center mb-12 px-6">
                 <span className="text-3xl font-black text-blue-500 italic uppercase">Total Credits</span>
                 <motion.span 
                   initial={{ scale: 0.5 }}
                   animate={{ scale: 1 }}
                   className="text-6xl font-black text-white italic tabular-nums drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]"
                 >
                    <CountingValue value={bonusCalculation.total} delay={1.5} />
                 </motion.span>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNextRound}
                className="w-full py-8 bg-white text-slate-950 rounded-[2.5rem] font-black italic text-3xl shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all hover:bg-blue-400 hover:text-white"
              >
                 INITIATE NEXT PHASE
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Game Area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center p-0 md:p-4 relative z-10 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center">
             <FormationLayout 
               round={state.currentRound}
               columns={state.columns}
               onCardClick={handleCardClick}
               onDragEnd={handleDragEnd}
               boardRef={boardRef}
             />
          </div>
      </div>

      {/* Command Hub: FIXED BOTTOM */}
      <div className="h-16 md:h-40 w-full bg-[#030303] border-t border-white/5 flex items-center justify-between px-4 md:px-20 z-30 relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />
          
          {/* Multiplayer Feed */}
          <div className="absolute left-4 top-0 bottom-0 flex flex-col justify-center pointer-events-none hidden md:flex">
             <AnimatePresence>
                {state.opponents.slice(0, 3).map((opp, i) => (
                  <motion.div 
                    key={opp.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="flex items-center gap-2 mb-1"
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opp.color || '#fff' }} />
                    <span className="text-[8px] font-black text-white/40 uppercase tracking-widest whitespace-nowrap">
                      {opp.name}: {opp.score}
                    </span>
                  </motion.div>
                ))}
             </AnimatePresence>
          </div>

          <div className="flex items-center gap-6 md:gap-12 relative z-10 mx-auto">
            {/* Main Pile */}
            <div className="flex items-center gap-2 md:gap-4">
              <div 
                className="relative cursor-pointer group active:scale-95 transition-transform"
                onClick={handleStockClick}
              >
                  <Card card={{ id: 'back', suit: 'hearts', rank: 'A', value: 1, isFaceUp: false }} isClickable={false} />
                  <div className="absolute -top-2 -right-2 w-5 h-5 md:w-10 md:h-10 bg-blue-600 rounded-full flex items-center justify-center border-2 md:border-4 border-[#030303] shadow-lg">
                    <span className="text-[8px] md:text-sm font-black text-white tabular-nums">{state.stock.length}</span>
                  </div>
              </div>

              {/* Slots */}
              <div className="flex items-center gap-2 md:gap-8">
                  <div ref={foundationRef0} className="w-14 h-20 md:w-28 md:h-40 bg-white/5 rounded-lg md:rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden">
                     <AnimatePresence mode="popLayout">
                        {state.foundations[0].length > 0 && (
                          <motion.div
                            key={state.foundations[0][state.foundations[0].length - 1].id}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="w-full h-full"
                          >
                            <Card 
                              card={state.foundations[0][state.foundations[0].length - 1]} 
                              isClickable={false}
                              className="w-full h-full border-0"
                            />
                          </motion.div>
                        )}
                     </AnimatePresence>
                  </div>

                  <div ref={foundationRef1} className={cn(
                    "w-14 h-20 md:w-28 md:h-40 rounded-lg md:rounded-2xl border transition-all duration-500 flex items-center justify-center relative overflow-hidden",
                    state.slot2Unlocked ? "bg-white/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]" : "bg-black/40 border-white/5 grayscale"
                  )}>
                     <AnimatePresence mode="popLayout">
                        {state.foundations[1].length > 0 ? (
                          <motion.div
                            key={state.foundations[1][state.foundations[1].length - 1].id}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="w-full h-full"
                          >
                            <Card 
                              card={state.foundations[1][state.foundations[1].length - 1]} 
                              isClickable={false}
                              className="w-full h-full border-0"
                            />
                          </motion.div>
                        ) : (
                          <div className="text-white/10 text-xs">
                             {state.slot2Unlocked ? <SkipForward size={24} className="text-amber-500 animate-pulse" /> : "🔒"}
                          </div>
                        )}
                     </AnimatePresence>
                  </div>
              </div>
            </div>
          </div>

          {/* Fusion Meter */}
          <div className="hidden lg:flex flex-col items-end gap-2 w-64">
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-blue-400/30 uppercase tracking-widest">Fusion Pulse</span>
                <span className="text-sm font-display text-pink-500">x{1 + (consecutiveMoves * 0.5)}</span>
             </div>
             <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <motion.div 
                    key={i} 
                    className={cn(
                      "w-6 h-1 rounded-full transition-all duration-300",
                      consecutiveMoves >= i ? "bg-pink-500 shadow-[0_0_8px_pink]" : "bg-white/5"
                    )}
                  />
                ))}
             </div>
          </div>
      </div>
    </div>
  );
};

interface FormationLayoutProps {
  round: number;
  columns: CardType[][];
  onCardClick: (card: CardType, pileIdx: number, cardIndex: number) => void;
  onDragEnd: (event: any, info: any, card: CardType, pyramidIndex: number, cardIndex: number) => void;
  boardRef: React.RefObject<HTMLDivElement>;
}

const FormationLayout = React.memo(({ round, columns, onCardClick, onDragEnd, boardRef }: FormationLayoutProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const getPosition = (pileIdx: number, cardIdx: number, totalPiles: number) => {
    // Relative coordinates (0 to 100)
    let x = 50;
    let y = 50;
    let rotate = 0;
    let scale = 1;

    const stackOffset = cardIdx * (isMobile ? 8 : 12);
    
    if (round === 1) {
      // Pyramid Pattern: 10 piles (arranged in 4 rows: 1, 2, 3, 4)
      const rows = [1, 2, 3, 4];
      let currentPile = 0;
      let row = 0;
      let colInRow = 0;
      
      for (let r = 0; r < rows.length; r++) {
        if (pileIdx >= currentPile && pileIdx < currentPile + rows[r]) {
          row = r;
          colInRow = pileIdx - currentPile;
          break;
        }
        currentPile += rows[r];
      }
      
      const rowWidth = rows[row] * 20;
      x = 50 + (colInRow * 20) - (rowWidth / 2) + 10;
      y = 15 + row * 22;
    } else if (round === 2) {
      // Crescent Moon Pattern
      const angleStep = Math.PI / (totalPiles - 1);
      const angle = pileIdx * angleStep - Math.PI;
      const radius = isMobile ? 35 : 40;
      x = 50 + Math.cos(angle) * radius;
      y = 55 + Math.sin(angle) * (radius * 0.8);
      rotate = (angle * 180) / Math.PI + 90;
    } else if (round === 3) {
      // Twin Peaks (Double Pyramid)
      const isLeft = pileIdx < totalPiles / 2;
      const localIdx = isLeft ? pileIdx : pileIdx - totalPiles / 2;
      const rows = [1, 2, 3]; // 1+2+3 = 6 per peak
      let row = 0;
      let colInRow = 0;
      let current = 0;
      for (let r = 0; r < rows.length; r++) {
        if (localIdx >= current && localIdx < current + rows[r]) {
          row = r; colInRow = localIdx - current; break;
        }
        current += rows[r];
      }
      x = (isLeft ? 25 : 75) + (colInRow * 15) - (rows[row] * 7.5) + 7.5;
      y = 20 + row * 25;
    } else if (round === 4) {
      // Star Nova
      const angle = (pileIdx / totalPiles) * Math.PI * 2;
      const dist = pileIdx % 2 === 0 ? 30 : 15;
      x = 50 + Math.cos(angle) * dist;
      y = 50 + Math.sin(angle) * dist;
      rotate = (angle * 180) / Math.PI;
    } else if (round === 5 || round === 8) {
      // Organized Columns
      const spacing = 90 / (totalPiles - 1);
      x = 5 + pileIdx * spacing;
      y = 25;
    } else if (round === 6) {
      // Wave Pattern
      const spacing = 100 / (totalPiles - 1);
      x = pileIdx * spacing;
      y = 40 + Math.sin(pileIdx * 0.8) * 20;
      rotate = Math.cos(pileIdx * 0.8) * 20;
    } else if (round === 7) {
      // Orbital Ring
      const angle = (pileIdx / totalPiles) * Math.PI * 2;
      x = 50 + Math.cos(angle) * 35;
      y = 50 + Math.sin(angle) * 35;
      rotate = (angle * 180) / Math.PI;
    } else if (round === 9) {
      // Diamond Shape
      const coords = [
        [50, 10], [30, 30], [70, 30], [15, 50], [50, 50], [85, 50], [30, 70], [70, 70], [50, 90]
      ];
      const pt = coords[pileIdx % coords.length];
      x = pt[0]; y = pt[1];
    } else {
      // Chaos / Random-ish
      const seed = pileIdx * 123.45;
      x = 10 + (Math.sin(seed) * 0.5 + 0.5) * 80;
      y = 10 + (Math.cos(seed * 0.7) * 0.5 + 0.5) * 80;
      rotate = (Math.sin(seed * 2) * 20);
    }

    return { 
      left: `${x}%`, 
      top: `${y}%`, 
      transform: `translate(-50%, ${stackOffset}px) rotate(${rotate}deg) scale(${scale})`,
      zIndex: 10 + cardIdx
    };
  };

  return (
    <div ref={containerRef} className="relative w-full h-full max-w-[95vw] max-h-[60vh] mx-auto">
       {columns.map((pile, pIdx) => (
         <React.Fragment key={`pile-${pIdx}`}>
           {pile.map((card, cIdx) => (
             <motion.div
               key={card.id}
               className="absolute"
               initial={{ opacity: 0, scale: 0, x: -100, y: -100 }}
               animate={{ 
                 opacity: 1, 
                 scale: 1,
                 x: 0,
                 y: 0
               }}
               style={getPosition(pIdx, cIdx, columns.length)}
               transition={{ 
                 type: "spring", 
                 stiffness: 260, 
                 damping: 20, 
                 delay: pIdx * 0.05 + cIdx * 0.02 
               }}
             >
               <Card 
                 card={card}
                 onClick={() => onCardClick(card, pIdx, cIdx)}
                 isClickable={card.isFaceUp && cIdx === pile.length - 1}
                 className={cn(
                   "transition-shadow duration-300",
                   card.isFaceUp && cIdx === pile.length - 1 ? "shadow-[0_0_20px_rgba(59,130,246,0.6)] cursor-pointer" : "brightness-[0.8]"
                 )}
                 drag={card.isFaceUp && cIdx === pile.length - 1}
                 onDragEnd={(e, info) => onDragEnd(e, info, card, pIdx, cIdx)}
                 dragConstraints={boardRef}
               />
             </motion.div>
           ))}
         </React.Fragment>
       ))}
    </div>
  );
});
