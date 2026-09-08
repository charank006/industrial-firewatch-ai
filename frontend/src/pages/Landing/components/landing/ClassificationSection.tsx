import React, { useState } from 'react';

const CATEGORIES = [
  { id: 'industrial-fire', label: 'INDUSTRIAL FIRE' },
  { id: 'gas-flare', label: 'GAS FLARE' },
  { id: 'agricultural-burn', label: 'AGRICULTURAL BURN' },
  { id: 'wildfire', label: 'WILDFIRE' },
  { id: 'mining-activity', label: 'MINING ACTIVITY' }
];

export const ClassificationSection: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState('industrial-fire');

  const renderVisual = () => {
    switch (activeCategory) {
      case 'industrial-fire':
        return (
          <div className="flex flex-col items-center">
            <div className="relative w-64 h-48 border border-[#FF3B30]/30 bg-[#FF3B30]/5 mb-8 overflow-hidden rounded">
               <div className="absolute inset-0 border-[0.5px] border-[#A7B4C1]/20 m-2" />
               <div className="absolute bottom-4 right-4 w-12 h-12 border border-[#A7B4C1]/30 bg-white/5" />
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#FF3B30]/20 rounded-full animate-ping" />
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#FF3B30] rounded-full shadow-[0_0_15px_#FF3B30]" />
            </div>
            <p className="font-mono text-[10px] text-[#A7B4C1] uppercase tracking-widest text-center max-w-sm">
              Sudden / abnormal thermal event detected within known active industrial infrastructure footprint.
            </p>
          </div>
        );
      case 'gas-flare':
        return (
          <div className="flex flex-col items-center">
            <div className="flex gap-4 mb-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="w-8 h-32 border border-[#FF6B22]/30 bg-[#FF6B22]/5 flex flex-col justify-end p-1 rounded-sm">
                  <div className="w-full bg-[#FF6B22]/50" style={{ height: `${30 + Math.random() * 50}%` }} />
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] text-[#A7B4C1] uppercase tracking-widest text-center max-w-sm">
              Repeated thermal observations over time indicating a routine pattern (e.g. gas flaring).
            </p>
          </div>
        );
      case 'wildfire':
        return (
          <div className="flex flex-col items-center">
            <div className="relative w-80 h-48 border border-[#39B978]/20 bg-[#0D151E] mb-8 overflow-hidden rounded">
               <svg className="absolute inset-0 w-full h-full stroke-[#39B978]/20 fill-none" viewBox="0 0 100 50">
                 <path d="M0,20 Q25,5 50,25 T100,10" />
                 <path d="M0,30 Q25,15 50,35 T100,20" />
                 <path d="M0,40 Q25,25 50,45 T100,30" />
               </svg>
               <div className="absolute top-1/3 left-1/2 flex gap-2">
                 <div className="w-3 h-3 bg-[#FF3B30] rounded-full blur-[1px]" />
                 <div className="w-4 h-4 bg-[#FF6B22]/80 rounded-full blur-[2px]" />
                 <div className="w-6 h-6 bg-[#E8A93A]/60 rounded-full blur-[3px]" />
               </div>
            </div>
            <p className="font-mono text-[10px] text-[#A7B4C1] uppercase tracking-widest text-center max-w-sm">
              Spatially distributed, expanding thermal activity across natural vegetation canopy.
            </p>
          </div>
        );
      case 'agricultural-burn':
        return (
          <div className="flex flex-col items-center">
            <div className="relative w-64 h-48 border border-[#E8A93A]/20 bg-[#0D151E] mb-8 overflow-hidden rounded grid grid-cols-3 grid-rows-3 gap-1 p-2">
               {[...Array(9)].map((_, i) => (
                 <div key={i} className="border border-[#E8A93A]/10 bg-[#E8A93A]/5 relative flex items-center justify-center">
                    {(i === 2 || i === 4 || i === 7) && (
                      <div className="w-2 h-2 bg-[#FF6B22] rounded-full shadow-[0_0_8px_#FF6B22]" />
                    )}
                 </div>
               ))}
            </div>
            <p className="font-mono text-[10px] text-[#A7B4C1] uppercase tracking-widest text-center max-w-sm">
              Short-duration clustered thermal activity aligned with designated agricultural boundaries.
            </p>
          </div>
        );
      case 'mining-activity':
        return (
          <div className="flex flex-col items-center">
            <div className="relative w-64 h-48 border border-[#A7B4C1]/20 bg-[#0D151E] mb-8 overflow-hidden rounded flex items-center justify-center">
               <div className="w-40 h-40 border-2 border-[#A7B4C1]/10 rounded-[30%] rotate-12 absolute" />
               <div className="w-24 h-24 border border-[#A7B4C1]/20 rounded-[20%] -rotate-12 absolute bg-[#111B25]/50 flex items-center justify-center">
                 <div className="w-2 h-2 bg-[#E8A93A] rounded-full shadow-[0_0_8px_#E8A93A]" />
               </div>
            </div>
            <p className="font-mono text-[10px] text-[#A7B4C1] uppercase tracking-widest text-center max-w-sm">
              Persistent or localized thermal source within known surface excavation zones.
            </p>
          </div>
        );
      default: return null;
    }
  };

  return (
    <section className="w-full max-w-7xl mx-auto px-8 md:px-12 pt-32">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
        
        {/* Left Rail */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <h2 className="text-3xl md:text-5xl font-mono font-bold text-white tracking-[0.1em] uppercase leading-tight mb-12">
            ONE SIGNAL.<br/>DIFFERENT<br/>SIGNATURES.
          </h2>
          
          <div className="flex flex-col space-y-2 font-mono text-[11px] md:text-xs tracking-[0.15em] uppercase text-[#A7B4C1]">
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center justify-between p-4 border rounded cursor-pointer transition-all focus-visible:outline focus-visible:outline-[#3DB7D9] ${
                    isActive 
                      ? 'bg-[#111B25] border-[#253340] text-white shadow-sm' 
                      : 'border-transparent border-b-[#253340] hover:text-white hover:bg-white/5 rounded-none'
                  }`}
                >
                  <span className={isActive ? 'font-bold' : ''}>{cat.label}</span>
                  <span className={`transition-transform duration-300 ${isActive ? 'translate-x-1 text-[#3DB7D9]' : ''}`}>&rarr;</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Visual */}
        <div className="lg:col-span-7">
          <div className="w-full h-full min-h-[500px] border border-[#253340] rounded-xl flex items-center justify-center bg-[#0D151E] p-8 transition-all duration-500">
            <div className="animate-in fade-in zoom-in-95 duration-500 fill-mode-forwards" key={activeCategory}>
              {renderVisual()}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
