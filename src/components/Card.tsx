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
      case 'hearts': return <Heart className={cn(size, "fill-red-600 text-red-600")} strokeWidth={1} />;
      case 'diamonds': return <Diamond className={cn(size, "fill-red-600 text-red-600")} strokeWidth={1} />;
      case 'clubs': return <Club className={cn(size, "fill-slate-900 text-slate-900")} strokeWidth={1} />;
      case 'spades': return <Spade className={cn(size, "fill-slate-900 text-slate-900")} strokeWidth={1} />;
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
        "w-9 h-14 md:w-24 md:h-36 rounded-lg md:rounded-2xl bg-blue-600 border-2 border-white/20 shadow-lg relative overflow-hidden group",
        className
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2)_0%,transparent_80%)]" />
        <div className="absolute inset-2 md:inset-3 border border-white/20 rounded-md md:rounded-xl flex items-center justify-center">
           <div className="text-white/30 font-black italic text-xl md:text-3xl">X</div>
        </div>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  const getBorderColor = () => {
    if (isRed) return "border-red-200 shadow-[0_0_15px_rgba(239,68,68,0.1)]";
    return "border-slate-200 shadow-[0_0_15px_rgba(15,23,42,0.1)]";
  };

  const getTextColor = () => {
    if (isRed) return "text-red-600";
    return "text-slate-900";
  };

  return (
    <motion.div
      drag={drag}
      onDragEnd={onDragEnd}
      dragConstraints={dragConstraints}
      dragSnapToOrigin={true}
      whileHover={isClickable && onClick ? { scale: 1.05, zIndex: 100 } : {}}
      whileTap={isClickable && onClick ? { scale: 0.95 } : {}}
      onClick={isClickable ? onClick : undefined}
      className={cn(
        "w-9 h-14 md:w-24 md:h-36 bg-white rounded-lg md:rounded-2xl border flex flex-col items-center justify-between p-1 md:p-3 relative select-none overflow-hidden",
        getBorderColor(),
        isClickable && onClick ? "cursor-pointer" : "cursor-default",
        className
      )}
    >
      <div className="absolute top-1 left-1.5 md:top-2 md:left-3 flex flex-col items-center leading-none z-10">
        <span className={cn("text-sm md:text-2xl font-black italic tracking-tighter", getTextColor())}>
          {card.rank}
        </span>
        <div className="w-4 h-4 md:w-5 md:h-5 mt-0.5">
          {getSuitIcon()}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="w-8 h-8 md:w-16 md:h-16 opacity-10">
           {getSuitIcon()}
        </div>
        <span className={cn(
          "text-3xl md:text-5xl font-display italic tracking-tighter absolute z-10",
          getTextColor()
        )}>
          {card.rank}
        </span>
      </div>

      <div className="absolute bottom-1 right-1.5 md:bottom-2 md:right-3 flex flex-col items-center leading-none rotate-180 z-10">
        <span className={cn("text-sm md:text-2xl font-black italic tracking-tighter", getTextColor())}>
          {card.rank}
        </span>
        <div className="w-4 h-4 md:w-5 md:h-5 mt-0.5">
          {getSuitIcon()}
        </div>
      </div>
    </motion.div>
  );
};
