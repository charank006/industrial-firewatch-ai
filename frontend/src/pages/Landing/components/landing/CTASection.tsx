import React from 'react';
import { useNavigate } from 'react-router-dom';

export const CTASection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="relative w-full py-48 px-8 md:px-12 flex flex-col items-center text-center overflow-hidden">
      
      {/* Optional atmospheric curve */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200vw] h-[1000px] rounded-[100%] bg-[#05080D] border-t border-[#111B25] shadow-[0_-50px_100px_rgba(61,183,217,0.03)] z-0" />
      
      <div className="relative z-10">
        <h2 className="text-xl md:text-2xl font-mono font-bold text-white tracking-[0.2em] uppercase mb-8 opacity-70">
          GEOFLARE AI
        </h2>
        
        <h3 className="text-3xl md:text-5xl font-mono font-bold text-white tracking-[0.1em] uppercase leading-tight mb-16 max-w-2xl">
          SEE THE FULL SYSTEM<br/>IN OPERATION.
        </h3>

        <p className="text-sm md:text-base font-sans text-[#A7B4C1] leading-relaxed max-w-lg mb-12 mx-auto">
          Access the Command Center for live incident tracking, facility risk monitoring, and real-time alerts.
        </p>

        <button 
          onClick={() => navigate('/command-center')}
          className="group relative px-8 py-4 bg-white text-[#050A12] hover:bg-[#3DB7D9] transition-colors font-mono font-bold text-sm tracking-[0.2em] uppercase rounded flex items-center justify-center space-x-3 mx-auto cursor-pointer focus-visible:outline focus-visible:outline-[#3DB7D9] focus-visible:outline-offset-4"
        >
          <span>ENTER OPERATIONS</span>
          <span className="text-lg leading-none group-hover:translate-x-1 transition-transform">&rarr;</span>
        </button>

        <button 
          onClick={() => navigate('/mission-brief')}
          className="mt-8 font-mono text-[10px] text-[#6F7E8D] tracking-widest uppercase hover:text-white transition focus-visible:outline focus-visible:outline-white p-2 rounded"
        >
          MISSION BRIEF
        </button>
      </div>
    </section>
  );
};
