import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Play, Info } from 'lucide-react';
import { cn } from '../lib/utils';

interface TutorialProps {
  onClose: () => void;
}

const steps = [
  {
    title: "Welcome to Elevate",
    content: "An elite arcade spin on Golf Solitaire. Your goal is to clear the board by moving cards to the foundation.",
    icon: <Play className="w-8 h-8 text-blue-400" />
  },
  {
    title: "How to Play",
    content: "Tap any face-up card that is exactly ONE value higher or lower than the top card of the foundation. (e.g., if foundation is 7, you can play 6 or 8).",
    icon: <Play className="w-8 h-8 text-green-400" />
  },
  {
    title: "Dual Foundations",
    content: "Foundation Slot 1 is always active. Build a STREAK of 3 moves to unlock Slot 2. Using Slot 2 allows complex strategic pivots!",
    icon: <Play className="w-8 h-8 text-yellow-400" />
  },
  {
    title: "Dynamic Formations",
    content: "Each round features a unique card layout—Pyramids, Stars, and Waves. Clear the board before time runs out to earn massive bonuses.",
    icon: <Play className="w-8 h-8 text-purple-400" />
  },
  {
    title: "Multiplayer Sync",
    content: "Compete with friends! Game rounds and scores are synced in real-time. The fastest player to clear the board dominates the leaderboard.",
    icon: <Play className="w-8 h-8 text-red-400" />
  }
];

export const Tutorial: React.FC<TutorialProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleFinish = () => {
    localStorage.setItem('elevate_tutorial_completed', 'true');
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        >
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <div className="bg-blue-500/20 p-2 rounded-lg">
                  <Info className="w-5 h-5 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">How to Elevate</h2>
              </div>
              <button 
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors"
                id="close-tutorial"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="min-h-[160px] flex flex-col items-center text-center">
              <motion.div 
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col items-center"
              >
                <div className="mb-4 p-4 bg-zinc-800/50 rounded-full">
                  {steps[currentStep].icon}
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-2">
                  {steps[currentStep].title}
                </h3>
                <p className="text-zinc-400 leading-relaxed italic">
                  "{steps[currentStep].content}"
                </p>
              </motion.div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === currentStep ? "w-6 bg-blue-500" : "w-1.5 bg-zinc-700"
                    )}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                {currentStep > 0 && (
                  <button 
                    onClick={() => setCurrentStep(prev => prev - 1)}
                    className="p-2 text-zinc-400 hover:text-white transition-colors"
                    id="prev-step"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}
                
                {currentStep < steps.length - 1 ? (
                  <button 
                    onClick={() => setCurrentStep(prev => prev + 1)}
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-all"
                    id="next-step"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button 
                    onClick={handleFinish}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20"
                    id="finish-tutorial"
                  >
                    Let's Play
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
