import React, { useState } from 'react';
import { motion } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Check, User, Save, Camera, X } from 'lucide-react';
import { cn } from '../lib/utils';

const ICONS = ['🐱', '🐶', '🦊', '🦁', '🐯', '🐼', '🐨', '🐸', '🦄', '🐲', '🐙', '🦖'];
const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
];

interface ProfileSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
  initialData?: { name?: string; color?: string; profileIcon?: string };
}

export const ProfileSetup = ({ onComplete, onCancel, initialData }: ProfileSetupProps) => {
  const [name, setName] = useState(initialData?.name || auth.currentUser?.displayName || '');
  const [selectedIcon, setSelectedIcon] = useState(initialData?.profileIcon || ICONS[0]);
  const [selectedColor, setSelectedColor] = useState(initialData?.color || COLORS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!auth.currentUser) {
      setError('Connection interrupted. Identity link lost.');
      return;
    }
    if (!name.trim()) {
      setError('Please provide a valid callsign.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await setDoc(doc(db, 'players', auth.currentUser.uid), {
        name: name.trim(),
        color: selectedColor,
        profileIcon: selectedIcon,
        updatedAt: serverTimestamp()
      }, { merge: true });
      onComplete();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Identity write failed. Retry sync.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030303]/90 backdrop-blur-3xl p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-lg glass-card rounded-[3rem] p-8 md:p-10 shadow-[0_0_100px_rgba(59,130,246,0.1)] relative overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-40 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15)_0%,transparent_70%)] pointer-events-none" />
        
        {onCancel && (
          <button 
            onClick={onCancel}
            className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors z-20 p-2 rounded-xl bg-white/5 border border-white/5"
          >
            <X size={20} />
          </button>
        )}
        
        <div className="relative z-10 text-center mb-10">
           <span className="text-[10px] font-black text-blue-400 uppercase tracking-[.4em] mb-2 block">Terminal Link</span>
           <h2 className="text-4xl md:text-5xl font-display text-white italic tracking-tighter leading-none">IDENTITY SETUP</h2>
        </div>

        <div className="space-y-8 relative z-10">
          {error && (
            <motion.div 
              initial={{ x: -10 }}
              animate={{ x: 0 }}
              className="bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Avatar Preview */}
          <div className="flex justify-center">
            <motion.div 
              animate={{ boxShadow: [`0 0 20px ${selectedColor}44`, `0 0 50px ${selectedColor}66`, `0 0 20px ${selectedColor}44`] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-28 h-28 md:w-32 md:h-32 border-4 flex items-center justify-center text-5xl md:text-6xl transition-all duration-300 relative rounded-full"
              style={{ borderColor: selectedColor, backgroundColor: `${selectedColor}11` }}
            >
               <span className="drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{selectedIcon}</span>
               <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-900 border-4 border-[#030303]">
                  <Camera size={18} />
               </div>
            </motion.div>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
             <label className="text-[8px] md:text-[10px] font-black uppercase text-blue-400/40 tracking-[0.3em] ml-1">Assigned Callsign</label>
             <input 
               type="text"
               value={name}
               onChange={(e) => setName(e.target.value)}
               className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-sans font-bold focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all outline-none text-lg text-center"
               placeholder="IDENT_USER_X"
             />
          </div>

          {/* Icon Selector */}
          <div className="space-y-3">
             <label className="text-[8px] md:text-[10px] font-black uppercase text-blue-400/40 tracking-[0.3em] text-center block w-full">Visual Matrix</label>
             <div className="grid grid-cols-6 gap-2">
                {ICONS.map(icon => (
                   <button 
                     key={icon}
                     onClick={() => setSelectedIcon(icon)}
                     className={cn(
                       "h-10 w-10 md:h-12 md:w-12 rounded-xl flex items-center justify-center text-xl md:text-2xl transition-all",
                       selectedIcon === icon ? "bg-white/10 ring-2 ring-blue-500 scale-105" : "bg-white/2 hover:bg-white/5"
                     )}
                   >
                     {icon}
                   </button>
                ))}
             </div>
          </div>

          {/* Color Selector */}
          <div className="space-y-3">
             <label className="text-[8px] md:text-[10px] font-black uppercase text-blue-400/40 tracking-[0.3em] text-center block w-full">Frequency Band</label>
             <div className="flex justify-center gap-3">
                {COLORS.map(color => (
                   <button 
                     key={color}
                     onClick={() => setSelectedColor(color)}
                     className="h-8 w-8 md:h-10 md:w-10 rounded-full flex items-center justify-center transition-all relative border-2 border-transparent"
                     style={{ backgroundColor: color }}
                   >
                     {selectedColor === color && (
                       <motion.div layoutId="color-check" className="absolute -inset-1.5 border-2 border-white rounded-full shadow-[0_0_15px_white]" />
                     )}
                   </button>
                ))}
             </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={isLoading || !name}
            className="w-full h-16 rounded-2xl bg-blue-600 text-white font-display italic text-xl flex items-center justify-center gap-3 hover:bg-blue-500 transition-all shadow-[0_10px_30px_rgba(59,130,246,0.3)] disabled:opacity-30 disabled:cursor-not-allowed group active:scale-95"
          >
            {isLoading ? <span className="animate-spin text-2xl">⏳</span> : <><Save size={20} className="group-hover:scale-125 transition-transform" /> INITIALIZE LINK</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
