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

  const handleCardClick = (card: CardType, pyramidIndex: number, cardIndex: number) => {
    if (!state || !card.isFaceUp || isFinishing) return;

    // Uncovering logic
    let isCovered = false;
    if (state.currentRound <= 3) {
      // Pyramid logic: 0 covered by 1,2. 1 by 3,4. 2 by 4,5.
      const pyramid = state.columns[pyramidIndex];
      const uncoveringMap: Record<number, number[]> = { 0: [1, 2], 1: [3, 4], 2: [4, 5] };
      const dependencies = uncoveringMap[cardIndex] || [];
      isCovered = dependencies.some(depIdx => pyramid.some(c => c.originalIdx === depIdx));
    } else {
      // Linear pile logic: only the top card is accessible
      const pile = state.columns[pyramidIndex];
      isCovered = cardIndex < pile.length - 1;
    }

    if (isCovered) return;

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
        if (pIdx === pyramidIndex) {
          const updated = p.filter(c => c.id !== card.id);
          
          if (state.currentRound <= 3) {
             const uncoveringMap: Record<number, number[]> = { 0: [1, 2], 1: [3, 4], 2: [4, 5] };
             updated.forEach((c) => {
               const oIdx = c.originalIdx;
               if (oIdx !== undefined) {
                 const deps = uncoveringMap[oIdx] || [];
                 const stillCovered = deps.some(depIdx => updated.some(uc => uc.originalIdx === depIdx));
                 if (!stillCovered) {
                    if (!c.isFaceUp) playBeep(392, 0.1);
                    c.isFaceUp = true;
                 }
               }
             });
          } else {
             if (updated.length > 0) {
               if (!updated[updated.length - 1].isFaceUp) playBeep(392, 0.1);
               updated[updated.length - 1].isFaceUp = true;
             }
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

      if (newColumns[pyramidIndex].length === 0 && !diamonds[pyramidIndex]) {
        const newDiamonds = [...diamonds];
        newDiamonds[pyramidIndex] = true;
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
    <div ref={boardRef} className="w-full max-w-[1024px] min-h-[90vh] md:aspect-[4/3] bg-[#030303] relative overflow-hidden flex flex-col md:rounded-[3rem] shadow-[0_0_100px_rgba(59,130,246,0.1)] border-x md:border-8 border-white/5 select-none font-sans mx-auto">
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
      <div className="h-20 md:h-24 w-full flex items-center justify-between px-4 md:px-12 z-30 bg-[#030303] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
           <div className="flex flex-col">
             <span className="text-[8px] md:text-[10px] font-black uppercase text-blue-400/60 tracking-[0.2em]">Phase</span>
             <span className="text-xl md:text-3xl font-display text-white italic">
               {state.currentRound}<span className="text-blue-500 text-xs md:text-lg ml-1">/10</span>
             </span>
           </div>
           
           <div className="h-8 md:h-12 w-px bg-white/10" />

           <div className="flex flex-col">
             <span className="text-[8px] md:text-[10px] font-black uppercase text-blue-400/60 tracking-[0.2em]">Credits</span>
             <span className="text-xl md:text-3xl font-display text-amber-500 italic tabular-nums">
               {state.score.toLocaleString()}
             </span>
           </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
           <div className="hidden lg:flex flex-col items-center px-4 py-1.5 rounded-xl bg-white/5 border border-white/5">
              <span className="text-[8px] font-black uppercase text-blue-400/60 tracking-widest mb-0.5">Board</span>
              <span className="text-lg font-display text-white tabular-nums">{totalCardsLeft}</span>
           </div>

           <div className="flex flex-col items-center px-3 md:px-4 py-1.5 rounded-xl bg-white/5 border border-white/5">
              <span className="text-[8px] font-black uppercase text-blue-400/60 tracking-widest mb-1 hidden md:block">Diamonds</span>
              <div className="flex gap-1">
                 {diamonds.map((d, i) => (
                   <div key={i} className={cn("w-2 h-2 md:w-3 md:h-3 rotate-45 border border-blue-400/30", d ? "bg-cyan-400 shadow-[0_0_8px_cyan]" : "bg-white/5")} />
                 ))}
              </div>
           </div>

           <div className="flex flex-col items-end w-24 md:w-40 relative">
              <div className="flex items-center gap-2 relative">
                 <Timer size={16} className={cn("transition-colors z-10", state.timer < 30 ? "text-red-500 animate-pulse" : "text-blue-400")} />
                 <span className={cn("text-xl md:text-3xl font-display italic tabular-nums z-10", state.timer < 15 ? "text-red-500 scale-110 drop-shadow-[0_0_10px_red]" : state.timer < 30 ? "text-red-500" : "text-white")}>
                    {isNaN(state.timer) ? "0:00" : `${Math.floor(state.timer / 60)}:${(state.timer % 60).toString().padStart(2, '0')}`}
                 </span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
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
           
           <button onClick={onMenu} className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/5 text-slate-400 flex items-center justify-center hover:bg-red-500/20 transition-all border border-white/10 hover:border-red-500/50 group">
              <LogOut size={18} />
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
      <div className="flex-1 w-full flex flex-col items-center justify-center p-2 md:p-4 relative z-10 overflow-hidden">
          <div className="w-full h-full max-h-[calc(100vh-20rem)] flex items-center justify-center">
            {state.currentRound <= 3 ? (
               <div className="flex flex-col items-center gap-2 scale-[0.6] sm:scale-[0.8] md:scale-[0.95] lg:scale-100 origin-center transition-transform">
                  <div className="h-[200px] md:h-[240px] flex justify-center">
                     <Pyramid 
                       cards={state.columns[0]} 
                       onCardClick={(card, idx) => handleCardClick(card, 0, idx)} 
                       onDragEnd={handleDragEnd}
                       boardRef={boardRef}
                       pyramidIndex={0}
                     />
                  </div>
                  <div className="h-[200px] md:h-[240px] flex justify-center gap-6 md:gap-12">
                     <Pyramid 
                       cards={state.columns[1]} 
                       onCardClick={(card, idx) => handleCardClick(card, 1, idx)} 
                       onDragEnd={handleDragEnd}
                       boardRef={boardRef}
                       pyramidIndex={1}
                     />
                     <Pyramid 
                       cards={state.columns[2]} 
                       onCardClick={(card, idx) => handleCardClick(card, 2, idx)} 
                       onDragEnd={handleDragEnd}
                       boardRef={boardRef}
                       pyramidIndex={2}
                     />
                  </div>
               </div>
            ) : (
              <div className={cn("grid w-full h-full items-center justify-items-center gap-x-1 md:gap-x-2 content-center scale-[0.7] sm:scale-[0.85] md:scale-100 origin-center transition-transform", 
                state.currentRound >= 10 ? "grid-cols-8" : 
                state.currentRound >= 7 ? "grid-cols-7" : 
                "grid-cols-5")}>
                {state.columns.map((pile, idx) => (
                  <motion.div 
                    key={`${state.currentRound}-pile-${idx}`}
                    initial={{ opacity: 0, scale: 0.8, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="relative h-[200px] md:h-[250px] w-full flex justify-center"
                  >
                    <LayoutContainer 
                      pileIdx={idx} 
                      round={state.currentRound} 
                      cards={pile} 
                      onCardClick={(card, cIdx) => handleCardClick(card, idx, cIdx)} 
                      onDragEnd={handleDragEnd}
                      boardRef={boardRef}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
      </div>

      {/* Command Hub: FIXED BOTTOM */}
      <div className="h-32 md:h-40 w-full bg-[#030303] border-t border-white/5 flex items-center justify-between px-4 md:px-20 z-30 relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />
          
          {/* Multiplayer Feed */}
          <div className="flex flex-col gap-2 w-64">
             <span className="text-[10px] font-black text-blue-400/40 uppercase tracking-[0.2em] mb-1">Live Rivals</span>
             <div className="flex -space-x-4">
                {state.opponents.map((opp, i) => (
                  <motion.div 
                    key={opp.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="w-12 h-12 rounded-full border-2 bg-slate-900 flex items-center justify-center text-xl relative group"
                    style={{ borderColor: opp.color || '#fff' }}
                  >
                    <span>{'🐱🐶🦊🦁🐯'[i % 5]}</span>
                    <div className="absolute bottom-[-24px] left-1/2 -translate-x-1/2 bg-black/80 text-[8px] text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                       {opp.name}: {opp.score}
                    </div>
                  </motion.div>
                ))}
             </div>
          </div>

          {/* Core Mechanics */}
          <div className="flex items-center gap-16">
              {/* Deck */}
              <div className="relative group" onClick={handleStockClick}>
                 <div className="absolute inset-0 bg-blue-600 rounded-lg -rotate-6 group-hover:-rotate-12 transition-transform opacity-30 translate-y-2 blur-[2px]" />
                 <Card card={{ id: 'back', suit: 'hearts', rank: 'A', value: 1, isFaceUp: false }} className="relative z-10 border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.4)]" isClickable={false} />
                 <div className="absolute -top-6 -right-6 w-14 h-14 bg-slate-900 border-4 border-blue-500 rounded-full flex items-center justify-center text-white font-black text-xl shadow-[0_0_20px_rgba(59,130,246,0.6)] z-20 tabular-nums">
                    {state.stock.length}
                 </div>
              </div>

              {/* Slots */}
              <div className="flex items-center gap-12">
                  <div className="flex flex-col items-center gap-3">
                     <div ref={foundationRef0} className="w-28 h-40 bg-white/5 rounded-2xl border-2 border-white/10 flex items-center justify-center relative overflow-hidden group">
                        <AnimatePresence mode="popLayout">
                          {state.foundations[0].length > 0 && (
                            <motion.div
                              key={state.foundations[0][state.foundations[0].length - 1].id}
                              initial={{ y: 20, opacity: 0, rotate: 5 }}
                              animate={{ y: 0, opacity: 1, rotate: 0 }}
                              className="w-full h-full"
                            >
                              <Card 
                                card={state.foundations[0][state.foundations[0].length - 1]} 
                                isClickable={false}
                                className="w-full h-full border-0 rounded-none bg-transparent"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                     </div>
                     <span className="text-[10px] font-black text-blue-400/40 uppercase tracking-widest">Primary</span>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                     <div ref={foundationRef1} className={cn(
                       "w-28 h-40 rounded-2xl border-2 transition-all duration-500 flex items-center justify-center relative overflow-hidden",
                       state.slot2Unlocked ? "bg-white/10 border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.2)]" : "bg-black/40 border-white/5 grayscale"
                     )}>
                        <AnimatePresence mode="popLayout">
                          {state.foundations[1].length > 0 ? (
                            <motion.div
                              key={state.foundations[1][state.foundations[1].length - 1].id}
                              initial={{ y: 20, opacity: 0, scale: 0.8 }}
                              animate={{ y: 0, opacity: 1, scale: 1 }}
                              className="w-full h-full"
                            >
                              <Card 
                                card={state.foundations[1][state.foundations[1].length - 1]} 
                                isClickable={false}
                                className="w-full h-full border-0 rounded-none bg-transparent"
                              />
                            </motion.div>
                          ) : (
                            <div className="flex flex-col items-center text-white/10 gap-2">
                               {state.slot2Unlocked ? <SkipForward size={32} className="text-amber-500 animate-pulse" /> : <span className="text-2xl">🔒</span>}
                            </div>
                          )}
                        </AnimatePresence>
                        {state.slot2Unlocked && (
                           <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
                        )}
                     </div>
                     <span className="text-[10px] font-black text-amber-500/40 uppercase tracking-widest">Bonus</span>
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

const LayoutContainer = React.memo(({ pileIdx, round, cards, onCardClick, onDragEnd, boardRef }: { 
  pileIdx: number, 
  round: number, 
  cards: CardType[], 
  onCardClick: (card: CardType, idx: number) => void,
  onDragEnd: (event: any, info: any, card: CardType, pyramidIndex: number, cardIndex: number) => void,
  boardRef: React.RefObject<HTMLDivElement>
}) => {
  const getCardStyle = (idx: number) => {
    // Dynamic vertical spacing based on card count to fit the container
    const spacing = cards.length > 8 ? 20 : cards.length > 5 ? 25 : 30;
    const baseTop = idx * spacing;
    
    if (round >= 4 && round <= 6) {
      const angle = (pileIdx - 2) * 5; 
      const xOffset = Math.sin(idx * 0.2) * 10 + (pileIdx - 2) * 10;
      return { top: baseTop, left: xOffset, rotate: angle };
    } else if (round >= 7 && round <= 9) {
      const wave = Math.sin((pileIdx + idx) * 0.5) * 20;
      return { top: baseTop, left: wave, rotate: idx * 2 };
    } else if (round >= 10) {
      return { top: idx * 25, left: 0, rotate: 0 };
    }
    
    return { top: baseTop, left: 0, rotate: 0 };
  };

  return (
    <div className="relative w-[110px] h-[340px]">
       {cards.map((card, i) => (
         <motion.div
           key={card.id}
           className="absolute"
           style={{ 
             ...getCardStyle(i),
             zIndex: i,
           }}
           initial={{ opacity: 0, scale: 0.5, y: 100 }}
           animate={{ 
             opacity: 1,
             scale: 1, 
             y: 0 
           }}
           transition={{ duration: 0.6, delay: i * 0.05 + pileIdx * 0.08, type: "spring", stiffness: 100 }}
         >
           <Card 
             card={card} 
             onClick={() => onCardClick(card, i)} 
             isClickable={card.isFaceUp && i === cards.length - 1} 
             className={!card.isFaceUp ? "brightness-[1.0] grayscale-0" : "shadow-[0_0_25px_rgba(59,130,246,0.4)]"}
             drag={card.isFaceUp && i === cards.length - 1}
             onDragEnd={(e, info) => onDragEnd(e, info, card, pileIdx, i)}
             dragConstraints={boardRef}
           />
         </motion.div>
       ))}
    </div>
  );
});

const Pyramid = React.memo(({ cards, onCardClick, onDragEnd, boardRef, pyramidIndex }: { 
  cards: CardType[], 
  onCardClick: (card: CardType, idx: number) => void,
  onDragEnd: (event: any, info: any, card: CardType, pyramidIndex: number, cardIndex: number) => void,
  boardRef: React.RefObject<HTMLDivElement>,
  pyramidIndex: number
}) => {
  const renderCardAt = (originalIndex: number) => {
    const card = cards.find(c => c.originalIdx === originalIndex);
    if (!card) return <div className="w-24 h-36 opacity-0" />; 
    
    return (
        <motion.div
           layoutId={card.id}
           initial={{ opacity: 0, scale: 0.5 }}
           animate={{ opacity: 1 }} 
           className={card.isFaceUp ? "relative z-30" : "relative z-0"}
        >
           <Card 
             card={card} 
             onClick={() => onCardClick(card, originalIndex)} 
             isClickable={card.isFaceUp}
             className={card.isFaceUp ? "shadow-[0_0_35px_rgba(59,130,246,0.5)]" : "opacity-90"}
             drag={card.isFaceUp}
             onDragEnd={(e, info) => onDragEnd(e, info, card, pyramidIndex, originalIndex)}
             dragConstraints={boardRef}
           />
        </motion.div>
    );
  };

  return (
    <div className="relative w-[320px] h-[250px]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-0">
        {renderCardAt(0)}
      </div>
      
      <div className="absolute top-16 left-1/2 -translate-x-1/2 flex gap-10 z-10 w-full justify-center">
        {renderCardAt(1)}
        {renderCardAt(2)}
      </div>
 
      <div className="absolute top-32 left-1/2 -translate-x-1/2 flex gap-10 z-20 w-full justify-center">
        {renderCardAt(3)}
        {renderCardAt(4)}
        {renderCardAt(5)}
      </div>
    </div>
  );
});

const Tree = ({ size }: { size: 'sm' | 'md' | 'lg' }) => {
  const scale = size === 'lg' ? 1.5 : size === 'md' ? 1.1 : 0.8;
  return (
    <div className="flex flex-col items-center" style={{ transform: `scale(${scale})` }}>
       <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-bottom-[30px] border-b-emerald-600 mb-[-15px]" />
       <div className="w-0 h-0 border-l-[30px] border-l-transparent border-r-[30px] border-r-transparent border-bottom-[40px] border-b-emerald-700 mb-[-20px]" />
       <div className="w-0 h-0 border-l-[40px] border-l-transparent border-r-[40px] border-r-transparent border-bottom-[50px] border-b-emerald-800" />
       <div className="w-4 h-6 bg-amber-900 rounded-sm" />
    </div>
  )
}
