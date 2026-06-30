/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Post, Segment, FenceMaterial, FenceHeight, ColorOption, DynamicPricing } from './types';
import { COLORS_PALETTE, estimateFencingCosts } from './utils';
import SidebarControls from './components/SidebarControls';
import FenceCanvas from './components/FenceCanvas';
import EstimateSummary from './components/EstimateSummary';
import FenceLogo from './components/FenceLogo';
import { 
  ShieldCheck, 
  HelpCircle, 
  PhoneCall, 
  MapPin, 
  Clock, 
  Compass, 
  Scissors, 
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Lock,
  ShieldAlert,
  Eye,
  EyeOff,
  LogOut
} from 'lucide-react';

// Create a pre-aligned default fence line coordinates mapped onto the lawn of our default house generated asset
const DEFAULT_POSTS: Post[] = [
  { id: 'p1', x: 11, y: 76, type: 'standard' },
  { id: 'p2', x: 50, y: 79, type: 'corner' },
  { id: 'p3', x: 89, y: 73, type: 'gate' }
];

const DEFAULT_SEGMENTS: Segment[] = [
  { 
    id: 's1', 
    startPostId: 'p1', 
    endPostId: 'p2', 
    hasGate: false 
  },
  { 
    id: 's2', 
    startPostId: 'p2', 
    endPostId: 'p3', 
    hasGate: true, 
    gateType: 'single', 
    gateWidthPercent: 30, 
    gatePositionPercent: 35 
  }
];

