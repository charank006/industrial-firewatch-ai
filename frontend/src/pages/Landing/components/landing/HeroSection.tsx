import React, { useEffect, useRef } from 'react';
import Globe from 'globe.gl';
import { useNavigate } from 'react-router-dom';
import { getEarthNightTexture } from '../../../../utils/earthTexture';
import { HISTORICAL_EVENTS } from '../../../../data/historicalEvents';
import type { HistoricalEvent } from '../../../../types/historicalEvents';

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const globeElRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!globeElRef.current) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nasaSatTexture = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
    const fallbackTexture = getEarthNightTexture();

    const world = (Globe as any)()(globeElRef.current)
      .width(window.innerWidth)
      .height(window.innerHeight)
      .globeImageUrl(nasaSatTexture)
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundColor('rgba(0,0,0,0)')
      .atmosphereColor('#0088ff')
      .atmosphereAltitude(0.24)
      .htmlElementsData(HISTORICAL_EVENTS.slice(0, 15))
      .htmlElement((_d: HistoricalEvent) => {
        const container = document.createElement('div');
        container.className = 'pointer-events-none';
        container.style.transform = 'translate(-50%, -50%)';

        const core = document.createElement('div');
        core.style.borderRadius = '50%';
        core.style.width = '6px';
        core.style.height = '6px';
        core.style.backgroundColor = '#FF6B35';
        core.style.boxShadow = '0 0 8px rgba(255, 107, 53, 0.8)';
        container.appendChild(core);

        if (!prefersReducedMotion && Math.random() > 0.5) {
          const halo = document.createElement('div');
          halo.style.position = 'absolute';
          halo.style.top = '50%';
          halo.style.left = '50%';
          halo.style.transform = 'translate(-50%, -50%)';
          halo.style.borderRadius = '50%';
          halo.style.width = '14px';
          halo.style.height = '14px';
          halo.style.border = '1px solid rgba(255, 107, 53, 0.5)';
          halo.className = 'animate-ping opacity-75';
          container.appendChild(halo);
        }

        return container;
      });

    const img = new Image();
    img.onerror = () => world.globeImageUrl(fallbackTexture);
    img.src = nasaSatTexture;

    world.pointOfView({ lat: 20.0, lng: 70.0, altitude: 2.0 }, 0);
    
    if (!prefersReducedMotion) {
      world.controls().autoRotate = true;
      world.controls().autoRotateSpeed = 0.5;
    }
    world.controls().enableZoom = false;

    let interactTimeout: ReturnType<typeof setTimeout>;
    const controls = world.controls();
    controls.addEventListener('start', () => {
      if (!prefersReducedMotion) {
        controls.autoRotate = false;
        clearTimeout(interactTimeout);
      }
    });
    controls.addEventListener('end', () => {
      if (!prefersReducedMotion) {
        interactTimeout = setTimeout(() => {
          controls.autoRotate = true;
        }, 3000);
      }
    });

    const scene = world.scene();
    if (scene) {
      scene.traverse((obj: any) => {
        if (obj.isDirectionalLight) {
          obj.intensity = 2.0;
          obj.color.setHex(0xffffff);
        }
      });
    }

    globeInstanceRef.current = world;

    const handleResizeGlobe = () => {
      if (globeInstanceRef.current) {
        globeInstanceRef.current.width(window.innerWidth);
        globeInstanceRef.current.height(window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResizeGlobe);

    return () => {
      window.removeEventListener('resize', handleResizeGlobe);
      clearTimeout(interactTimeout);
      if (globeElRef.current) globeElRef.current.innerHTML = '';
    };
  }, []);

  return (
    <section className="relative w-full h-screen flex flex-col justify-between overflow-hidden bg-[#05080D]">
      {/* Globe Background */}
      <div className="absolute inset-0 z-0">
        <div ref={globeElRef} className="w-full h-full" />
      </div>

      {/* Cinematic Haze */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-[#05080D]/40 to-[#05080D] opacity-90 pointer-events-none" />

      {/* Top Header */}
      <header className="absolute top-0 left-0 right-0 z-20 pt-8 px-4 md:px-12 flex flex-col md:flex-row items-center md:items-start justify-between w-full pointer-events-none gap-4">
        <div className="font-mono text-xl font-bold tracking-[0.3em] text-white">
          GEOFLARE<span className="text-[#3DB7D9] ml-1">AI</span>
        </div>
        <nav className="flex items-center gap-4 md:gap-8 font-mono text-[10px] md:text-xs tracking-widest text-[#A7B4C1] uppercase pointer-events-auto flex-wrap justify-center">
          <button onClick={() => navigate('/mission-brief')} className="hover:text-white transition cursor-pointer focus-visible:outline focus-visible:outline-[#3DB7D9] px-2 py-1 rounded">
            MISSION BRIEF
          </button>
          <button onClick={() => navigate('/command-center')} className="text-white hover:text-[#3DB7D9] transition flex items-center gap-2 cursor-pointer focus-visible:outline focus-visible:outline-[#3DB7D9] px-2 py-1 rounded">
            <span>ENTER OPERATIONS</span>
            <span>&rarr;</span>
          </button>
        </nav>
      </header>

      {/* Hero Content */}
      <div className="relative z-20 flex flex-col items-center justify-center text-center mt-[-10vh] pointer-events-none px-4">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-sans font-bold text-white tracking-[0.2em] uppercase leading-tight mb-6 drop-shadow-2xl">
          INDUSTRIAL THERMAL<br/>INTELLIGENCE
        </h1>
        <p className="text-sm md:text-base font-mono text-[#A7B4C1] tracking-widest max-w-2xl leading-relaxed">
          Detect, classify and monitor industrial thermal activity from space.
        </p>
      </div>

      {/* CTA Bottom */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex justify-center pointer-events-auto">
        <button 
          onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
          className="flex flex-col items-center text-[#A7B4C1] hover:text-white transition group cursor-pointer focus-visible:outline focus-visible:outline-[#3DB7D9] p-2 rounded"
        >
          <span className="text-[10px] font-mono tracking-[0.3em] uppercase mb-3">EXPLORE GEOFLARE</span>
          <span className="animate-bounce text-[#3DB7D9]">↓</span>
        </button>
      </div>
    </section>
  );
};
