import { motion, AnimatePresence } from 'motion/react';
import { ScoreEvent } from '../types';
import { cn } from '../lib/utils';

interface ScorePopProps {
  events: ScoreEvent[];
}

export const ScorePop = ({ events }: ScorePopProps) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden">
      <AnimatePresence>
        {events.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, scale: 0, x: event.x, y: event.y }}
            animate={{ 
              opacity: [0, 1, 1, 0], 
              scale: [0.5, 1.2, 1, 0.8],
              y: event.y - 150,
              x: event.x + (Math.random() * 60 - 30)
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute flex flex-col items-center justify-center pointer-events-none"
          >
            <span className={cn(
              "text-5xl font-display italic tracking-tighter drop-shadow-2xl",
              event.type === 'penalty' ? 'text-pink-500' : 
              event.type === 'bonus' ? 'text-cyan-400 text-glow' : 'text-blue-400'
            )}>
              {event.type === 'penalty' ? '' : '+'}{event.value.toLocaleString()}
            </span>
            
            {event.multiplier > 1 && (
              <motion.span 
                initial={{ rotate: -10, scale: 0 }}
                animate={{ rotate: 10, scale: 1 }}
                className="bg-cyan-400 text-cyan-950 text-[10px] font-black px-2 py-0.5 rounded-lg -mt-1 shadow-[0_0_15px_rgba(34,211,238,0.5)]"
              >
                X{event.multiplier.toFixed(1)}
              </motion.span>
            )}

            {event.label && (
              <span className="text-white text-[10px] font-black uppercase tracking-[0.3em] mt-1 opacity-80 italic">
                {event.label}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
