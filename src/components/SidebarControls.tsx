/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FenceMaterial, FenceHeight, ColorOption, Post, Segment, DynamicPricing } from '../types';
import { COLORS_PALETTE, FENCE_PRICES } from '../utils';
import { 
  Fence, 
  Palette, 
  Settings, 
  Columns3, 
  Ruler, 
  Maximize2,
  Info,
  CircleDot,
  Check,
  ChevronDown,
  ChevronLeft,
  Sliders,
  RefreshCw,
  DoorClosed
} from 'lucide-react';

interface SidebarControlsProps {
  activeTab: 'material' | 'color' | 'posts' | 'gates' | 'settings';
  setActiveTab: (tab: 'material' | 'color' | 'posts' | 'gates' | 'settings') => void;
  material: FenceMaterial;
  setMaterial: (mat: FenceMaterial) => void;
  railCount: 2 | 3;
  setRailCount: (count: 2 | 3) => void;
  height: FenceHeight;
  setHeight: (h: FenceHeight) => void;
  color: ColorOption;
  setColor: (color: ColorOption) => void;
  postColor: ColorOption;
  setPostColor: (color: ColorOption) => void;
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  segments: Segment[];
  setSegments: React.Dispatch<React.SetStateAction<Segment[]>>;
  propertyFrontage: number;
  setPropertyFrontage: (val: number) => void;
  selectedPostId: string | null;
  setSelectedPostId: (id: string | null) => void;
  setIsLeftPanelOpen?: (val: boolean) => void;
  pricing: DynamicPricing;
  setPricing: React.Dispatch<React.SetStateAction<DynamicPricing>>;
  slatProfile: '65' | '90';
  setSlatProfile: (profile: '65' | '90') => void;
}

