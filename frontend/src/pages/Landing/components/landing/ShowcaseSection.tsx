import React from 'react';
import { GISMapLibre } from '../../../../components/map/GISMapLibre';

export const ShowcaseSection: React.FC = () => {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 md:px-12 flex flex-col items-center pt-32 pb-16">
      <h2 className="text-3xl md:text-5xl lg:text-6xl font-mono font-bold text-white tracking-[0.1em] uppercase leading-tight mb-16 text-center max-w-4xl">
        SEE IT LIVE.
      </h2>

      {/* Product UI Container */}
      <div className="w-full max-w-5xl h-[600px] border border-[#253340] rounded-xl bg-[#0D151E] shadow-2xl relative overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-[#3DB7D9]">
        {/* Browser accents */}
        <div className="w-full h-10 bg-[#111B25] border-b border-[#253340] flex items-center px-4 gap-2 shrink-0">
          <div className="w-3 h-3 rounded-full bg-[#FF3B30]/50" />
          <div className="w-3 h-3 rounded-full bg-[#E8A93A]/50" />
          <div className="w-3 h-3 rounded-full bg-[#39B978]/50" />
          <div className="ml-4 font-mono text-[9px] text-[#6F7E8D] uppercase tracking-widest flex-1 text-center pr-12">
            GEOFLARE COMMAND CENTER
          </div>
        </div>
        
        {/* Viewport - Interactive Map */}
        <div className="flex-1 bg-[#05080D] relative w-full h-full overflow-hidden">
           <GISMapLibre height="h-full" />
        </div>
      </div>
      
      <p className="mt-6 font-mono text-xs text-[#A7B4C1] tracking-widest uppercase">
        Live anomaly classification across 45+ monitored infrastructure targets.
      </p>
    </section>
  );
};
