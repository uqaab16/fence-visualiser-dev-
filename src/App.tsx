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
import { CLIENT_CONFIG } from './clientConfig';
import { useAuth } from './hooks/useAuth';
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
  Mail,
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
  // Supabase auth
  const { session, loading: authLoading, signIn, signOut } = useAuth();
  const [emailInput, setEmailInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [magicLinkSent, setMagicLinkSent] = useState<boolean>(false);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await signIn(emailInput.trim());
    if (error) {
      setAuthError(error.message);
    } else {
      setMagicLinkSent(true);
    }
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

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-slate-500 text-sm font-mono animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full max-w-full bg-white text-slate-900 font-sans p-4 relative overflow-hidden select-none">

        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-orange-50/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: CLIENT_CONFIG.logoAccentColor + '0d' }} />

        <div className="w-full max-w-[440px] bg-white border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden relative z-10 flex flex-col">

          <div className="bg-white border-b border-slate-200 p-8 flex flex-col items-center">
            <img
              src={`${import.meta.env.BASE_URL}${CLIENT_CONFIG.logoFileName}`}
              alt={CLIENT_CONFIG.companyName}
              className="w-40 h-40 object-contain select-none"
            />

            <div className="border border-slate-200 bg-white px-3 py-1 mt-2 rounded-full">
              <span className="text-[9px] font-bold text-slate-500 tracking-[0.18em] uppercase">
                SIGN IN
              </span>
            </div>
          </div>

          {magicLinkSent ? (
            <div className="p-8 flex flex-col items-center gap-4 text-center">
              <Mail className="w-10 h-10 text-slate-500" />
              <p className="text-sm text-slate-700 font-semibold">Check your inbox</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                We sent a magic link to <span className="text-slate-900 font-medium">{emailInput}</span>. Click the link in your email to sign in.
              </p>
              <button
                onClick={() => { setMagicLinkSent(false); setEmailInput(''); }}
                className="text-[11px] text-slate-500 hover:text-slate-700 underline underline-offset-2 cursor-pointer mt-2"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="p-8 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                  Email Address
                </label>
                <div className="relative mt-1">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full h-11 bg-white border border-slate-200 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/40 rounded-lg pl-10 pr-4 text-xs tracking-wider text-slate-900 placeholder-slate-400 transition outline-none"
                    autoFocus
                    required
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {authError && (
                <div className="bg-orange-50/20 border border-orange-200/40 rounded-lg p-3 flex items-start gap-2 text-orange-600">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-normal font-medium">{authError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full h-11 hover:opacity-90 active:scale-[0.98] text-white text-xs font-bold tracking-widest uppercase rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
                style={{ backgroundColor: CLIENT_CONFIG.primaryColor }}
              >
                <span>Send Magic Link</span>
              </button>
            </form>
          )}

          <div className="bg-white border-t border-slate-200 py-3.5 px-6 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>{CLIENT_CONFIG.footerSecurityText}</span>
            <span>{CLIENT_CONFIG.footerSystemText}</span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-500 text-center mt-6 tracking-wide select-none z-10 max-w-sm leading-relaxed">
          {CLIENT_CONFIG.loginFooterText}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full max-w-full bg-white text-slate-900 overflow-hidden font-sans select-none">
      
      {/* Primary header brand bar exactly matching the Fencing Pro visual guidelines */}
      {!isFullScreen ? (
        <header className="h-[76px] border-b border-slate-200 bg-white flex items-center justify-between px-0 shrink-0 z-40 shadow-xl">
          
          {/* Leftmost brand signature logo lockup */}
          <div className="flex items-center h-full select-none shrink-0">
            <div className="flex items-center h-full pl-5 pr-6 border-r border-slate-200">
              <img
                src={`${import.meta.env.BASE_URL}${CLIENT_CONFIG.logoFileName}`}
                alt={CLIENT_CONFIG.companyName}
                className="h-[62px] w-auto object-contain"
              />
            </div>
          </div>

          {/* Corporate License & Identity details in the middle */}
          <div className="hidden xl:flex flex-col items-start gap-0.5 text-slate-500 font-sans px-4 shrink">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
              <span>{CLIENT_CONFIG.companyTagline.split(' · ')[0]}</span>
              <span className="text-slate-700">&#8226;</span>
              <span className="text-orange-600 font-bold">{CLIENT_CONFIG.companyTagline.split(' · ')[1]}</span>
            </div>
            <span className="text-[11px] font-mono text-slate-700 tracking-wider">
              {CLIENT_CONFIG.companyLegal}
            </span>
          </div>

          {/* Multi-info indicators */}
          <div className="hidden 2xl:flex items-center gap-6 text-xs text-slate-500 pl-4 border-l border-slate-200 shrink">
            <div className="flex items-center gap-1.5 pr-4 py-1">
              <MapPin className="w-4 h-4 text-orange-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-bold uppercase leading-none">Market Level</span>
                <span className="text-slate-900 text-[11px] font-semibold mt-0.5">{CLIENT_CONFIG.marketRegion}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pr-4 py-1 border-l border-slate-200 pl-4">
              <Clock className="w-4 h-4 text-orange-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-bold uppercase leading-none">Fencing Standards</span>
                <span className="text-slate-900 text-[11px] font-semibold mt-0.5">{CLIENT_CONFIG.fencingStandard}</span>
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
                  ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'
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
                  ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'
              }`}
              title="Toggle right pricing breakdown sidebar"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden leading-none md:inline">Price</span>
            </button>

            {/* Tutorial button */}
            <button
              onClick={() => setShowTutorial(true)}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-orange-500 rounded-lg transition-colors cursor-pointer border border-orange-500/15 flex items-center justify-center gap-1.5 text-xs font-semibold"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Guide</span>
            </button>

            {/* Lock Portal button */}
            <button
              onClick={signOut}
              className="p-2 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold hover:opacity-90"
              style={{ backgroundColor: CLIENT_CONFIG.primaryColor, borderColor: CLIENT_CONFIG.primaryColor + '4d', border: '1px solid' }}
              title="Lock Portal (Log Out)"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Lock Portal</span>
            </button>
          </div>
        </header>
      ) : null}

      {/* Primary visualizer studio board split */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-0 bg-white relative">
        
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
        <div className={`flex-1 min-w-0 p-5.5 flex flex-col min-h-0 relative z-10 transition-all duration-300 ${isFullScreen ? 'fixed inset-0 z-50 bg-white p-0' : ''}`}>
          
          {/* Persistent Touch/Click-Friendly Expand Edge Handles on borders of Canvas */}
          {!isLeftPanelOpen && !isFullScreen && (
            <button
              onClick={() => setIsLeftPanelOpen(true)}
              className="absolute left-6 top-1/2 -translate-y-1/2 bg-orange-500 hover:bg-orange-500 text-slate-900 w-8 h-20 rounded-r-xl flex flex-col items-center justify-center shadow-2xl z-40 transition-all group border-l border-orange-400/30 cursor-pointer"
              title="Expand Design Controls Panel"
            >
              <ChevronRight className="w-5 h-5 animate-bounce" />
              <span className="text-[9px] font-black uppercase tracking-widest font-sans [writing-mode:vertical-lr] select-none mt-1 group-hover:scale-105">Tools</span>
            </button>
          )}

          {!isRightPanelOpen && !isFullScreen && (
            <button
              onClick={() => setIsRightPanelOpen(true)}
              className="absolute right-6 top-1/2 -translate-y-1/2 bg-orange-500 hover:bg-orange-500 text-slate-900 w-8 h-20 rounded-l-xl flex flex-col items-center justify-center shadow-2xl z-40 transition-all group border-r border-slate-200 cursor-pointer"
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
            isRightPanelOpen ? 'w-80 sm:w-92 opacity-100 border-l border-slate-200' : 'w-0 opacity-0 pointer-events-none'
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
        <div className="fixed inset-0 bg-white/90 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-slate-300 w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            
            <div className="px-6 py-4.5 bg-white border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Fencely Guide</span>
              <button 
                onClick={() => setShowTutorial(false)}
                className="text-slate-500 hover:text-slate-900 transition cursor-pointer"
              >
                CLOSE [x]
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-5 leading-relaxed text-slate-700 font-sans">
              <h3 className="text-sm font-extrabold text-orange-600 uppercase tracking-widest leading-none">Interactive Visual Boundary Controls</h3>
              <p className="text-xs text-slate-500">
                This simulator is designed to give Fencely users and their respected clients a professional edge by overlaying highly accurate, responsive boundary design mockups onto residential properties.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-900 block mb-1">📌 Drag Anchor Handles</span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Drag the circular anchors overlaying the grass to stretch and fit the fence directly along lawn contours. It calculates matching spatial spacing and physical structural lengths.
                  </p>
                </div>
                
                <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-900 block mb-1">🎨 Premium Colors Palette</span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Select between Monument, Surfmist, Basalt, or Hardwood Woodgrains. Contrast colors by assigning separate finishes to vertical posts and horizontal slats.
                  </p>
                </div>

                <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-900 block mb-1">🗒 Interactive Post & Slat Editors</span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Click any post directly on canvas to upgrade to standard, corner, H-post, gate support, or decorative columns. Click any fence segment to mount gates and slide their width.
                  </p>
                </div>

                <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-900 block mb-1">📸 Client Photo Overlay</span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Snap a photo of the client's property, upload it directly with the <strong>Upload Photo</strong> button on the canvas, and trace the mockup on their real home grounds!
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 flex justify-end">
                <button
                  onClick={() => setShowTutorial(false)}
                  className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer"
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
