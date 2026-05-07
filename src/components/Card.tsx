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
  style?: React.CSSProperties;
  drag?: boolean | "x" | "y";
  onDragEnd?: (event: any, info: any) => void;
  dragConstraints?: any;
  playerColor?: string;
}

export const Card = ({ card, onClick, isClickable = true, className, style, drag, onDragEnd, dragConstraints, playerColor = '#3b82f6' }: CardProps) => {
  const getSuitIcon = (size: string = "w-full h-full") => {
    const suitColor = (card.suit === 'hearts' || card.suit === 'diamonds') ? "text-red-500 fill-red-500" : "text-slate-700 fill-slate-700";
    
    switch (card.suit) {
      case 'hearts': return <Heart className={cn(size, suitColor)} strokeWidth={1} />;
      case 'diamonds': return <Diamond className={cn(size, suitColor)} strokeWidth={1} />;
      case 'clubs': return <Club className={cn(size, suitColor)} strokeWidth={1} />;
      case 'spades': return <Spade className={cn(size, suitColor)} strokeWidth={1} />;
      default: return null;
    }
  };

  const glowStyle = {
    boxShadow: `0 0 15px ${playerColor}44`,
    borderColor: `${playerColor}33`
  };

  if (!card.isFaceUp) {
    return (
      <div 
        className={cn(
          "w-[50px] h-[68px] sm:w-[58px] sm:h-[82px] md:w-[66px] md:h-[94px] lg:w-[72px] lg:h-[102px] rounded-lg md:rounded-2xl bg-white border shadow-sm relative overflow-hidden group",
          className
        )
      }
        style={{ borderColor: `${playerColor}22` }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white" />
        <div 
          className="absolute inset-1.5 md:inset-2 border-2 border-dashed rounded-md md:rounded-xl flex items-center justify-center"
          style={{ borderColor: `${playerColor}11`, backgroundColor: `${playerColor}05` }}
        >
           <div 
             className="font-black text-[10px] md:text-xl select-none tracking-widest opacity-20"
             style={{ color: playerColor }}
           >
             NEON
           </div>
        </div>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  const getBorderColor = () => {
    if (isRed) return "border-red-100 shadow-[0_2_8px_rgba(239,68,68,0.05)]";
    return "border-slate-100 shadow-[0_2_8px_rgba(15,23,42,0.05)]";
  };

  const getTextColor = () => {
    if (isRed) return "text-red-500";
    return "text-slate-700";
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
        "w-[50px] h-[68px] sm:w-[58px] sm:h-[82px] md:w-[66px] md:h-[94px] lg:w-[72px] lg:h-[102px] bg-white rounded-lg md:rounded-2xl border flex flex-col items-start p-1.5 md:p-2.5 relative select-none overflow-hidden",
        getBorderColor(),
        isClickable && onClick ? "cursor-pointer" : "cursor-default",
        className
      )}
      style={{
        ...(isClickable && onClick ? { 
          borderTopWidth: '4px', 
          borderTopColor: playerColor,
          boxShadow: `0 0 15px ${playerColor}33`
        } : {}),
        ...style
      }}
    >
      {/* Glossy overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none" />
      
      <div className="flex flex-col items-start leading-none z-10 relative">
        <span className={cn(
          "font-black italic tracking-tighter", 
          card.rank.length > 1 ? "text-[11px] md:text-2xl" : "text-[13px] md:text-2xl",
          getTextColor()
        )}>
          {card.rank}
        </span>
        <div className="w-2.5 h-2.5 md:w-5 md:h-5 mt-1 md:mt-2">
          {getSuitIcon()}
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-10 h-10 md:w-16 md:h-16 opacity-[0.03]" style={{ color: playerColor }}>
           {getSuitIcon()}
        </div>
      </div>
      
      {isClickable && onClick && (
        <div 
          className="absolute inset-x-0 bottom-0 h-1 w-full opacity-50"
          style={{ backgroundColor: playerColor }}
        />
      )}
    </motion.div>
  );
};
