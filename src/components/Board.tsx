import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScorePop } from './ScorePop';
import { ScoreEvent, Card as CardType, TableState } from '../types';
import { deal, canMoveToFoundation } from '../utils/gameLogic';
import { Card } from './Card';
import { GAME_SETTINGS, PLAYER_COLORS } from '../constants';
import { cn } from '../lib/utils';
import { Trophy, RefreshCw, Timer, SkipForward, LogOut, Zap, Shield, Settings } from 'lucide-react';
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

  const [userColor, setUserColor] = useState(PLAYER_COLORS[0]);

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
      const color = data?.color || PLAYER_COLORS[0];
      setUserColor(color);
      setDoc(playerRef, {
        name: data?.name || auth.currentUser?.displayName || `PLAYER_${auth.currentUser?.uid.slice(-4).toUpperCase()}`,
        score: state.score,
        color: color,
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
      return {
        ...prev,
        stock: ns,
        foundations: [[...prev.foundations[0], top], []], // Slot 2 is cleared on new draw
        slot2Unlocked: false
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
    <div className="flex flex-col h-[100dvh] bg-[#030712] overflow-hidden select-none relative">
      <ScorePop events={state.scoreEvents} />

      {/* ==================== HEADER ==================== */}
      <header className="shrink-0 h-14 md:h-16 border-b border-cyan-500/30 bg-black/80 backdrop-blur-md z-50 flex items-center px-4">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-cyan-400 font-black text-xl tracking-tighter">NEONX</div>
            <div>
              <span className="text-white font-bold">PHASE</span>
              <span className="text-cyan-400 font-mono ml-1.5 text-2xl">{state.currentRound}</span>
              <span className="text-white/40 font-mono">/10</span>
            </div>
          </div>

          <div className="flex items-center gap-5 font-mono">
            <div className="flex items-center gap-1.5 text-amber-400">
              <Timer className="w-4 h-4" />
              <span className="tabular-nums text-lg font-bold">
                {isNaN(state.timer) ? "0:00" : `${Math.floor(state.timer / 60)}:${(state.timer % 60).toString().padStart(2, '0')}`}
              </span>
            </div>
            
            <div className="text-white text-lg font-bold tabular-nums">
              {state.score.toLocaleString()}
            </div>
          </div>

          <button 
            onClick={onMenu}
            className="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all"
          >
            <Settings size={22} />
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

      {/* ==================== GAME AREA ==================== */}
      <main ref={boardRef} className="flex-1 flex flex-col items-center justify-center p-2 md:p-6 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/20 to-transparent pointer-events-none" />
        
        <div className="w-full h-full max-w-4xl flex flex-col">
          {/* TABLEAU / FORMATION */}
          <div className="flex-1 w-full flex items-center justify-center relative">
             <FormationLayout 
               round={state.currentRound} 
               columns={state.columns} 
               onCardClick={handleCardClick} 
               onDragEnd={handleDragEnd} 
               boardRef={boardRef} 
               errorCardId={errorCardId} 
               successCardId={successCardId}
               userColor={userColor}
             />
          </div>

          {/* Bottom Control Bar: Stock and Foundations grouped together */}
          <div className="flex items-center justify-center gap-8 py-8 shrink-0 mt-auto">
            
            {/* Stock Pile */}
            <div className="flex flex-col items-center gap-1.5 transition-all">
              <div 
                className="relative w-[50px] h-[70px] md:w-[80px] md:h-[112px] rounded-lg md:rounded-xl border-2 bg-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform overflow-hidden group"
                onClick={handleStockClick}
                style={{ borderColor: `${userColor}` }}
              >
                <div className="absolute inset-0 bg-white" />
                <div 
                  className="absolute inset-1.5 md:inset-2 border-2 border-dashed rounded-lg flex items-center justify-center"
                  style={{ borderColor: `${userColor}44`, backgroundColor: `${userColor}11` }}
                >
                  <div 
                    className="font-black text-[6px] md:text-sm tracking-[0.1em] md:tracking-[0.2em] select-none text-center"
                    style={{ color: userColor, opacity: 0.4 }}
                  >
                    NEON
                  </div>
                </div>
                {state.stock.length > 0 && (
                  <div 
                    className="absolute top-1 right-1 w-4 h-4 md:w-7 md:h-7 text-white rounded-full flex items-center justify-center border border-white/20 shadow-lg font-bold text-[8px] md:text-xs z-20"
                    style={{ backgroundColor: userColor }}
                  >
                    {state.stock.length}
                  </div>
                )}
                {/* Visual stack effect */}
                <div className="absolute -bottom-1 -right-1 w-full h-full bg-slate-200/20 rounded-xl -z-10 translate-x-1 translate-y-1" />
                <div className="absolute -bottom-2 -right-2 w-full h-full bg-slate-200/10 rounded-xl -z-20 translate-x-2 translate-y-2" />
              </div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">STOCK</span>
            </div>

            {/* Foundations (Grouped) */}
            <div className="flex items-center gap-4">
              {state?.foundations.map((foundation, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div
                    ref={idx === 0 ? foundationRef0 : foundationRef1}
                    className={cn(
                      "w-[50px] h-[70px] md:w-[80px] md:h-[112px] border-2 rounded-lg md:rounded-xl flex items-center justify-center relative overflow-hidden transition-all duration-300 shadow-inner",
                      foundation.length > 0 ? "bg-white border-white shadow-lg" : "bg-black/20 border-white/5 border-dashed"
                    )}
                  >
                    {foundation.length > 0 ? (
                      <Card card={foundation[foundation.length - 1]} isClickable={false} className="w-full h-full border-0 rounded-none" playerColor={userColor} />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-white/5 opacity-50">
                        {idx === 0 ? <Trophy size={20} /> : <Zap size={20} />}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-1">{idx === 0 ? 'BASE' : 'NEON'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Minimalistic status bar instead of footer */}
      <div className="h-4 bg-black/40 w-full" />
    </div>
  );
};

const FormationLayout = React.memo(({ round, columns, onCardClick, onDragEnd, boardRef, errorCardId, successCardId, userColor }: any) => {
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
      y = (isMobile ? 12 : 18) + r * (isMobile ? 10 : 15);
    } else if (round === 2) {
      const angle = (pileIdx / (totalPiles - 1)) * (Math.PI * 0.7) - (Math.PI * 0.85);
      const rx = isSmallMobile ? 32 : (isMobile ? 36 : 40), ry = isSmallMobile ? 20 : (isMobile ? 24 : 28);
      x = 50 + Math.cos(angle) * rx; y = (isMobile ? 40 : 45) + Math.sin(angle) * ry; rotate = (angle * 180) / Math.PI + 90;
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
    } else if (round === 7) {
      // Zig-zag formation
      const isTop = pileIdx < totalPiles / 2;
      const idxInRow = isTop ? pileIdx : (pileIdx - Math.floor(totalPiles / 2));
      const spX = isMobile ? 18 : 22;
      x = 50 + (idxInRow - (totalPiles / 4)) * spX;
      y = (isTop ? 15 : 35) + (isMobile ? 5 : 10);
      rotate = isTop ? 5 : -5;
    } else if (round === 8) {
      // V-Formation
      const half = totalPiles / 2;
      const distFromCenter = Math.abs(pileIdx - half);
      x = 50 + (pileIdx - half) * (isMobile ? 12 : 16);
      y = (isMobile ? 10 : 15) + (distFromCenter * (isMobile ? 6 : 8));
      rotate = (pileIdx - half) * 5;
    } else if (round === 9) {
      // Double arc
      const isOuter = pileIdx < totalPiles / 2;
      const arcIdx = isOuter ? pileIdx : (pileIdx - Math.floor(totalPiles / 2));
      const arcTotal = isOuter ? Math.floor(totalPiles/2) : (totalPiles - Math.floor(totalPiles/2));
      const angle = (arcIdx / (arcTotal - 1)) * Math.PI - Math.PI;
      const rx = isOuter ? (isMobile ? 38 : 45) : (isMobile ? 25 : 30);
      const ry = isOuter ? (isMobile ? 25 : 30) : (isMobile ? 15 : 18);
      x = 50 + Math.cos(angle) * rx;
      y = (isMobile ? 35 : 40) + Math.sin(angle) * ry;
      rotate = (angle * 180) / Math.PI + 90;
    } else {
      // Round 10: X-formation or random-ish grid
      const isD1 = pileIdx < totalPiles / 2;
      const idx = isD1 ? pileIdx : (pileIdx - Math.floor(totalPiles / 2));
      const offset = (idx - 2.5) * (isMobile ? 15 : 20);
      x = 50 + (isD1 ? offset : -offset);
      y = (isMobile ? 25 : 30) + Math.abs(offset) * 0.5;
      rotate = isD1 ? 45 : -45;
    }
    return { x, y, rotate };
  };

  return (
    <div ref={containerRef} className="relative w-full h-full max-w-4xl mx-auto overflow-hidden px-1">
       <div className="relative w-full h-full">
          {columns.map((p, pIdx) => {
             const anchor = getAnchor(pIdx, columns.length);
             return (
               <React.Fragment key={`p-${pIdx}`}>
                 {p.map((c, cIdx) => (
                   <motion.div key={c.id} className="absolute" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: successCardId === c.id ? 1.2 : (isSmallMobile ? 0.95 : 1), x: errorCardId === c.id ? [0, -10, 10, -10, 10, 0] : (cIdx * 1) }} style={{ left: `${anchor.x}%`, top: `${anchor.y}%`, transform: `translate(-50%, ${cIdx * (isMobile ? 8 : 20)}px) rotate(${anchor.rotate + (cIdx * 0.5)}deg)`, zIndex: 10 + (pIdx * 5) + cIdx }} transition={{ type: "spring", damping: 25, stiffness: 200, delay: pIdx * 0.04 }}>
                     <Card 
                       card={c} 
                       onClick={() => onCardClick(c, pIdx, cIdx)} 
                       isClickable={c.isFaceUp && cIdx === p.length - 1} 
                       className={cn(
                         "transition-all duration-300", 
                         (c.isFaceUp && cIdx === p.length - 1) ? "ring-1 ring-opacity-30 cursor-pointer" : "brightness-[0.9] opacity-100"
                       )} 
                       style={(c.isFaceUp && cIdx === p.length - 1) ? { 
                         boxShadow: `0 0 20px ${userColor}33`,
                         borderColor: `${userColor}44`,
                         backgroundColor: `#fff`
                       } : {}}
                       drag={c.isFaceUp && cIdx === p.length - 1} 
                       onDragEnd={(e, info) => onDragEnd(e, info, c, pIdx, cIdx)} 
                       dragConstraints={boardRef} 
                       playerColor={userColor}
                     />
                   </motion.div>
                 ))}
               </React.Fragment>
             );
          })}
       </div>
    </div>
  );
});
