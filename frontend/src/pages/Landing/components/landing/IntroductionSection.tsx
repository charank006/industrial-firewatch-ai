import React, { useState } from 'react';

export const IntroductionSection: React.FC = () => {
  const [showContext, setShowContext] = useState(false);

  return (
    <section className="w-full max-w-7xl mx-auto px-8 md:px-12 pt-32">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
        
        {/* Copy Left */}
        <div>
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-mono font-bold text-white tracking-[0.1em] uppercase leading-tight mb-8">
            THERMAL DETECTION<br/>IS ONLY<br/>THE BEGINNING.
          </h2>
          <p className="text-sm md:text-base font-sans text-[#A7B4C1] leading-relaxed max-w-lg mb-12">
            Satellite observations can identify unusual heat. GeoFlare adds the spatial and temporal context required to distinguish persistent industrial activity from potentially significant thermal events.
          </p>
          
          <button 
            onClick={() => setShowContext(!showContext)}
            className="flex items-center gap-4 px-6 py-3 border border-[#3DB7D9]/30 bg-[#3DB7D9]/10 hover:bg-[#3DB7D9]/20 transition-colors rounded-sm cursor-pointer focus-visible:outline focus-visible:outline-[#3DB7D9]"
          >
            <span className="font-mono text-xs font-bold text-white tracking-widest uppercase">
              {showContext ? 'VIEW RAW SIGNAL' : 'ADD CONTEXT'}
            </span>
            <div className={`w-3 h-3 rounded-full transition-colors ${showContext ? 'bg-[#3DB7D9]' : 'bg-[#FF3B30] animate-pulse'}`} />
          </button>
        </div>

        {/* Visual Right */}
        <div className="w-full aspect-square max-h-[500px] border border-[#253340] rounded-xl flex items-center justify-center bg-[#0D151E] relative overflow-hidden">
          
          {/* Signal */}
          <div className="absolute z-30 w-4 h-4 bg-[#FF3B30] rounded-full shadow-[0_0_20px_#FF3B30] animate-pulse" />
          <div className="absolute z-30 w-1.5 h-1.5 bg-white rounded-full" />

          {/* Context Layers */}
          <div className={`absolute inset-0 transition-opacity duration-700 ${showContext ? 'opacity-100' : 'opacity-0'}`}>
            
            {/* Grid */}
            <div className="absolute inset-0 border-[0.5px] border-[#253340] opacity-30 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
            
            {/* Facility Outline */}
            <div className="absolute top-1/2 left-1/2 -translate-x-[40%] -translate-y-[60%] w-32 h-24 border border-white/20 bg-white/5 backdrop-blur-[2px]" />
            
            {/* History */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-[#E8A93A] opacity-60" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-[#E8A93A]/30 opacity-20 scale-125" />
            
            {/* Labels */}
            <div className="absolute top-[30%] left-[30%] -translate-x-full -translate-y-full font-mono text-[9px] text-[#A7B4C1] tracking-widest bg-[#05080D]/80 px-2 py-1 border border-white/10">
              🏭 FACILITY
            </div>
            
            <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 font-mono text-[9px] text-[#E8A93A] tracking-widest bg-[#05080D]/80 px-2 py-1 border border-[#E8A93A]/20">
              ↻ HISTORY
            </div>

            <div className="absolute bottom-8 left-8 font-mono text-[9px] text-[#3DB7D9] tracking-widest bg-[#05080D]/80 px-2 py-1 border border-[#3DB7D9]/20">
              CLASS: BUILT-UP
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
};
