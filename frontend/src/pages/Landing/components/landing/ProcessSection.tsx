import React, { useState } from 'react';

type StageId = 'thermal' | 'context' | 'persistence' | 'classification' | 'visualization';

const STAGES: { id: StageId; num: string; label: string }[] = [
  { id: 'thermal', num: '01', label: 'THERMAL DETECTION' },
  { id: 'context', num: '02', label: 'SPATIAL CONTEXT' },
  { id: 'persistence', num: '03', label: 'PERSISTENCE ANALYSIS' },
  { id: 'classification', num: '04', label: 'CLASSIFICATION' },
  { id: 'visualization', num: '05', label: 'GIS VISUALIZATION' },
];

export const ProcessSection: React.FC = () => {
  const [activeStage, setActiveStage] = useState<StageId | null>(null);

  const renderVisual = () => {
    switch (activeStage) {
      case 'thermal':
        return (
          <div className="flex flex-col items-center gap-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-12 h-12 bg-[#FF3B30] rounded-full shadow-[0_0_40px_#FF3B30] animate-pulse relative flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="font-mono text-sm text-white">LAT: 21.1702, LNG: 72.8311</div>
              <div className="font-mono text-xs text-[#A7B4C1]">13:42:01 UTC | 184.2 MW FRP</div>
            </div>
            <div className="font-mono text-[10px] text-[#FF3B30] uppercase tracking-widest border border-[#FF3B30]/30 px-4 py-2 bg-[#FF3B30]/10">
              THERMAL SPIKE DETECTED (Exceeds 100 MW threshold)
            </div>
          </div>
        );
      case 'context':
        return (
          <div className="flex flex-col items-center gap-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative w-64 h-64 border-[0.5px] border-[#A7B4C1]/20 rounded-full flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent to-[#0D151E]">
              <div className="w-48 h-32 border border-white/20 bg-white/5 backdrop-blur-[2px] rotate-12 flex flex-col items-start p-2 gap-1 justify-end">
                <div className="font-mono text-[8px] text-white/50 tracking-widest uppercase">Surat Petrochem</div>
              </div>
              <div className="absolute w-4 h-4 bg-[#FF3B30] rounded-full -translate-y-6 shadow-[0_0_15px_#FF3B30]" />
              {/* Distance Line */}
              <div className="absolute top-1/2 left-1/2 w-[1px] h-12 bg-white/30 origin-top rotate-[20deg]" />
            </div>
            <div className="font-mono text-[10px] text-white uppercase tracking-widest border border-white/20 px-4 py-2 bg-white/5 flex gap-4">
              <span>LAND COVER: Built-up Industrial</span>
              <span className="text-[#A7B4C1]">DISTANCE: 0.1 KM</span>
            </div>
          </div>
        );
      case 'persistence':
        return (
          <div className="flex flex-col items-center justify-center w-full max-w-lg gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-full h-40 border-b border-l border-[#253340] flex items-end justify-between px-6 pb-2 relative">
               {/* Empty history representing unprecedented activity */}
               <div className="w-full text-center font-mono text-xs text-[#6F7E8D] uppercase tracking-widest absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                 No historical thermal signatures at this exact perimeter (180 days)
               </div>
               
               {/* Today's spike */}
               <div className="absolute right-6 bottom-2 w-12 bg-[#FF3B30]/80 border border-[#FF3B30] shadow-[0_0_20px_#FF3B30]" style={{ height: '90%' }} />
               <div className="absolute bottom-6 left-0 w-full h-[1px] bg-[#3DB7D9] border-dashed opacity-50" />
            </div>
            <div className="font-mono text-[10px] text-[#FF6B35] uppercase tracking-widest px-4 py-2 border border-[#FF6B35]/30 bg-[#FF6B35]/10">
              UNPRECEDENTED THERMAL ACTIVITY
            </div>
          </div>
        );
      case 'classification':
        return (
          <div className="flex flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <div className="font-mono text-4xl md:text-5xl text-[#FF3B30] uppercase font-bold tracking-widest drop-shadow-[0_0_20px_rgba(255,59,48,0.5)]">
                INDUSTRIAL FIRE
              </div>
              <div className="font-mono text-sm text-[#A7B4C1] mt-4 tracking-widest">
                CONFIDENCE SCORE: <span className="text-white">91%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-xl">
              <div className="border border-[#253340] bg-[#111B25] p-4 text-left">
                <div className="font-mono text-[9px] text-[#3DB7D9] mb-1">PROXIMITY CHECK</div>
                <div className="font-mono text-xs text-white">Passed: Located inside high-risk facility zone</div>
              </div>
              <div className="border border-[#FF3B30]/30 bg-[#FF3B30]/10 p-4 text-left">
                <div className="font-mono text-[9px] text-[#FF3B30] mb-1">THERMAL SPIKE</div>
                <div className="font-mono text-xs text-white">Critical: Exceeds safety threshold</div>
              </div>
            </div>
          </div>
        );
      case 'visualization':
        return (
          <div className="w-full h-full p-4 flex flex-col gap-4 bg-[#05080D] animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-between items-center px-2">
              <span className="font-mono text-xs text-white tracking-widest uppercase">Emergency Response Map</span>
              <span className="font-mono text-[9px] px-2 py-1 bg-[#FF3B30] text-white font-bold">CRITICAL ALERT</span>
            </div>
            <div className="flex-1 relative border border-[#253340] bg-[#0A121E] overflow-hidden rounded flex items-center justify-center">
              {/* GIS Overlay Mockup */}
              <div className="absolute inset-0 opacity-30 bg-[linear-gradient(45deg,transparent_25%,rgba(61,183,217,0.1)_50%,transparent_75%)] bg-[size:24px_24px]" />
              <div className="absolute top-1/2 left-1/2 w-32 h-32 border border-[#FF3B30]/50 rounded-full animate-ping -translate-x-1/2 -translate-y-1/2 opacity-50" />
              <div className="absolute top-1/2 left-1/2 w-64 h-64 border border-[#FF3B30]/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
              
              {/* Asset Box */}
              <div className="absolute top-1/2 left-1/2 -translate-x-[40%] -translate-y-[60%] w-40 h-32 border border-[#3DB7D9] bg-[#3DB7D9]/10">
                <div className="absolute -top-6 left-0 font-mono text-[8px] text-[#3DB7D9] bg-[#05080D] px-1 border border-[#3DB7D9]">ASSET ID: SUR-091</div>
              </div>

              {/* Fire Node */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-[#FF3B30] rounded shadow-[0_0_20px_#FF3B30]" />
              
              {/* Evac Route */}
              <svg className="absolute inset-0 w-full h-full stroke-[#39B978] stroke-2 stroke-dasharray-4 fill-none">
                <path d="M50%,50% L70%,70% L90%,60%" />
              </svg>
            </div>
          </div>
        );
      default: 
        return (
          <div className="flex flex-col items-center justify-center w-full h-full text-center p-8">
            <div className="w-full max-w-2xl h-1 bg-[#253340] rounded-full overflow-hidden relative">
              <div className="absolute top-0 left-0 h-full w-1/4 bg-gradient-to-r from-transparent via-[#3DB7D9] to-transparent animate-[flow_2s_ease-in-out_infinite]" />
            </div>
            <div className="font-mono text-xs text-[#6F7E8D] uppercase tracking-widest mt-6">
              AWAITING STAGE SELECTION
            </div>
          </div>
        );
    }
  };

  return (
    <section className="w-full max-w-7xl mx-auto px-4 md:px-12 flex flex-col items-center pt-32 pb-16">
      <h2 className="text-3xl md:text-5xl lg:text-6xl font-mono font-bold text-white tracking-[0.1em] uppercase leading-tight mb-16 text-center max-w-4xl">
        CONTEXT CHANGES<br/>THE SIGNAL.
      </h2>

      {/* Interactive Process Pipeline */}
      <div className="w-full mb-16 flex flex-col md:flex-row justify-between gap-4 font-mono text-[11px] md:text-xs tracking-widest uppercase relative z-10">
        {STAGES.map((stage) => {
          const isActive = activeStage === stage.id;
          return (
            <button 
              key={stage.id}
              onClick={() => setActiveStage(stage.id)}
              className={`flex-1 relative flex flex-col items-center md:items-start p-4 md:p-6 transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#3DB7D9] border-l-2 md:border-l-0 md:border-t-2 text-left group
                ${isActive 
                  ? 'border-[#3DB7D9] bg-[#111B25]/80 shadow-[0_4px_24px_rgba(0,0,0,0.5)] scale-105 z-20' 
                  : 'border-[#253340] hover:border-[#6F7E8D] bg-[#0A121E]/50 hover:bg-[#111B25]/50'
                }`}
            >
              <span className={`mb-2 font-bold transition-colors ${isActive ? 'text-[#3DB7D9]' : 'text-[#6F7E8D] group-hover:text-white'}`}>{stage.num}</span>
              <span className={`text-center md:text-left transition-colors ${isActive ? 'text-white' : 'text-[#A7B4C1] group-hover:text-white'}`}>{stage.label}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Visual Area */}
      <div className="w-full max-w-5xl h-[500px] border border-[#253340] rounded-xl flex items-center justify-center bg-[#0D151E] shadow-2xl relative overflow-hidden transition-all duration-500">
        <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 fill-mode-forwards flex items-center justify-center" key={activeStage || 'idle'}>
          {renderVisual()}
        </div>
      </div>
    </section>
  );
};