export default function App() {
  // Password validation state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('fencing_authenticated') === 'true' || 
           localStorage.getItem('fencing_authenticated_persist') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const configPassword = (import.meta as any).env?.VITE_APP_PASSWORD || 'Uassistant';
    if (passwordInput.trim() === configPassword.trim()) {
      setIsAuthenticated(true);
      setPasswordError('');
      if (rememberMe) {
        localStorage.setItem('fencing_authenticated_persist', 'true');
      } else {
        sessionStorage.setItem('fencing_authenticated', 'true');
      }
    } else {
      setPasswordError('Invalid credentials. Please verify your Fencing Pro authorized passkey.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('fencing_authenticated_persist');
    sessionStorage.removeItem('fencing_authenticated');
    setIsAuthenticated(false);
    setPasswordInput('');
    setPasswordError('');
  };

  // Navigation State
  const [activeTab, setActiveTab] = useState<'material' | 'color' | 'posts' | 'gates' | 'settings'>('material');

  // Pricing card settings state
  const [pricing, setPricing] = useState<DynamicPricing>(() => {
    try {
      const stored = localStorage.getItem('fencing_custom_pricing');
      if (stored) return JSON.parse(stored);
    } catch {}
    return {
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
  });

  // Interactive core state
  const [material, setMaterial] = useState<FenceMaterial>('slat_fencing');
  const [height, setHeight] = useState<FenceHeight>(1500);
  const [color, setColor] = useState<ColorOption>(COLORS_PALETTE.find(c => c.name === 'Monument Grey') || COLORS_PALETTE[0]);
  const [postColor, setPostColor] = useState<ColorOption>(COLORS_PALETTE.find(c => c.name === 'Monument Grey') || COLORS_PALETTE[0]);
  const [railCount, setRailCount] = useState<2 | 3>(3);
  const [slatProfile, setSlatProfile] = useState<'65' | '90'>('65');
  const [fenceScale, setFenceScale] = useState<number>(1.0); // locked to 1.0 (controlled by global height drop-down)
  const [propertyFrontage, setPropertyFrontage] = useState<number>(15); // standard 15m front lot

  // Nodes (posts) state - Blank Slate
  const [posts, setPosts] = useState<Post[]>([]);
  // Lines (panels) state - Blank Slate
  const [segments, setSegments] = useState<Segment[]>([]);

  // Background environment image state - Blank Slate
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");
  const [customImageUploaded, setCustomImageUploaded] = useState<boolean>(false);

  // Focus inspection state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Helpful instructions toggle modal
  const [showTutorial, setShowTutorial] = useState<boolean>(false);

  // Layout structural toggles for decluttering & tablet optimization
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState<boolean>(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Auto-respond to tablet formats on screen resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1200) {
        setIsRightPanelOpen(false); // start with right panel collapsed on tablet size to give maximum image room
        setIsLeftPanelOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Synchronize posts to automatically garbage-collect standalone/orphaned posts/pillars
  useEffect(() => {
    if (posts.length > 0) {
      const activePostIds = new Set<string>();
      segments.forEach(seg => {
        activePostIds.add(seg.startPostId);
        activePostIds.add(seg.endPostId);
      });
      
      const orphanedPosts = posts.filter(p => !activePostIds.has(p.id));
      if (orphanedPosts.length > 0) {
        setPosts(prev => prev.filter(p => activePostIds.has(p.id)));
        
        // If the selected post is one of the orphaned posts, clear the selection
        if (selectedPostId && !activePostIds.has(selectedPostId)) {
          setSelectedPostId(null);
        }
      }
    }
  }, [segments, posts, selectedPostId]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full max-w-full bg-[#000000] text-zinc-100 font-sans p-4 relative overflow-hidden select-none">
        
        {/* Ambient background accent */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-rose-950/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-[#f20c32]/5 blur-3xl pointer-events-none" />
        
        {/* Main login container */}
        <div className="w-full max-w-[440px] bg-[#141517] border border-[#2f3136] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden relative z-10 flex flex-col">
          
          {/* Header block with red fence badge */}
          <div className="bg-[#0b0c0d] border-b border-[#2f3136] p-8 flex flex-col items-center">
            <div className="w-[76px] h-[76px] bg-[#f20c32] flex items-center justify-center rounded-lg shadow-lg mb-4">
              <FenceLogo className="w-11 h-11 text-white animate-pulse" />
            </div>
            
            <div className="flex flex-col items-center select-none mt-2">
              <span className="text-[26px] font-black text-[#f20c32] tracking-[0.05em] uppercase leading-none font-sans" style={{ letterSpacing: '0.04em' }}>
                FENCING
              </span>
              <div className="bg-[#f20c32] h-[16px] mt-1 flex items-center justify-end px-1.5 min-w-[130px] rounded-[1px]">
                <span className="text-[9px] font-black text-black tracking-[0.15em] uppercase leading-none">
                  PRO
                </span>
              </div>
            </div>
            
            <div className="border border-[#2f3136] bg-[#141517] px-3 py-1 mt-4 rounded-full">
              <span className="text-[9px] font-bold text-zinc-400 tracking-[0.18em] uppercase">
                PORTAL ACCESS
              </span>
            </div>
          </div>

          {/* Form section */}
          <form onSubmit={handleLogin} className="p-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">
                Enterprise Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter access code"
                  className="w-full h-11 bg-[#1a1b1f] border border-[#2f3136] focus:border-[#f20c32]/50 focus:ring-1 focus:ring-[#f20c32]/40 rounded-lg pl-10 pr-12 text-xs tracking-widest text-white placeholder-zinc-600 transition outline-none"
                  autoFocus
                  required
                />
                <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 bg-[#212327] hover:bg-[#2e3137] border border-zinc-700/50 hover:border-zinc-500 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white transition-all shadow-sm focus:outline-none"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5 text-rose-500" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {passwordError && (
              <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3 flex items-start gap-2 text-rose-400">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-normal font-medium">{passwordError}</span>
              </div>
            )}

            {/* Hold session logic */}
            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#f20c32] bg-[#1a1b1f] border-zinc-700 rounded cursor-pointer"
                />
                <span className="text-[11px] text-zinc-400 font-sans">Remember login on this device</span>
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="w-full h-11 bg-[#f20c32] hover:bg-[#d60a2b] active:scale-[0.98] text-white text-xs font-bold tracking-widest uppercase rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <span>Authenticate Portal</span>
            </button>
          </form>

          {/* Verification check lines */}
          <div className="bg-[#0b0c0d] border-t border-[#2f3136] py-3.5 px-6 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
            <span>AS-2423 SECURE VAULT</span>
            <span>SYSTEM v4.1</span>
          </div>
        </div>

        {/* Legal copyright footer */}
        <div className="text-[11px] font-mono text-zinc-500 text-center mt-6 tracking-wide select-none z-10 max-w-sm leading-relaxed">
          Fencing Pro Pty Ltd &copy; 2026. This secure visualizer environment has been custom-hardened for certified team consultants.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full max-w-full bg-[#141517] text-zinc-100 overflow-hidden font-sans select-none">
      
      {/* Primary header brand bar exactly matching the Fencing Pro visual guidelines */}
      {!isFullScreen ? (
        <header className="h-[76px] border-b border-[#2f3136] bg-[#000000] flex items-center justify-between px-0 shrink-0 z-40 shadow-xl">
          
          {/* Leftmost brand signature logo blocks based on input_file_1.png */}
          <div className="flex items-center h-full select-none shrink-0">
            {/* Accent red square block with white stylized Fence logo inside */}
            <div className="w-[76px] h-[76px] bg-[#f20c32] flex items-center justify-center shrink-0 border-r border-[#222]">
              <FenceLogo className="w-11.5 h-11.5 text-white animate-pulse" />
            </div>

            <div className="flex flex-col justify-center pl-6 pr-6 h-full border-r border-[#2f3136]">
              <div className="flex flex-col select-none">
                <span className="text-[25px] font-black text-[#f20c32] tracking-[0.05em] uppercase leading-none font-sans" style={{ letterSpacing: '0.04em' }}>
                  FENCING
                </span>
                <div className="bg-[#f20c32] h-[15px] mt-1 flex items-center justify-end px-1.5 w-full">
                  <span className="text-[9px] font-black text-black tracking-[0.15em] uppercase leading-none">
                    PRO
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Corporate License & Identity details in the middle */}
          <div className="hidden xl:flex flex-col items-start gap-0.5 text-zinc-400 font-sans px-4 shrink">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">
              <span>Corporate Boundary Designer</span>
              <span className="text-zinc-700">&#8226;</span>
              <span className="text-teal-400 font-bold">Interactive Suite</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-300 tracking-wider">
              2026 Fencing Pro Pty Ltd
            </span>
          </div>

          {/* Multi-info indicators */}
          <div className="hidden 2xl:flex items-center gap-6 text-xs text-zinc-400 pl-4 border-l border-zinc-800 shrink">
            <div className="flex items-center gap-1.5 pr-4 py-1">
              <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] text-zinc-500 font-bold uppercase leading-none">Market Level</span>
                <span className="text-white text-[11px] font-semibold mt-0.5">NSW Metropolitan</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pr-4 py-1 border-l border-zinc-800 pl-4">
              <Clock className="w-4 h-4 text-rose-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] text-zinc-500 font-bold uppercase leading-none">Fencing Standards</span>
                <span className="text-white text-[11px] font-semibold mt-0.5">AS-2423 Approved</span>
              </div>
            </div>
          </div>

          {/* Quick action buttons on right */}
          <div className="flex items-center gap-2 px-6 shrink-0 flex-nowrap">
            {/* Controls toggle */}
            <button
              onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
              className={`p-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold border transition-all cursor-pointer ${
                isLeftPanelOpen
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
              }`}
              title="Toggle left design control sidebar"
            >
              <Sliders className="w-4 h-4" />
              <span className="hidden leading-none md:inline">Tools</span>
            </button>

            {/* Pricing toggle */}
            <button
              onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
              className={`p-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold border transition-all cursor-pointer ${
                isRightPanelOpen
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
              }`}
              title="Toggle right pricing breakdown sidebar"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden leading-none md:inline">Price</span>
            </button>

            {/* Tutorial button */}
            <button
              onClick={() => setShowTutorial(true)}
              className="p-2 bg-[#2b2d31] hover:bg-[#34363c] text-rose-300 rounded-lg transition-colors cursor-pointer border border-rose-500/15 flex items-center justify-center gap-1.5 text-xs font-semibold"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Guide</span>
            </button>

            {/* Lock Portal button */}
            <button
              onClick={handleLogout}
              className="p-2 bg-[#f20c32] hover:bg-[#d60a2b] text-white rounded-lg transition-colors cursor-pointer border border-[#f20c32]/30 flex items-center justify-center gap-1.5 text-xs font-bold"
              title="Lock Portal (Log Out)"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Lock Portal</span>
            </button>
          </div>
        </header>
      ) : null}

      {/* Primary visualizer studio board split */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-0 bg-[#141517] relative">
        
        {/* Step-by-step customizer on LHS */}
        {!isFullScreen && (
          <div className={`transition-all duration-300 ease-in-out h-full overflow-hidden shrink-0 ${
            isLeftPanelOpen ? 'w-80 sm:w-96 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}>
            <SidebarControls
              activeTab={activeTab}
              setActiveTab={(tab) => {
                if (activeTab === tab && isLeftPanelOpen) {
                  setIsLeftPanelOpen(false);
                } else {
                  setIsLeftPanelOpen(true);
                  setActiveTab(tab);
                  // Auto unselect when choosing tabs to keep canvas clean
                  setSelectedPostId(null);
                  setSelectedSegmentId(null);
                }
              }}
              material={material}
              setMaterial={(mat) => {
                setMaterial(mat);
                // Default logical colors when selecting corresponding materials to match looks!
                if (mat === 'post_and_rail') {
                  const woodOpt = COLORS_PALETTE.find(c => c.name === 'Raw Natural Wood') || COLORS_PALETTE[3];
                  setColor(woodOpt);
                  setPostColor(woodOpt);
                } else {
                  const monOpt = COLORS_PALETTE.find(c => c.name === 'Monument Grey') || COLORS_PALETTE[0];
                  setColor(monOpt);
                  setPostColor(monOpt);
                }
              }}
              railCount={railCount}
              setRailCount={setRailCount}
              height={height}
              setHeight={setHeight}
              color={color}
              setColor={setColor}
              postColor={postColor}
              setPostColor={setPostColor}
              posts={posts}
              setPosts={setPosts}
              segments={segments}
              setSegments={setSegments}
              propertyFrontage={propertyFrontage}
              setPropertyFrontage={setPropertyFrontage}
              selectedPostId={selectedPostId}
              setSelectedPostId={setSelectedPostId}
              setIsLeftPanelOpen={setIsLeftPanelOpen}
              pricing={pricing}
              setPricing={setPricing}
              slatProfile={slatProfile}
              setSlatProfile={setSlatProfile}
            />
          </div>
        )}

        {/* Interactive Visualizer Canvas in Center */}
        <div className={`flex-1 min-w-0 p-5.5 flex flex-col min-h-0 relative z-10 transition-all duration-300 ${isFullScreen ? 'fixed inset-0 z-50 bg-[#141517] p-0' : ''}`}>
          
          {/* Persistent Touch/Click-Friendly Expand Edge Handles on borders of Canvas */}
          {!isLeftPanelOpen && !isFullScreen && (
            <button
              onClick={() => setIsLeftPanelOpen(true)}
              className="absolute left-6 top-1/2 -translate-y-1/2 bg-teal-500 hover:bg-teal-400 text-[#141517] w-8 h-20 rounded-r-xl flex flex-col items-center justify-center shadow-2xl z-40 transition-all group border-l border-teal-300/30 cursor-pointer"
              title="Expand Design Controls Panel"
            >
              <ChevronRight className="w-5 h-5 animate-bounce" />
              <span className="text-[9px] font-black uppercase tracking-widest font-sans [writing-mode:vertical-lr] select-none mt-1 group-hover:scale-105">Tools</span>
            </button>
          )}

          {!isRightPanelOpen && !isFullScreen && (
            <button
              onClick={() => setIsRightPanelOpen(true)}
              className="absolute right-6 top-1/2 -translate-y-1/2 bg-teal-500 hover:bg-teal-400 text-[#141517] w-8 h-20 rounded-l-xl flex flex-col items-center justify-center shadow-2xl z-40 transition-all group border-r border-[#2f3136] cursor-pointer"
              title="Expand Price Estimate Panel"
            >
              <ChevronLeft className="w-5 h-5 animate-bounce" />
              <span className="text-[9px] font-black uppercase tracking-widest font-sans [writing-mode:vertical-lr] select-none mt-1 group-hover:scale-105">Price</span>
            </button>
          )}

          <FenceCanvas
            material={material}
            railCount={railCount}
            height={height}
            color={color}
            posts={posts}
            setPosts={setPosts}
            segments={segments}
            setSegments={setSegments}
            backgroundUrl={backgroundUrl}
            setBackgroundUrl={setBackgroundUrl}
            customImageUploaded={customImageUploaded}
            setCustomImageUploaded={setCustomImageUploaded}
            fenceScale={fenceScale}
            setFenceScale={setFenceScale}
            postColor={postColor}
            setPostColor={setPostColor}
            selectedPostId={selectedPostId}
            setSelectedPostId={setSelectedPostId}
            selectedSegmentId={selectedSegmentId}
            setSelectedSegmentId={setSelectedSegmentId}
            propertyFrontage={propertyFrontage}
            setPropertyFrontage={setPropertyFrontage}
            isFullScreen={isFullScreen}
            setIsFullScreen={setIsFullScreen}
            setIsLeftPanelOpen={setIsLeftPanelOpen}
            activeTab={activeTab}
            slatProfile={slatProfile}
          />
        </div>

        {/* Detailed Itemized Estimates and Actions panel on RHS */}
        {!isFullScreen && (
          <div className={`transition-all duration-300 ease-in-out h-full overflow-hidden shrink-0 ${
            isRightPanelOpen ? 'w-80 sm:w-92 opacity-100 border-l border-[#2f3136]' : 'w-0 opacity-0 pointer-events-none'
          }`}>
            <EstimateSummary
              material={material}
              height={height}
              color={color}
              postColor={postColor}
              posts={posts}
              segments={segments}
              propertyFrontage={propertyFrontage}
              setIsRightPanelOpen={setIsRightPanelOpen}
              customPricing={pricing}
            />
          </div>
        )}

      </div>

      {/* HOW-IT-WORKS SYSTEM OVERLAY MODAL */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
          <div className="bg-[#1f2125] border border-zinc-700 w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            
            <div className="px-6 py-4.5 bg-[#141517] border-b border-[#2f3136] flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Fencing Pro Companion Guide</span>
              <button 
                onClick={() => setShowTutorial(false)}
                className="text-zinc-500 hover:text-white transition cursor-pointer"
              >
                CLOSE [x]
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-5 leading-relaxed text-zinc-300 font-sans">
              <h3 className="text-sm font-extrabold text-rose-500 uppercase tracking-widest leading-none">Interactive Visual Boundary Controls</h3>
              <p className="text-xs text-zinc-400">
                This simulator is designed to give Fencing Pro consultants and their respected clients a professional edge by overlaying highly accurate, responsive boundary design mockups onto residential properties.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                <div className="bg-[#18191c] p-4.5 rounded-xl border border-zinc-800">
                  <span className="text-xs font-bold text-white block mb-1">📌 Drag Anchor Handles</span>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Drag the circular anchors overlaying the grass to stretch and fit the fence directly along lawn contours. It calculates matching spatial spacing and physical structural lengths.
                  </p>
                </div>
                
                <div className="bg-[#18191c] p-4.5 rounded-xl border border-zinc-800">
                  <span className="text-xs font-bold text-white block mb-1">🎨 Premium Colors Palette</span>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Select between Monument, Surfmist, Basalt, or Hardwood Woodgrains. Contrast colors by assigning separate finishes to vertical posts and horizontal slats.
                  </p>
                </div>

                <div className="bg-[#18191c] p-4.5 rounded-xl border border-zinc-800">
                  <span className="text-xs font-bold text-white block mb-1">🗒 Interactive Post & Slat Editors</span>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Click any post directly on canvas to upgrade to standard, corner, H-post, gate support, or decorative columns. Click any fence segment to mount gates and slide their width.
                  </p>
                </div>

                <div className="bg-[#18191c] p-4.5 rounded-xl border border-zinc-800">
                  <span className="text-xs font-bold text-white block mb-1">📸 Client Photo Overlay</span>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Snap a photo of the client's property, upload it directly with the <strong>Upload Photo</strong> button on the canvas, and trace the mockup on their real home grounds!
                  </p>
                </div>
              </div>

              <div className="border-t border-[#2f3136] pt-4 flex justify-end">
                <button
                  onClick={() => setShowTutorial(false)}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer"
                >
                  Embark Design
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
