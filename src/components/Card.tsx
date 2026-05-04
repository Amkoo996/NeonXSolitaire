import React from 'react';
import { motion } from 'motion/react';
import { Card as CardType } from '../types';
import { cn } from '../lib/utils';
import { Heart, Diamond, Club, Spade } from 'lucide-react';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  isClickable?: boolean;
  className?: string;
  drag?: boolean | "x" | "y";
  onDragEnd?: (event: any, info: any) => void;
  dragConstraints?: any;
}

export const Card = ({ card, onClick, isClickable = true, className, drag, onDragEnd, dragConstraints }: CardProps) => {
  const getSuitIcon = (size: string = "w-full h-full") => {
    switch (card.suit) {
      case 'hearts': return <Heart className={cn(size, "fill-pink-400 text-pink-400 [filter:drop-shadow(0_0_8px_rgba(236,72,153,1))]")} strokeWidth={1.5} />;
      case 'diamonds': return <Diamond className={cn(size, "fill-blue-400 text-blue-400 [filter:drop-shadow(0_0_8px_rgba(59,130,246,1))]")} strokeWidth={1.5} />;
      case 'clubs': return <Club className={cn(size, "fill-emerald-400 text-emerald-400 [filter:drop-shadow(0_0_8px_rgba(16,185,129,1))]")} strokeWidth={1.5} />;
      case 'spades': return <Spade className={cn(size, "fill-violet-400 text-violet-400 [filter:drop-shadow(0_0_8px_rgba(139,92,246,1))]")} strokeWidth={1.5} />;
      default: return null;
    }
  };

  const isPink = card.suit === 'hearts';
  const isBlue = card.suit === 'diamonds';
  const isEmerald = card.suit === 'clubs';
  const isViolet = card.suit === 'spades';

  if (!card.isFaceUp) {
    return (
      <div className={cn(
        "w-20 h-28 md:w-24 md:h-36 rounded-xl md:rounded-2xl bg-[#2a2a2a] border-2 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)] relative overflow-hidden group",
        className
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.1)_0%,transparent_80%)]" />
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        
        {/* Animated circuit lines on card back */}
        <div className="absolute inset-0 opacity-20">
           <motion.div 
             animate={{ x: [-100, 200] }}
             transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
             className="h-[1px] w-full bg-blue-500 absolute top-1/4" 
           />
           <motion.div 
             animate={{ x: [200, -100] }}
             transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
             className="h-[1px] w-full bg-blue-400 absolute bottom-1/4" 
           />
        </div>

        <div className="absolute inset-2 md:inset-3 border border-blue-500/10 rounded-lg md:rounded-xl flex items-center justify-center">
           <div className="w-8 h-8 md:w-12 md:h-12 flex items-center justify-center relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border border-blue-500/20 rounded-full"
              />
              <div className="text-blue-500/50 font-black italic text-xl md:text-3xl">X</div>
           </div>
        </div>
      </div>
    );
  }

  const getBorderColor = () => {
    if (isPink) return "border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.2)]";
    if (isBlue) return "border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]";
    if (isEmerald) return "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]";
    return "border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.2)]";
  };

  const getTextColor = () => {
    if (isPink) return "text-pink-500";
    if (isBlue) return "text-blue-500";
    if (isEmerald) return "text-emerald-500";
    return "text-violet-500";
  };

  return (
    <motion.div
      drag={drag}
      onDragEnd={onDragEnd}
      dragConstraints={dragConstraints}
      dragSnapToOrigin={true}
      whileHover={isClickable && onClick ? { y: -8, scale: 1.05, rotateZ: 2, zIndex: 50, transition: { type: "spring", stiffness: 300 } } : {}}
      whileTap={isClickable && onClick ? { scale: 0.95 } : {}}
      onClick={isClickable ? onClick : undefined}
      className={cn(
        "w-20 h-28 md:w-24 md:h-36 bg-[#333333] rounded-xl md:rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-between p-2 md:p-3 relative select-none overflow-hidden backdrop-blur-md",
        getBorderColor(),
        isClickable && onClick ? "cursor-pointer" : "cursor-default",
        className
      )}
    >
      {/* Background Glow */}
      <div className={cn("absolute inset-0 opacity-5", isPink ? "bg-pink-500" : isBlue ? "bg-blue-500" : isEmerald ? "bg-emerald-500" : "bg-violet-500")} />
      
      <div className="absolute top-1.5 left-2 md:top-2 md:left-3 flex flex-col items-center leading-none z-10">
        <span className={cn("text-xs md:text-sm font-black italic tracking-tighter drop-shadow-sm", getTextColor())}>
          {card.rank}
        </span>
        <div className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 mt-0.5">
          {getSuitIcon()}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center -mt-1 relative z-10">
        <div className="relative group/icon">
          <div className={cn("absolute inset-0 blur-xl opacity-20 transition-all", getTextColor())}>
             {getSuitIcon("w-12 h-12 md:w-16 md:h-16")}
          </div>
          <span className={cn(
            "text-3xl md:text-5xl font-display italic tracking-tighter opacity-95 text-glow relative z-10",
            getTextColor()
          )}>
            {card.rank}
          </span>
        </div>
      </div>

      <div className="absolute bottom-1.5 right-2 md:bottom-2 md:right-3 flex flex-col items-center leading-none rotate-180 opacity-40 z-10">
        <span className={cn("text-[10px] md:text-xs font-black italic", getTextColor())}>
          {card.rank}
        </span>
        <div className="w-3 h-3 md:w-4 md:h-4">
          {getSuitIcon()}
        </div>
      </div>
      
      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
    </motion.div>
  );
};