export default function SidebarControls({
  activeTab,
  setActiveTab,
  material,
  setMaterial,
  railCount,
  setRailCount,
  height,
  setHeight,
  color,
  setColor,
  postColor,
  setPostColor,
  posts,
  setPosts,
  segments,
  setSegments,
  propertyFrontage,
  setPropertyFrontage,
  selectedPostId,
  setSelectedPostId,
  setIsLeftPanelOpen,
  pricing,
  setPricing,
  slatProfile,
  setSlatProfile
}: SidebarControlsProps) {

  // Fencing Types Configuration metadata for visuals
  const materialCards = [
    {
      id: 'slat_fencing' as FenceMaterial,
      title: 'Aluminum Slat Fence',
      subtitle: 'Standard premium slats',
      desc: 'Sleek premium slat fencing panels with designer ventilation gaps. Excellent for modern architectural homes.',
      visual: 'repeating-linear-gradient(0deg, #3B3F42, #3B3F42 8px, transparent 8px, transparent 12px)'
    },
    {
      id: 'aluminium_blade' as FenceMaterial,
      title: 'Aluminium Blade Fence',
      subtitle: 'Vertical blade pickets',
      desc: 'Architectural vertical blade panels (65×16mm blades, 85mm pitch) on 40×40mm backing rails. 2364mm panel span. Premium modern look with a semi-open profile.',
      visual: 'repeating-linear-gradient(90deg, #3B3F42, #3B3F42 5px, transparent 5px, transparent 14px)'
    }
  ];

  // Heights options listing in mm
  const heightOptions: FenceHeight[] = [900, 1200, 1500, 1800, 2100];

  return (
    <div className="w-80 sm:w-96 bg-[#1f2125] border-r border-[#2f3136] flex flex-row shrink-0 h-full">
      
      {/* 1. VERICAL SLIM RAIL DEPICTED IN ICON-BASED LAYOUT SCREENSHOT */}
      <div className="w-[84px] border-r border-[#2f3136] bg-[#141517] flex flex-col items-center py-5 justify-between shrink-0">
        <div className="flex flex-col items-center gap-7 w-full">
          {/* Logo element representing Fencing Pro */}
          <div className="flex flex-col items-center gap-1.5 px-1 pb-4 border-b border-[#222] w-full text-center">
            <Fence className="w-6.5 h-6.5 text-teal-400" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 font-sans leading-none">FENCING</span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400 font-sans leading-none font-mono">PRO</span>
          </div>

          {/* Sidebar Tab buttons */}
          <div className="flex flex-col gap-4.5 w-full px-2">
            
            <button
              id="sidebar_btn_tab_fencing"
              onClick={() => setActiveTab('material')}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition cursor-pointer select-none ${
                activeTab === 'material' 
                  ? 'bg-[#1f2125] text-teal-400 border border-[#2f3136] shadow-md' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#18191c]/50'
              }`}
            >
              <Fence className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-center font-sans">Fencing</span>
            </button>

            <button
              id="sidebar_btn_tab_color"
              onClick={() => setActiveTab('color')}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition cursor-pointer select-none ${
                activeTab === 'color' 
                  ? 'bg-[#1f2125] text-teal-400 border border-[#2f3136] shadow-md' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#18191c]/50'
              }`}
            >
              <Palette className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-center font-sans">Colours</span>
            </button>

            <button
              id="sidebar_btn_tab_posts"
              onClick={() => setActiveTab('posts')}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition cursor-pointer select-none ${
                activeTab === 'posts' 
                  ? 'bg-[#1f2125] text-teal-400 border border-[#2f3136] shadow-md' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#18191c]/50'
              }`}
            >
              <Columns3 className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-center font-sans">Posts</span>
            </button>

            <button
              id="sidebar_btn_tab_gates"
              onClick={() => setActiveTab('gates')}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition cursor-pointer select-none ${
                activeTab === 'gates' 
                  ? 'bg-[#1f2125] text-teal-400 border border-[#2f3136] shadow-md' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#18191c]/50'
              }`}
            >
              <DoorClosed className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-center font-sans">Gates</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center w-full">
          {/* Settings option at the very bottom of the sidebar */}
          <button
            id="sidebar_btn_tab_settings"
            onClick={() => {
              setActiveTab('settings');
              if (setIsLeftPanelOpen) {
                setIsLeftPanelOpen(true);
              }
            }}
            className={`flex flex-col items-center gap-1.5 py-2.5 w-14 rounded-xl transition cursor-pointer select-none mb-3 ${
              activeTab === 'settings' 
                ? 'bg-[#1f2125] text-teal-400 border border-[#2f3136] shadow-md' 
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#18191c]/50'
            }`}
          >
            <Settings className="w-[18px] h-[18px]" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-center font-sans">Settings</span>
          </button>

          {setIsLeftPanelOpen && (
            <button
              onClick={() => setIsLeftPanelOpen(false)}
              className="flex flex-col items-center gap-1 py-2 w-12 hover:bg-[#18191c]/40 text-zinc-500 hover:text-white rounded-xl transition cursor-pointer mb-3.5"
              title="Collapse Design Panel"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-center mt-0.5">Close</span>
            </button>
          )}
          <div className="text-zinc-600 text-center text-[9px] font-mono leading-tight px-1 pb-2">
            v1.4 PRO<br />Sydney
          </div>
        </div>
      </div>

      {/* 2. SUB-NESTED OPTION SPECIFICS DRAWER PANEL (The active configuration fields panel) */}
      <div className="flex-1 p-5.5 overflow-y-auto flex flex-col gap-6">
        
        {/* TAB 1: MATERIALS OPTIONS */}
        {activeTab === 'material' && (
          <div className="flex flex-col gap-5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Step 1: Fence Material</h4>
              <p className="text-xs text-zinc-400 mt-1">Select structural fence style to visualise as overlay</p>
            </div>

            {/* List of custom fencing types cards */}
            <div className="flex flex-col gap-3">
              {materialCards.map((card) => {
                const isSelected = material === card.id;
                return (
                  <button
                    key={card.id}
                    id={`fence_material_card_${card.id}`}
                    onClick={() => setMaterial(card.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer flex gap-3.5 relative overflow-hidden group select-none ${
                      isSelected 
                        ? 'bg-[#292c32] border-teal-500/50 shadow-[0_4px_12px_rgba(20,184,166,0.1)]' 
                        : 'bg-[#18191c]/80 border-[#2f3136] hover:bg-[#18191c] hover:border-zinc-700'
                    }`}
                  >
                    {/* Tiny micro graphic sample block */}
                    <div 
                      className="w-11 h-11 rounded-lg shrink-0 border border-zinc-950/40 opacity-90 group-hover:opacity-100 flex items-center justify-center text-center overflow-hidden"
                      style={{ background: card.visual }}
                    />

                    {/* Meta info info */}
                    <div className="flex flex-col gap-0.5 max-w-[190px]">
                      <span className="text-xs font-bold text-white leading-snug">{card.title}</span>
                      <span className="text-[10px] text-zinc-400 leading-none">{card.subtitle}</span>
                      <p className="text-[10px] text-zinc-500 leading-relaxed mt-1 hidden group-hover:block transition-all">
                        {card.desc}
                      </p>
                    </div>

                    {/* Price stamp */}
                    <div className="absolute right-3.5 top-3 flex flex-col items-end">
                      <span className="text-[10px] font-bold text-teal-400">${FENCE_PRICES[card.id].basePerMeter}/m</span>
                      <span className="text-[8px] text-zinc-500 font-mono">supply</span>
                    </div>

                    {/* Active Check Circle indicator */}
                    {isSelected && (
                      <div className="absolute right-2 bottom-2 bg-teal-500 text-slate-950 rounded-full w-4 h-4 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[4px]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Heights drop-down module */}
            <div className="border-t border-[#2f3136] pt-4.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-zinc-400" />
                  Fence Height
                </span>
                <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-mono">standard size</span>
              </div>
              
              <div className="grid grid-cols-5 gap-1.5">
                {heightOptions.map((h) => {
                  const isSelected = height === h;
                  return (
                    <button
                      key={h}
                      onClick={() => setHeight(h)}
                      className={`text-center py-2.5 rounded-lg font-mono text-xs font-semibold cursor-pointer transition select-none ${
                        isSelected 
                          ? 'bg-teal-500 text-slate-950 border-teal-400' 
                          : 'bg-[#18191c] text-zinc-400 border border-[#2f3136] hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      {h}
                      <span className="block text-[8px] mt-0.5 font-sans font-normal">mm</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-zinc-500 leading-normal gap-1 flex items-start">
                <Info className="w-3 h-3 text-zinc-400 shrink-0 mt-0.5" />
                Sydney building codes state residential boundary fences typically peak at 1800mm. Heights over 1800mm may require DA approvals.
              </p>
            </div>

            {/* Slat Custom Options block (Slat Profile: 65mm or 90mm) */}
            {material === 'slat_fencing' && (
              <div className="border-t border-[#2f3136] pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5 font-sans">
                    <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                    Slat Profile Size
                  </span>
                  <span className="text-[9px] bg-teal-950/40 text-teal-400 border border-teal-900/40 px-2 py-0.5 rounded font-mono font-bold uppercase">Procedural SVG</span>
                </div>
                
                <div className="flex gap-2">
                  <button
                    id="slat_profile_65"
                    onClick={() => setSlatProfile('65')}
                    className={`flex-1 text-center py-2.5 rounded-lg text-xs font-semibold select-none cursor-pointer border transition ${
                      slatProfile === '65'
                        ? 'bg-teal-500 text-slate-950 border-teal-400 font-bold shadow-md'
                        : 'bg-[#18191c] text-zinc-400 border border-[#2f3136] hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    65mm Standard
                  </button>
                  <button
                    id="slat_profile_90"
                    onClick={() => setSlatProfile('90')}
                    className={`flex-1 text-center py-2.5 rounded-lg text-xs font-semibold select-none cursor-pointer border transition ${
                      slatProfile === '90'
                        ? 'bg-teal-500 text-slate-950 border-teal-400 font-bold shadow-md'
                        : 'bg-[#18191c] text-zinc-400 border border-[#2f3136] hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    90mm Chunky
                  </button>
                </div>
                
                <div className="bg-[#18191c] border border-[#2f3136] p-2.5 rounded-lg flex items-start gap-2 text-[10px] text-zinc-400 leading-relaxed font-sans">
                  <Info className="w-3.5 h-3.5 shrink-0 text-teal-400 mt-0.5" />
                  <span>Choose between sleek 65mm slats with standard spacing or a chunkier 90mm slat profile for a fuller, more substantial boundary aesthetic.</span>
                </div>
              </div>
            )}

            {/* Post & Rail Custom Options block (2 or 3 Rails, 80mm structural details) */}
            {material === 'post_and_rail' && (
              <div className="border-t border-[#2f3136] pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5 font-sans">
                    <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                    Rail Configuration
                  </span>
                  <span className="text-[9px] bg-red-950/40 text-red-500 border border-red-900/40 px-2 py-0.5 rounded font-mono font-bold uppercase">80mm Post Size</span>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setRailCount(2)}
                    className={`flex-1 text-center py-2.5 rounded-lg text-xs font-semibold select-none cursor-pointer border transition ${
                      railCount === 2
                        ? 'bg-teal-500 text-slate-950 border-teal-400 font-bold shadow-md'
                        : 'bg-[#18191c] text-zinc-400 border border-[#2f3136] hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    2 Rails Layout
                  </button>
                  <button
                    onClick={() => setRailCount(3)}
                    className={`flex-1 text-center py-2.5 rounded-lg text-xs font-semibold select-none cursor-pointer border transition ${
                      railCount === 3
                        ? 'bg-teal-500 text-slate-950 border-teal-400 font-bold shadow-md'
                        : 'bg-[#18191c] text-zinc-400 border border-[#2f3136] hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    3 Rails Layout
                  </button>
                </div>
                
                <div className="bg-[#18191c] border border-[#2f3136] p-2.5 rounded-lg flex items-start gap-2 text-[10px] text-zinc-400 leading-relaxed font-sans">
                  <Info className="w-3.5 h-3.5 shrink-0 text-teal-400 mt-0.5" />
                  <span>Posts are represented as heavy-duty 80mm structural timber posts. Select either the traditional 2-rail design or premium 3-rail layout finish.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COLOR OPTIONS */}
        {activeTab === 'color' && (
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Step 2: Color Suite</h4>
              <p className="text-xs text-zinc-400 mt-1">
                {material === 'post_and_rail' 
                  ? 'Raw kiln-dried timber finishes' 
                  : 'Australis premium architectural Colorbond colors'}
              </p>
            </div>

            {/* List of beautiful circular color palettes swatches */}
            <div className="grid grid-cols-4 gap-2 border-b border-[#2f3136] pb-5">
              {COLORS_PALETTE.filter((pal) => {
                if (material === 'post_and_rail') {
                  return pal.name === 'Raw Natural Wood';
                } else {
                  return pal.isColorbond;
                }
              }).map((pal) => {
                const isSelected = color.name === pal.name;
                return (
                  <button
                    key={pal.name}
                    onClick={() => {
                      if (material !== 'post_and_rail') {
                        setColor(pal);
                        setPostColor(pal);
                      }
                    }}
                    title={`${pal.name}: ${pal.desc || ''}`}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition select-none group relative ${
                      material === 'post_and_rail' ? 'cursor-default' : 'cursor-pointer'
                    } ${
                      isSelected 
                        ? 'bg-[#292c32] border-teal-500/60 shadow-md' 
                        : 'bg-[#18191c]/60 border-transparent hover:bg-[#18191c] hover:border-zinc-700'
                    }`}
                  >
                    {/* Circle Color sample */}
                    <div 
                      className="w-8.5 h-8.5 rounded-full border border-zinc-950/20 relative flex items-center justify-center font-mono text-zinc-400 shadow-inner group-hover:scale-105 transition"
                      style={{ backgroundColor: pal.hex }}
                    >
                      {isSelected && (
                        <Check className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] stroke-[3.5px]" />
                      )}
                    </div>
                    {/* Swatch Name */}
                    <span className="text-[9px] text-zinc-300 font-semibold leading-tight text-center tracking-tight truncate w-full">
                      {pal.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Alternate Post Color Swatches (Contrast design) */}
            {material !== 'post_and_rail' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Post Contrast Colouring</span>
                    <span className="text-[10px] text-zinc-500 block">Choose non-matching post finish</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-mono">
                      {postColor.name === color.name ? 'Matching' : 'Contrast'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 bg-[#18191c] p-2 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setPostColor(color)}
                    className={`px-3 py-1.5 rounded-lg text-xs leading-none transition select-none cursor-pointer ${
                      postColor.name === color.name 
                        ? 'bg-teal-500 text-slate-950 font-bold' 
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    Match Slat Color
                  </button>
                  
                  <button
                    onClick={() => {
                      const basaltOpt = COLORS_PALETTE.find(c => c.name === 'Basalt');
                      if (basaltOpt) setPostColor(basaltOpt);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs leading-none transition select-none cursor-pointer ${
                      postColor.name === 'Basalt' 
                        ? 'bg-teal-500 text-slate-950 font-bold' 
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    Basalt Contrast Posts
                  </button>

                  <button
                    onClick={() => {
                      const monumentOpt = COLORS_PALETTE.find(c => c.name === 'Monument Grey');
                      if (monumentOpt) setPostColor(monumentOpt);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs leading-none transition select-none cursor-pointer ${
                      postColor.name === 'Monument Grey' 
                        ? 'bg-teal-500 text-slate-950 font-bold' 
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    Monument Grey Contrast Posts
                  </button>
                </div>
              </div>
            )}

            {/* Selected Color Card */}
            <div className="bg-[#18191c] p-4 rounded-xl border border-zinc-800 flex flex-col gap-1.5">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide">Selected Specification:</span>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border border-black/20" style={{ backgroundColor: color.hex }} />
                <span className="text-xs font-bold text-white">{color.name}</span>
                {color.isColorbond ? (
                  <span className="text-[9px] bg-sky-950/40 text-sky-400 border border-sky-900/40 px-1.5 py-0.5 rounded font-bold font-mono">COLORBOND&reg;</span>
                ) : (
                  <span className="text-[9px] bg-amber-950/40 text-amber-500 border border-amber-900/40 px-1.5 py-0.5 rounded font-bold font-mono">RAW WOOD</span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed italic">
                {material === 'post_and_rail' 
                  ? 'Raw premium-grade timber featuring authentic grains. Left untreated for natural silvering or ready for light weather sealing.'
                  : color.desc}
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: POSTS AND SEGMENTS MANIPULATION */}
        {activeTab === 'posts' && (
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Step 3: Core Node Properties</h4>
              <p className="text-xs text-zinc-400 mt-1">Configure corner braces, posts styles, and yard bounds</p>
            </div>

            {/* Dynamic visual slider for physical size in meters of frontage */}
            <div className="bg-[#18191c] p-4 rounded-xl border border-zinc-800 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">Full Property Frontage</span>
                <span className="text-xs font-mono font-bold text-teal-400 bg-teal-950/20 border border-teal-900/30 px-2 py-0.5 rounded">
                  {propertyFrontage} meters
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="45"
                step="0.5"
                value={propertyFrontage}
                onChange={(e) => setPropertyFrontage(parseFloat(e.target.value))}
                className="w-full accent-teal-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] text-zinc-500 leading-none">
                Adjusts total perimeter meterage to scale quotes down correctly to on-site measurements.
              </span>
            </div>

            {/* Details panel about active selection */}
            {selectedPostId ? (
              <div className="flex flex-col gap-3 bg-zinc-900/40 border border-teal-500/10 p-3.5 rounded-xl">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Active Post Inspector</span>
                  <span className="text-[10px] font-mono text-teal-400 bg-teal-950/30 px-2 py-0.5 rounded">Select Mode Active</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-zinc-400 font-semibold">Post Type:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['standard', 'corner', 'gate', 'H-post', 'decorative'].map((typeOption) => {
                      const currPost = posts.find(p => p.id === selectedPostId);
                      const isPostActive = currPost?.type === typeOption;
                      return (
                        <button
                          key={typeOption}
                          onClick={() => {
                            setPosts(prev => prev.map(p => p.id === selectedPostId ? { ...p, type: typeOption as any } : p));
                          }}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-bold capitalize text-center border cursor-pointer select-none transition ${
                            isPostActive
                              ? 'bg-teal-500 text-slate-950 border-teal-400'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-750 hover:bg-zinc-750 hover:text-white'
                          }`}
                        >
                          {typeOption}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[10px] text-zinc-500 leading-normal gap-1 flex items-start mt-1">
                  <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                  Australia fencing guidelines require heavy reinforcing gate pillars or corner brace columns at boundaries to counteract sheet forces.
                </p>

                <button
                  onClick={() => setSelectedPostId(null)}
                  className="w-full text-center bg-zinc-800 text-zinc-300 py-1.5 rounded-lg text-xs leading-none hover:bg-zinc-750 cursor-pointer transition select-none mt-1"
                >
                  Unselect Anchor
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-zinc-805 rounded-xl p-5 text-center text-zinc-600 flex flex-col items-center justify-center gap-2">
                <CircleDot className="w-6.5 h-6.5 text-zinc-700 animate-pulse" />
                <span className="text-xs font-semibold text-zinc-400">Interactive Canvas Inspector</span>
                <p className="text-[10px] leading-relaxed max-w-[200px]">
                  Click on any <b className="text-zinc-500">circular post handle</b> or <b className="text-zinc-500">segment panel</b> directly on the house photo to unlock advanced specific tools.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB: GATES (Standalone Gates and Custom assets tool) */}
        {activeTab === 'gates' && (
          <div className="flex flex-col gap-5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Step 3: Standalone Gates</h4>
              <p className="text-xs text-zinc-400 mt-1">
                Drop standalone gates anywhere on the layout, independent of fence segments.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {/* Single Gate Drop Button */}
              <div className="bg-[#18191c] p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2.5">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Single Pedestrian Gate</span>
                  <span className="text-[10px] text-teal-400 font-mono font-semibold">Strictly locked at 1200mm width</span>
                </div>
                <button
                  id="add_standalone_single_gate"
                  onClick={() => {
                    const idLeft = 'post_g_' + Date.now() + '_l';
                    const idRight = 'post_g_' + Date.now() + '_r';
                    const widthPercent = (1.2 / propertyFrontage) * 100;
                    
                    let centerY = 75;
                    let centerX = 50;
                    
                    while (posts.some(p => Math.abs(p.x - centerX) < 2 && Math.abs(p.y - centerY) < 2)) {
                      centerY += 3;
                      if (centerY > 85) {
                        centerY = 68;
                        centerX += 5;
                      }
                    }

                    let leftX = centerX - widthPercent / 2;
                    let rightX = centerX + widthPercent / 2;
                    if (leftX < 2) {
                      leftX = 2;
                      rightX = leftX + widthPercent;
                    } else if (rightX > 98) {
                      rightX = 98;
                      leftX = rightX - widthPercent;
                    }

                    const newLeftPost: Post = {
                      id: idLeft,
                      x: leftX,
                      y: centerY,
                      type: 'gate'
                    };

                    const newRightPost: Post = {
                      id: idRight,
                      x: rightX,
                      y: centerY,
                      type: 'gate'
                    };

                    const newSegment: Segment = {
                      id: 'seg_g_' + Date.now(),
                      startPostId: idLeft,
                      endPostId: idRight,
                      hasGate: true,
                      gateType: 'single',
                      gateWidthPercent: 100,
                      gatePositionPercent: 0,
                      isStandaloneGate: true
                    };

                    setPosts(prev => [...prev, newLeftPost, newRightPost]);
                    setSegments(prev => [...prev, newSegment]);
                  }}
                  className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-2 rounded-lg text-xs leading-none transition select-none flex items-center justify-center gap-2 cursor-pointer shadow"
                >
                  <DoorClosed className="w-4 h-4 shrink-0" />
                  <span>Drop Single Gate (1200mm)</span>
                </button>
              </div>

              {/* Double Gate Drop Button */}
              <div className="bg-[#18191c] p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2.5">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Double Driveway Swing Gate</span>
                  <span className="text-[10px] text-teal-400 font-mono font-semibold">Strictly locked at 4000mm width</span>
                </div>
                <button
                  id="add_standalone_double_gate"
                  onClick={() => {
                    const idLeft = 'post_g_' + Date.now() + '_l';
                    const idRight = 'post_g_' + Date.now() + '_r';
                    const widthPercent = (4.0 / propertyFrontage) * 100;
                    
                    let centerY = 75;
                    let centerX = 50;
                    
                    while (posts.some(p => Math.abs(p.x - centerX) < 2 && Math.abs(p.y - centerY) < 2)) {
                      centerY += 3;
                      if (centerY > 85) {
                        centerY = 68;
                        centerX += 5;
                      }
                    }

                    let leftX = centerX - widthPercent / 2;
                    let rightX = centerX + widthPercent / 2;
                    if (leftX < 2) {
                      leftX = 2;
                      rightX = leftX + widthPercent;
                    } else if (rightX > 98) {
                      rightX = 98;
                      leftX = rightX - widthPercent;
                    }

                    const newLeftPost: Post = {
                      id: idLeft,
                      x: leftX,
                      y: centerY,
                      type: 'gate'
                    };

                    const newRightPost: Post = {
                      id: idRight,
                      x: rightX,
                      y: centerY,
                      type: 'gate'
                    };

                    const newSegment: Segment = {
                      id: 'seg_g_' + Date.now(),
                      startPostId: idLeft,
                      endPostId: idRight,
                      hasGate: true,
                      gateType: 'double',
                      gateWidthPercent: 100,
                      gatePositionPercent: 0,
                      isStandaloneGate: true
                    };

                    setPosts(prev => [...prev, newLeftPost, newRightPost]);
                    setSegments(prev => [...prev, newSegment]);
                  }}
                  className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-2 rounded-lg text-xs leading-none transition select-none flex items-center justify-center gap-2 cursor-pointer shadow"
                >
                  <DoorClosed className="w-4 h-4 shrink-0" />
                  <DoorClosed className="w-4 h-4 shrink-0 -ml-1" />
                  <span>Drop Double Gate (4000mm)</span>
                </button>
              </div>

              {/* Dynamic Handlers Info Box */}
              <div className="bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Automatic Handlers:</span>
                <ul className="text-[10px] text-zinc-400 list-disc pl-4 space-y-1 font-sans">
                  <li>
                    <b className="text-white">Height Synchronization:</b> Standalone gates sync automatically with the current selected fence height (<b className="text-teal-400">{height}mm</b>).
                  </li>
                  <li>
                    <b className="text-white">Rigid Spacing:</b> Left and right side-posts move as a unit to preserve the strict physical width.
                  </li>
                  <li>
                    <b className="text-white">Auto Cleanup:</b> Deleting the gate segment automatically cleans up its side pillars.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: STUDIO SETTINGS (Dynamic boundary cost parameters) */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Settings & Estimator Rates</h4>
              <p className="text-xs text-zinc-400 mt-1">Configure custom rate estimation parameters below.</p>
            </div>

            {/* Boundary Rates Adjustment panel */}
            <div className="p-4 rounded-xl border flex flex-col gap-4.5 bg-[#18191c] border-zinc-800">
              <div className="flex justify-between items-center border-b border-zinc-850 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Dynamic Estimator Rates</span>
                  <span className="text-[9px] text-zinc-500">All prices calculated in Australian Dollars ($)</span>
                </div>
                <button
                  onClick={() => {
                    const defaultRates: DynamicPricing = {
                      slatMaterialCost: 135,
                      postRailMaterialCost: 105,
                      bladeMaterialCost: 155,
                      slatLaborCost: 85,
                      postRailLaborCost: 75,
                      bladeLaborCost: 85,
                      standardPostCost: 0,
                      cornerPostCost: 65,
                      hPostCost: 95,
                      gatePostCost: 85,
                      decorativePostCost: 145,
                      singleGateCost: 350,
                      doubleGateCost: 750
                    };
                    setPricing(defaultRates);
                    try {
                      localStorage.setItem('fencing_custom_pricing', JSON.stringify(defaultRates));
                    } catch (e) {}
                  }}
                  className="flex items-center gap-1 text-[9px] font-bold text-teal-400 hover:text-teal-300 bg-teal-950/20 px-2 py-1 border border-teal-900/30 rounded transition cursor-pointer select-none font-mono"
                  title="Reset base rates to corporate default standards"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Standardise</span>
                </button>
              </div>

              {/* Editable cost breakdown settings */}
              <div className="flex flex-col gap-3.5 max-h-[360px] overflow-y-auto pr-1">
                
                {/* Section A: Panels */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest leading-none">
                    {material === 'slat_fencing' ? 'Slat Panels (m)' : material === 'aluminium_blade' ? 'Blade Panels (m)' : 'Post & Rail Panels (m)'}
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    {material === 'slat_fencing' ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-zinc-400 font-semibold leading-none">Slat Material ($ / meter)</label>
                        <input
                          type="number"
                          value={pricing.slatMaterialCost}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setPricing(prev => ({ ...prev, slatMaterialCost: val }));
                            try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, slatMaterialCost: val })); } catch {}
                          }}
                          className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                          min="0"
                        />
                      </div>
                    ) : material === 'aluminium_blade' ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-zinc-400 font-semibold leading-none">Blade Material ($ / meter)</label>
                        <input
                          type="number"
                          value={pricing.bladeMaterialCost}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setPricing(prev => ({ ...prev, bladeMaterialCost: val }));
                            try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, bladeMaterialCost: val })); } catch {}
                          }}
                          className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                          min="0"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-zinc-400 font-semibold leading-none">Post & Rail Material ($ / meter)</label>
                        <input
                          type="number"
                          value={pricing.postRailMaterialCost}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setPricing(prev => ({ ...prev, postRailMaterialCost: val }));
                            try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, postRailMaterialCost: val })); } catch {}
                          }}
                          className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                          min="0"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Section B: Labor rates */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest leading-none">Assembly & Labour (m)</span>
                  <div className="grid grid-cols-1 gap-2">
                    {material === 'slat_fencing' ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-zinc-400 font-semibold leading-none">Slat Labour ($ / meter)</label>
                        <input
                          type="number"
                          value={pricing.slatLaborCost}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setPricing(prev => ({ ...prev, slatLaborCost: val }));
                            try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, slatLaborCost: val })); } catch {}
                          }}
                          className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                          min="0"
                        />
                      </div>
                    ) : material === 'aluminium_blade' ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-zinc-400 font-semibold leading-none">Blade Labour ($ / meter)</label>
                        <input
                          type="number"
                          value={pricing.bladeLaborCost}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setPricing(prev => ({ ...prev, bladeLaborCost: val }));
                            try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, bladeLaborCost: val })); } catch {}
                          }}
                          className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                          min="0"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-zinc-400 font-semibold leading-none">Post & Rail Labour ($ / meter)</label>
                        <input
                          type="number"
                          value={pricing.postRailLaborCost}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setPricing(prev => ({ ...prev, postRailLaborCost: val }));
                            try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, postRailLaborCost: val })); } catch {}
                          }}
                          className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                          min="0"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Section C: Post Pillars upgrade */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest leading-none">Post Upgrades (Pillar)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 font-semibold leading-none">Corner Post ($)</label>
                      <input
                        type="number"
                        value={pricing.cornerPostCost}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setPricing(prev => ({ ...prev, cornerPostCost: val }));
                          try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, cornerPostCost: val })); } catch {}
                        }}
                        className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                        min="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 font-semibold leading-none">H-Post ($)</label>
                      <input
                        type="number"
                        value={pricing.hPostCost}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setPricing(prev => ({ ...prev, hPostCost: val }));
                          try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, hPostCost: val })); } catch {}
                        }}
                        className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                        min="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 font-semibold leading-none">Gate Post ($)</label>
                      <input
                        type="number"
                        value={pricing.gatePostCost}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setPricing(prev => ({ ...prev, gatePostCost: val }));
                          try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, gatePostCost: val })); } catch {}
                        }}
                        className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                        min="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 font-semibold leading-none">Decorative ($)</label>
                      <input
                        type="number"
                        value={pricing.decorativePostCost}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setPricing(prev => ({ ...prev, decorativePostCost: val }));
                          try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, decorativePostCost: val })); } catch {}
                        }}
                        className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Section D: Gates */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest leading-none">Gates (Single/Double)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 font-semibold leading-none">Single Pedestrian ($)</label>
                      <input
                        type="number"
                        value={pricing.singleGateCost}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setPricing(prev => ({ ...prev, singleGateCost: val }));
                          try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, singleGateCost: val })); } catch {}
                        }}
                        className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                        min="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-zinc-400 font-semibold leading-none">Double Swing ($)</label>
                      <input
                        type="number"
                        value={pricing.doubleGateCost}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setPricing(prev => ({ ...prev, doubleGateCost: val }));
                          try { localStorage.setItem('fencing_custom_pricing', JSON.stringify({ ...pricing, doubleGateCost: val })); } catch {}
                        }}
                        className="w-full text-xs font-bold rounded-lg border border-zinc-800 bg-zinc-900 text-white px-2.5 py-1.5 focus:border-teal-500/50 outline-none"
                        min="0"
                      />
                    </div>
                  </div>
                </div>

              </div>
              <p className="text-[9px] text-zinc-500 leading-normal gap-1 flex items-start">
                <Info className="w-3 h-3 text-zinc-400 shrink-0 mt-0.5" />
                These parameters link directly to live fencer client estimates. Changes instantly modify active and compiled PDF/Quote invoices.
              </p>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
