import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScorePop } from './ScorePop';
import { ScoreEvent, Card as CardType, TableState } from '../types';
import { deal, canMoveToFoundation } from '../utils/gameLogic';
import { Card } from './Card';
import { GAME_SETTINGS, PLAYER_COLORS } from '../constants';
import { cn } from '../lib/utils';
import { Trophy, RefreshCw, Timer, SkipForward, LogOut, Zap, Shield } from 'lucide-react';
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
  const [initialTime, setInitialTime] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [consecutiveMoves, setConsecutiveMoves] = useState(0);
  const [diamonds, setDiamonds] = useState<boolean[]>([]); 
  const [showSummary, setShowSummary] = useState(false);
  const [errorCardId, setErrorCardId] = useState<string | null>(null);
  const [successCardId, setSuccessCardId] = useState<string | null>(null);
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
      opponents: state ? state.opponents : [],
    });
    setInitialTime(roundTime);
    setDiamonds(new Array(tableData.columns.length).fill(false));
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

    const timeout = setTimeout(syncScore, 1000);
    return () => clearTimeout(timeout);
  }, [state?.score, auth.currentUser?.uid, roomId]);

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

    const pile = state.columns[pileIndex];
    if (cardIndex !== pile.length - 1) return;

    if (state.currentRound === 1) {
       const rows = [1, 2, 3, 4, 5];
       let myRow = 0, myPInR = 0, count = 0;
       for (let r = 0; r < rows.length; r++) {
         if (pileIndex >= count && pileIndex < count + rows[r]) {
           myRow = r; myPInR = pileIndex - count; break;
         }
         count += rows[r];
       }
       if (myRow < 4) {
         const nextStart = count + rows[myRow];
         const isBlocked = (state.columns[nextStart + myPInR]?.length > 0) || (state.columns[nextStart + myPInR + 1]?.length > 0);
         if (isBlocked) return;
       }
    }

    const slot1Top = state.foundations[0][state.foundations[0].length - 1];
    const slot2Top = state.foundations[1].length > 0 ? state.foundations[1][state.foundations[1].length - 1] : null;

    const canToSlot1 = canMoveToFoundation(card, slot1Top);
    const canToSlot2 = slot2Top ? canMoveToFoundation(card, slot2Top) : false;

    if (canToSlot1 || canToSlot2) {
      playBeep(523.25 + (consecutiveMoves * 50), 0.2); 
      setSuccessCardId(card.id);
      setTimeout(() => setSuccessCardId(null), 300);
      
      const newConsecutive = consecutiveMoves + 1;
      setConsecutiveMoves(newConsecutive);
      
      const basePoints = 2000 + (currentRound * 1000);
      const moveScore = Math.floor(basePoints * (1 + (newConsecutive * 0.5)) * (currentRound >= 9 ? 1.5 : 1));
      
      let updatedStock = [...state.stock];
      let updatedFoundations = [...state.foundations];
      let slot2JustUnlocked = false;

      const newCols = state.columns.map((p, i) => {
        if (i === pileIndex) {
          const up = p.filter(c => c.id !== card.id);
          if (up.length > 0) up[up.length - 1].isFaceUp = true;
          return up;
        }
        return p;
      });

      if (state.currentRound === 1) {
        const rows = [1, 2, 3, 4, 5];
        newCols.forEach((p, i) => {
          if (p.length > 0 && !p[p.length - 1].isFaceUp) {
            let rIdx = 0, colR = 0, count = 0;
            for (let r = 0; r < rows.length; r++) {
              if (i >= count && i < count + rows[r]) { rIdx = r; colR = i - count; break; }
              count += rows[r];
            }
            if (rIdx < 4) {
              const ns = count + rows[rIdx];
              if (!(newCols[ns + colR]?.length > 0 || newCols[ns + colR + 1]?.length > 0)) {
                p[p.length - 1].isFaceUp = true;
              }
            }
          }
        });
      }

      const tar = canToSlot1 ? 0 : 1;
      updatedFoundations[tar] = [...updatedFoundations[tar], card];

      if (newConsecutive === 3 && updatedStock.length > 0) {
        const bonus = updatedStock.pop()!;
        bonus.isFaceUp = true;
        updatedFoundations[1] = [bonus];
        slot2JustUnlocked = true;
        playBeep(659.25, 0.3, 'square');
      }
      
      if (newCols[pileIndex].length === 0 && !diamonds[pileIndex]) {
        const nd = [...diamonds]; nd[pileIndex] = true; setDiamonds(nd);
        addScoreEvent(5000, 1, 512, 384, 'bonus', 'DIAMOND UNLOCKED!');
      }

      setState({
        ...state,
        columns: newCols,
        foundations: updatedFoundations,
        stock: updatedStock,
        score: state.score + moveScore,
        slot2Unlocked: state.slot2Unlocked || slot2JustUnlocked
      });

      addScoreEvent(moveScore, 1, 512, 384, 'score');
      if (slot2JustUnlocked) addScoreEvent(2500, 1, 512, 400, 'bonus', 'NEON STACK ACTIVE!');
      if (newCols.every(p => p.length === 0)) setIsFinishing(true);
    } else {
      setErrorCardId(card.id);
      setTimeout(() => setErrorCardId(null), 500);
      const p = Math.floor((2000 + (currentRound * 1000)) / 2);
      addScoreEvent(-p, 1, 512, 384, 'penalty', 'WRONG MOVE!');
      setState(prev => prev ? { ...prev, score: Math.max(0, prev.score - p) } : null);
      playBeep(110, 0.2, 'square');
    }
  };

  const handleStockClick = () => {
    if (!state || state.stock.length === 0 || isFinishing || showSummary) return;
    playBeep(261.63, 0.15);
    const ns = [...state.stock];
    const top = ns.pop()!;
    top.isFaceUp = true;
    setConsecutiveMoves(0);
    setState(prev => {
      if (!prev) return null;
      const hasBonus = prev.foundations[1].length > 0;
      return {
        ...prev,
        stock: ns,
        foundations: [[...prev.foundations[0], top], prev.foundations[1]],
        slot2Unlocked: hasBonus
      };
    });
  };

  useEffect(() => {
    if (isFinishing && state && !showSummary) handleFinish();
  }, [isFinishing, state, showSummary]);

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (!state || isFinishing || showSummary) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (!prev) return null;
        if (prev.timer <= 1) { setIsFinishing(true); return { ...prev, timer: 0 }; }
        const nt = prev.timer - 1;
        if (nt <= 10 && nt > 0) playBeep(nt <= 3 ? 880 : 660, 0.1, 'square');
        return { ...prev, timer: nt };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state === null, isFinishing, showSummary]);

  if (!state) return null;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div ref={boardRef} className="w-full h-[100dvh] bg-[#030303] relative overflow-hidden flex flex-col shadow-[0_0_100px_rgba(59,130,246,0.1)] border-white/5 select-none font-sans">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15)_0%,transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        <motion.div animate={{ opacity: [0.05, 0.15, 0.05] }} transition={{ duration: 4, repeat: Infinity }} className="absolute inset-0 bg-blue-500/5" />
      </div>

      <ScorePop events={state.scoreEvents} />

      {/* Header - 8-10% height on mobile */}
      <header className="h-[8dvh] md:h-24 w-full flex items-center justify-between px-3 md:px-12 z-40 bg-[#030303]/80 backdrop-blur-md border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 md:gap-8">
           <div className="flex flex-col">
             <span className="text-[7px] md:text-[10px] font-black uppercase text-blue-400/60 tracking-[0.2em]">Phase</span>
             <span className="text-sm md:text-3xl font-display text-white italic">{state.currentRound}<span className="text-blue-500 text-[10px] md:text-lg ml-0.5">/10</span></span>
           </div>
           <div className="h-4 md:h-12 w-px bg-white/10" />
           <div className="flex flex-col">
             <span className="text-[7px] md:text-[10px] font-black uppercase text-blue-400/60 tracking-[0.2em]">Score</span>
             <span className="text-sm md:text-3xl font-display text-amber-500 italic tabular-nums">{state.score.toLocaleString()}</span>
           </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
           <div className="hidden sm:flex flex-col items-center px-1.5 md:px-4 py-0.5 md:py-1 rounded-lg md:rounded-xl bg-white/5 border border-white/5">
              <div className="flex gap-0.5 md:gap-1">
                 {diamonds.map((d, i) => (
                   <div key={i} className={cn("w-1 h-1 md:w-3 md:h-3 rotate-45 border border-blue-400/30", d ? "bg-cyan-400 shadow-[0_0_8px_cyan]" : "bg-white/5")} />
                 ))}
              </div>
           </div>
           
           <div className="flex flex-col items-end w-12 md:w-40 relative">
              <div className="flex items-center gap-1 md:gap-2 relative">
                 <span className={cn("text-xs md:text-3xl font-display italic tabular-nums z-10", state.timer < 15 ? "text-red-500 animate-pulse" : "text-white")}>
                    {isNaN(state.timer) ? "0:00" : `${Math.floor(state.timer / 60)}:${(state.timer % 60).toString().padStart(2, '0')}`}
                 </span>
              </div>
              <div className="w-full h-0.5 md:h-1 bg-white/10 rounded-full mt-0.5 overflow-hidden">
                 <motion.div initial={false} animate={{ width: `${(state.timer / initialTime) * 100}%`, backgroundColor: state.timer < 30 ? "#ef4444" : "#3b82f6" }} className="h-full" />
              </div>
           </div>

           <button onClick={onMenu} className="w-7 h-7 md:w-12 md:h-12 rounded-lg bg-white/5 text-slate-400 flex items-center justify-center hover:bg-red-500/20 border border-white/10">
              <LogOut size={14} />
           </button>
        </div>
      </header>

      <AnimatePresence>
        {(state.columns.every(p => p.length === 0) || (state.stock.length === 0)) && !showSummary && !isFinishing && (
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleFinish} className="px-6 py-3 md:px-12 md:py-6 bg-blue-600 text-white rounded-full font-black italic text-xl md:text-3xl shadow-2xl border-2 border-white/20 flex items-center gap-2">
              <span>{state.columns.every(p => p.length === 0) ? "COMPLETE" : "FINISH"}</span>
              <SkipForward size={isMobile ? 24 : 40} />
            </motion.button>
          </motion.div>
        )}

        {showSummary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-2xl px-3 md:px-4">
            <motion.div initial={{ y: 50, scale: 0.9 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-lg p-5 md:p-12 rounded-3xl md:rounded-[4rem] bg-black/60 border-2 border-white/10 shadow-2xl text-center relative overflow-y-auto max-h-[90dvh] no-scrollbar">
              <h2 className="text-xl md:text-5xl font-black text-white italic mb-4 md:mb-12 tracking-tighter uppercase underline decoration-blue-500/50 underline-offset-8">Results</h2>
              <div className="space-y-2 md:space-y-6 mb-4 md:mb-12">
                 <div className="flex justify-between items-center text-[10px] md:text-2xl font-bold bg-white/5 p-3 md:p-6 rounded-xl md:rounded-3xl border border-white/5">
                    <span className="text-blue-400 italic">Base</span>
                    <span className="text-white tabular-nums">{state.score.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px] md:text-2xl font-bold bg-white/5 p-3 md:p-6 rounded-xl md:rounded-3xl border border-white/5">
                    <span className="text-cyan-400 italic">Diamonds</span>
                    <CountingValue value={bonusCalculation.diamonds} delay={0.5} onTick={() => playBeep(660, 0.05)} />
                 </div>
                 <div className="flex justify-between items-center text-[10px] md:text-2xl font-bold bg-white/5 p-3 md:p-6 rounded-xl md:rounded-3xl border border-white/5">
                    <span className="text-emerald-400 italic">Time</span>
                    <CountingValue value={bonusCalculation.time} delay={1} onTick={() => playBeep(880, 0.05)} />
                 </div>
              </div>
              <div className="flex justify-between items-center mb-6 md:mb-12 px-2">
                 <span className="text-xs md:text-3xl font-black text-blue-500 italic uppercase">Total</span>
                 <motion.span className="text-2xl md:text-6xl font-black text-white italic tabular-nums"><CountingValue value={bonusCalculation.total} delay={1.5} /></motion.span>
              </div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleNextRound} className="w-full py-4 md:py-8 bg-white text-slate-950 rounded-xl font-black italic text-base md:text-3xl shadow-xl">NEXT PHASE</motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Area - 60-65% height on mobile */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10 overflow-hidden py-2 px-2 md:py-4 min-h-0">
          <div className="w-full h-full flex items-center justify-center relative touch-none max-w-md mx-auto">
             <FormationLayout round={state.currentRound} columns={state.columns} onCardClick={handleCardClick} onDragEnd={handleDragEnd} boardRef={boardRef} errorCardId={errorCardId} successCardId={successCardId} />
          </div>
      </div>

      {/* Control Panel - Guaranteed visibility on mobile */}
      <footer className="h-[22dvh] min-h-[140px] md:h-40 w-full bg-[#030303]/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-between px-3 md:px-20 z-50 relative shrink-0">
          <div className="hidden md:flex absolute left-4 top-0 bottom-0 flex-col justify-center pointer-events-none">
             {state.opponents.slice(0, 3).map(opp => (
               <div key={opp.id} className="flex items-center gap-2 mb-1 text-[8px] font-black text-white/40 uppercase tracking-widest">
                 <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opp.color || '#fff' }} /> {opp.name}: {opp.score}
               </div>
             ))}
          </div>

          <div className="flex items-center gap-4 md:gap-12 mx-auto w-full max-w-sm justify-center py-2">
            <div className="flex items-center gap-3 md:gap-8 justify-center">
              {/* Stock */}
              <div className="flex flex-col items-center gap-1">
                <div className="relative group cursor-pointer active:scale-95 transition-transform" onClick={handleStockClick}>
                    <Card card={{ id: 'back', suit: 'hearts', rank: 'A', value: 1, isFaceUp: false }} isClickable={false} className="shadow-[0_0_20px_rgba(37,99,235,0.3)] ring-1 ring-blue-500/20" />
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 md:w-10 md:h-10 bg-blue-600 rounded-full flex items-center justify-center border-2 border-[#030303] shadow-lg">
                      <span className="text-[10px] md:text-sm font-black text-white tabular-nums">{state.stock.length}</span>
                    </div>
                </div>
              </div>

              {/* Foundations */}
              <div className="flex items-center gap-2 md:gap-6">
                  <div className="flex flex-col items-center gap-1">
                    <div ref={foundationRef0} className="w-[48px] h-[70px] sm:w-[58px] sm:h-[82px] md:w-28 md:h-40 bg-white/5 rounded-lg md:rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden group shadow-inner">
                       <div className="absolute inset-0 bg-blue-500/5 transition-colors" />
                       <AnimatePresence mode="popLayout">
                          {state.foundations[0].length > 0 && (
                            <motion.div key={`f0-${state.foundations[0][state.foundations[0].length - 1].id}`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-full relative z-10">
                              <Card card={{...state.foundations[0][state.foundations[0].length - 1], isFaceUp: true}} isClickable={false} className="w-full h-full border-0 rounded-none bg-transparent" />
                            </motion.div>
                          )}
                       </AnimatePresence>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <div ref={foundationRef1} className={cn("w-[48px] h-[70px] sm:w-[58px] sm:h-[82px] md:w-28 md:h-40 rounded-lg md:rounded-2xl border flex items-center justify-center relative overflow-hidden transition-all duration-500", state.slot2Unlocked ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]" : "bg-black/40 border-white/5 grayscale")}>
                       <AnimatePresence mode="popLayout">
                          {state.foundations[1].length > 0 ? (
                            <motion.div key={`f1-${state.foundations[1][state.foundations[1].length - 1].id}`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-full relative z-10">
                              <Card card={{...state.foundations[1][state.foundations[1].length - 1], isFaceUp: true}} isClickable={false} className="w-full h-full border-0 rounded-none bg-transparent" />
                            </motion.div>
                          ) : (
                            <div className="text-white/10 flex flex-col items-center gap-1">
                              {state.slot2Unlocked ? <Zap size={16} className="text-amber-500 animate-pulse" /> : <Shield size={16} className="opacity-20" />}
                            </div>
                          )}
                       </AnimatePresence>
                    </div>
                  </div>
              </div>
            </div>
          </div>
      </footer>
    </div>
  );
};

const FormationLayout = React.memo(({ round, columns, onCardClick, onDragEnd, boardRef, errorCardId, successCardId }: any) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const isSmallMobile = typeof window !== 'undefined' && window.innerWidth < 400;

  const getAnchor = (pileIdx: number, totalPiles: number) => {
    let x = 50, y = 50, rotate = 0;
    if (round === 1) {
      const rows = [1, 2, 3, 4, 5];
      let r = 0, pCount = 0;
      for (; r < rows.length; r++) { if (pileIdx >= pCount && pileIdx < pCount + rows[r]) break; pCount += rows[r]; }
      const cInR = pileIdx - pCount;
      const spX = isSmallMobile ? 14 : (isMobile ? 16 : 15);
      const rowW = rows[r] * spX;
      x = 50 + (cInR * spX) - (rowW / 2) + (spX / 2);
      y = (isMobile ? 5 : 10) + r * (isMobile ? 10 : 15);
    } else if (round === 2) {
      const angle = (pileIdx / (totalPiles - 1)) * Math.PI - Math.PI;
      const rx = isSmallMobile ? 32 : (isMobile ? 38 : 45), ry = isSmallMobile ? 20 : (isMobile ? 25 : 30);
      x = 50 + Math.cos(angle) * rx; y = (isMobile ? 45 : 52) + Math.sin(angle) * ry; rotate = (angle * 180) / Math.PI + 90;
    } else if (round === 3) {
      const isL = pileIdx < totalPiles / 2;
      const lIdx = isL ? pileIdx : pileIdx - totalPiles / 2;
      const rows = [1, 2, 3];
      let r = 0, pC = 0;
      for (; r < rows.length; r++) { if (lIdx >= pC && lIdx < pC + rows[r]) break; pC += rows[r]; }
      const spX = isSmallMobile ? 10 : 12;
      x = (isL ? 25 : 75) + ((lIdx - pC) * spX) - ((rows[r] * spX) / 2) + (spX / 2);
      y = (isMobile ? 10 : 15) + r * (isMobile ? 12 : 18);
    } else if (round === 4) {
      const angle = (pileIdx / totalPiles) * Math.PI * 2;
      const dist = (pileIdx % 2 === 0) ? (isSmallMobile ? 25 : (isMobile ? 30 : 35)) : (isSmallMobile ? 12 : (isMobile ? 15 : 20));
      x = 50 + Math.cos(angle) * dist; y = (isMobile ? 40 : 50) + Math.sin(angle) * (dist * (isMobile ? 0.4 : 0.7)); rotate = (angle * 180) / Math.PI;
    } else if (round === 5 || round === 6) {
      x = (pileIdx + 1) * (100 / (totalPiles + 1)); y = (isMobile ? 15 : 20) + Math.sin(pileIdx * (round === 6 ? 1 : 0)) * 10; rotate = Math.cos(pileIdx * (round === 6 ? 1 : 0)) * 10;
    } else {
      const cols = isMobile ? (isSmallMobile ? 4 : 5) : 5;
      const r = Math.floor(pileIdx / cols), c = pileIdx % cols;
      x = (c + 0.5) * (100 / Math.min(totalPiles, cols)); y = (isMobile ? 10 : 15) + r * (isMobile ? 12 : 22);
    }
    return { x, y, rotate };
  };

  return (
    <div ref={containerRef} className="relative w-full h-full max-w-lg mx-auto overflow-hidden px-1">
       <div className="relative w-full h-full">
          {columns.map((p, pIdx) => {
             const anchor = getAnchor(pIdx, columns.length);
             return (
               <React.Fragment key={`p-${pIdx}`}>
                 {p.map((c, cIdx) => (
                   <motion.div key={c.id} className="absolute" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: successCardId === c.id ? 1.2 : (isSmallMobile ? 0.95 : 1), x: errorCardId === c.id ? [0, -10, 10, -10, 10, 0] : 0 }} style={{ left: `${anchor.x}%`, top: `${anchor.y}%`, transform: `translate(-50%, ${cIdx * (isMobile ? 8 : 20)}px) rotate(${anchor.rotate}deg)`, zIndex: 10 + (pIdx * 5) + cIdx }} transition={{ type: "spring", damping: 25, stiffness: 200, delay: pIdx * 0.04 }}>
                     <Card card={c} onClick={() => onCardClick(c, pIdx, cIdx)} isClickable={c.isFaceUp && cIdx === p.length - 1} className={cn("transition-all duration-300", (c.isFaceUp && cIdx === p.length - 1) ? "shadow-[0_0_20px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/30 cursor-pointer" : "brightness-[0.7] opacity-95")} drag={c.isFaceUp && cIdx === p.length - 1} onDragEnd={(e, info) => onDragEnd(e, info, c, pIdx, cIdx)} dragConstraints={boardRef} />
                   </motion.div>
                 ))}
               </React.Fragment>
             );
          })}
       </div>
    </div>
  );
});
