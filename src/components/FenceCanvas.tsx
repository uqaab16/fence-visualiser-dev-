/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import SatelliteModal from './SatelliteModal';
import { Post, Segment, FenceMaterial, FenceHeight, ColorOption } from '../types';
import { calculateDistance, COLORS_PALETTE, MATERIAL_MAX_SPAN } from '../utils';
import { 
  Move, 
  Plus, 
  Trash2, 
  Sliders, 
  Maximize2, 
  Layers, 
  Eye, 
  CheckCircle2, 
  DoorClosed, 
  TriangleAlert,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Minimize2,
  Hand,
  Compass,
  GitCommit,
  Undo,
  Download,
  X
} from 'lucide-react';

interface FenceCanvasProps {
  material: FenceMaterial;
  height: FenceHeight;
  color: ColorOption;
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  segments: Segment[];
  setSegments: React.Dispatch<React.SetStateAction<Segment[]>>;
  backgroundUrl: string;
  setBackgroundUrl: (url: string) => void;
  customImageUploaded: boolean;
  setCustomImageUploaded: (val: boolean) => void;
  fenceScale: number; // visual scalar (0.5 to 2.0)
  setFenceScale: (val: number) => void;
  postColor: ColorOption;
  setPostColor: (val: ColorOption) => void;
  selectedPostId: string | null;
  setSelectedPostId: (id: string | null) => void;
  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string | null) => void;
  propertyFrontage: number;
  setPropertyFrontage?: (val: number) => void;
  isFullScreen?: boolean;
  setIsFullScreen?: (val: boolean) => void;
  setIsLeftPanelOpen?: (val: boolean) => void;
  activeTab: string;
  slatProfile?: '65' | '90';
  solidPanelProfile?: 'sawtooth' | 'trimline';
  includeChainwire?: boolean;
  railCount?: 2 | 3 | 4;
}

// Darken (factor < 1) or lighten (factor > 1) a #rrggbb hex color, used for procedural shading
// of 2.5D blade side-faces. Returns an rgb() string clamped to valid 0–255 channels.
function shadeHex(hex: string, factor: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(m[1], 16) * factor);
  const g = clamp(parseInt(m[2], 16) * factor);
  const b = clamp(parseInt(m[3], 16) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function FenceCanvas({
  material,
  railCount = 3,
  height,
  color,
  posts,
  setPosts,
  segments,
  setSegments,
  backgroundUrl,
  setBackgroundUrl,
  customImageUploaded,
  setCustomImageUploaded,
  fenceScale,
  setFenceScale,
  postColor,
  setPostColor,
  selectedPostId,
  setSelectedPostId,
  selectedSegmentId,
  setSelectedSegmentId,
  propertyFrontage,
  setPropertyFrontage,
  isFullScreen = false,
  setIsFullScreen,
  setIsLeftPanelOpen,
  activeTab,
  slatProfile = '65',
  solidPanelProfile = 'trimline',
  includeChainwire = false
}: FenceCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomBoxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [globalOffset, setGlobalOffset] = useState({ x: 0, y: 0 }); // slide fence sideways/up/down
  const [dragOffsetStart, setDragOffsetStart] = useState({ x: 0, y: 0 });
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [showHelperGrid, setShowHelperGrid] = useState(true);
  const [showSatelliteModal, setShowSatelliteModal] = useState(false);

  // States for Undo/Redo design layout rollback
  const [history, setHistory] = useState<{ posts: Post[]; segments: Segment[] }[]>([]);

  // Deep clone and push snapshot to history before and during changes
  const pushHistory = (currentPosts: Post[] = posts, currentSegments: Segment[] = segments) => {
    const snap = {
      posts: currentPosts.map(p => ({ ...p })),
      segments: currentSegments.map(s => ({ ...s }))
    };
    setHistory(prev => {
      const trimmed = prev.slice(-49); // Keep max 50 history nodes
      return [...trimmed, snap];
    });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prevStates = [...history];
    const prevState = prevStates.pop();
    if (prevState) {
      setPosts(prevState.posts);
      setSegments(prevState.segments);
      setHistory(prevStates);
      
      if (selectedPostId && !prevState.posts.some(p => p.id === selectedPostId)) {
        setSelectedPostId(null);
      }
      if (selectedSegmentId && !prevState.segments.some(s => s.id === selectedSegmentId)) {
        setSelectedSegmentId(null);
      }
    }
  };

  // Snaps coordinate to nearest grid intersection or standard 5% increments
  const snapToGrid = (val: number) => {
    // 6x6 Grid divisions are at multiples of 16.6666
    const step = 100 / 6;
    const nearestIntersection = Math.round(val / step) * step;
    if (Math.abs(val - nearestIntersection) < 3.0) {
      return nearestIntersection;
    }
    // Standard 5% increment snapping
    const nearestFive = Math.round(val / 5) * 5;
    if (Math.abs(val - nearestFive) < 1.0) {
      return nearestFive;
    }
    return val;
  };

  // States for Zoom and Panning of the entire Canvas view
  const [zoom, setZoom] = useState<number>(1);
  const [viewportPan, setViewportPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState<boolean>(false);
  const [isViewportPanning, setIsViewportPanning] = useState<boolean>(false);
  const [viewportPanStart, setViewportPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Floating controls minimization states
  const [isShiftResizeMinimized, setIsShiftResizeMinimized] = useState<boolean>(false);
  const [isPostCustomizerMinimized, setIsPostCustomizerMinimized] = useState<boolean>(false);
  const [isSegmentCustomizerMinimized, setIsSegmentCustomizerMinimized] = useState<boolean>(false);

  // States for Gate interactive drag 'n resize operations
  const [activeGateDragId, setActiveGateDragId] = useState<string | null>(null);
  const [gateDragType, setGateDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [gateDragStartPct, setGateDragStartPct] = useState<number>(0);
  const [gateDragStartPos, setGateDragStartPos] = useState<number>(0);
  const [gateDragStartWidth, setGateDragStartWidth] = useState<number>(0);

  // States for standalone gate full body dragging
  const [standaloneGateStartCoords, setStandaloneGateStartCoords] = useState<{ x: number, y: number } | null>(null);
  const [standaloneGateStartPosts, setStandaloneGateStartPosts] = useState<{
    startPost: { x: number, y: number };
    endPost: { x: number, y: number };
  } | null>(null);

  // Insert Post mode: user clicks a segment to split it with a new post
  const [isInsertPostMode, setIsInsertPostMode] = useState<boolean>(false);
  // Ghost preview while hovering over a segment in Insert Post mode
  const [insertPostHover, setInsertPostHover] = useState<{
    segmentId: string;
    t: number;        // 0–1 along segment
    x: number;        // SVG % coords
    y: number;
    valid: boolean;   // false = too close to endpoint (red cursor)
  } | null>(null);

  // Perspective scaling disabled: inferring depth from Y-position in a flat 2D photo
  // is camera-angle-dependent and unreliable across arbitrary user photos. Constant 1.0
  // renders all fence elements at uniform scale, which is always visually correct.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getPerspectiveScale = (_yPct: number) => 1.0;

  // Helper to calculate locked physical gate widths as exact SVG percentages
  const getGateSpanPcts = (seg: Segment, segmentLength: number) => {
    if (!seg.hasGate) return { startPct: 0, endPct: 0 };
    const gatePhysicalWidthMeters = seg.gateType === 'double' ? 4.0 : 1.2;
    const gateSvgWidth = (gatePhysicalWidthMeters / propertyFrontage) * 100;
    const gateFrac = Math.min(gateSvgWidth / segmentLength, 1.0);
    const gp = seg.gatePositionPercent !== undefined ? seg.gatePositionPercent : 40;
    const startPct = Math.min(gp / 100, 1.0 - gateFrac);
    const endPct = startPct + gateFrac;
    return { startPct, endPct };
  };

  // Projection helper to calculate t param (0 to 1) of point on line segment
  const getProjectionPct = (px: number, py: number, p1: { x: number, y: number }, p2: { x: number, y: number }) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return 0;
    const t = ((px - p1.x) * dx + (py - p1.y) * dy) / lenSq;
    return Math.min(Math.max(t, 0), 1);
  };

  // Aspect ratio tracker for the background image
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  // Mandatory intermediate structural line posts, allocated across drawn segments so the
  // visual post count always matches the billed count in estimateFencingCosts.
  // Uses material-specific max span from MATERIAL_MAX_SPAN (e.g. 2.4m for slat, 2.364m for blade).
  const intermediatePostCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const maxSpan = MATERIAL_MAX_SPAN[material] ?? 2.4;
    const totalIntermediatePosts = Math.max(0, Math.ceil(propertyFrontage / maxSpan) - 1);

    const segLengths = segments.map(seg => {
      const a = posts.find(p => p.id === seg.startPostId);
      const b = posts.find(p => p.id === seg.endPostId);
      if (!a || !b) return 0;
      return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    });
    const totalLength = segLengths.reduce((sum, l) => sum + l, 0);

    if (totalLength <= 0 || totalIntermediatePosts <= 0) {
      segments.forEach(seg => counts.set(seg.id, 0));
      return counts;
    }

    const raw = segLengths.map(l => (l / totalLength) * totalIntermediatePosts);
    const base = raw.map(r => Math.floor(r));
    let remaining = totalIntermediatePosts - base.reduce((sum, b) => sum + b, 0);
    const order = raw
      .map((r, i) => ({ i, frac: r - base[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remaining; k++) {
      base[order[k].i] += 1;
    }
    segments.forEach((seg, idx) => counts.set(seg.id, base[idx]));
    return counts;
  }, [segments, posts, propertyFrontage, material]);

  // Track container dimensions to scale the zoomBox wrapper accurately without cropping the image
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const [showTipBanner, setShowTipBanner] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fencing_pro_dismiss_tip') !== 'true';
    } catch {
      return true;
    }
  });

  const dismissTipBanner = () => {
    setShowTipBanner(false);
    try {
      localStorage.setItem('fencing_pro_dismiss_tip', 'true');
    } catch {}
  };

  // Measure the natural aspect ratio of the loaded image and reset viewport positions to prevent cropping
  useEffect(() => {
    if (!backgroundUrl) return;
    
    // Always reset viewport pans and zoom to prevent previous custom translations from cropping the new image
    setZoom(1);
    setViewportPan({ x: 0, y: 0 });

    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImageAspectRatio(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = backgroundUrl;
  }, [backgroundUrl]);

  // Listen to visualizer container resizing to update layout matches
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Compute fitting dimensions for the canvas viewport zoomBox wrapper without any cropping
  let zoomBoxWidth = containerSize.width;
  let zoomBoxHeight = containerSize.height;

  if (imageAspectRatio) {
    const containerRatio = containerSize.width / containerSize.height;
    if (containerRatio > imageAspectRatio) {
      // Container is wider than the image aspect ratio
      zoomBoxHeight = containerSize.height;
      zoomBoxWidth = containerSize.height * imageAspectRatio;
    } else {
      // Container is narrower than the image aspect ratio
      zoomBoxWidth = containerSize.width;
      zoomBoxHeight = containerSize.width / imageAspectRatio;
    }
  }

  // Reset minimizing states on selection changes
  useEffect(() => {
    setIsPostCustomizerMinimized(false);
  }, [selectedPostId]);

  useEffect(() => {
    setIsSegmentCustomizerMinimized(false);
  }, [selectedSegmentId]);

  // Default house image from assets
  const defaultHouseImg = "/src/assets/images/modern_sydney_house_1780306939586.png";

  // Handle custom image uploads
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setBackgroundUrl(reader.result);
          setCustomImageUploaded(true);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const loadDefaultImage = () => {
    setBackgroundUrl(defaultHouseImg);
    setCustomImageUploaded(false);
    
    // Seed default fence positions for the demo house so there is a pre-configured fence layout
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

    setPosts(DEFAULT_POSTS);
    setSegments(DEFAULT_SEGMENTS);
  };

  const handleClearCanvas = () => {
    setBackgroundUrl("");
    setCustomImageUploaded(false);
    setPosts([]);
    setSegments([]);
    setSelectedPostId(null);
    setSelectedSegmentId(null);
    setHistory([]);
  };

  const handleResetDesign = () => {
    setPosts([]);
    setSegments([]);
    setSelectedPostId(null);
    setSelectedSegmentId(null);
    setHistory([]);
  };

  // Convert client cursor coords to container percentage values
  const getPercentageCoords = (clientX: number, clientY: number) => {
    const targetRef = zoomBoxRef.current || containerRef.current;
    if (!targetRef) return { x: 50, y: 50 };
    const rect = targetRef.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x,
      y
    };
  };

  // Panel dragging positions
  const [dragPanel, setDragPanel] = useState<string | null>(null);
  const [dragPanelStart, setDragPanelStart] = useState<{ x: number, y: number }>({ x: 0, y: 0 });

  const [repositionOffset, setRepositionOffset] = useState({ x: 0, y: 0 });
  const [viewEngineOffset, setViewEngineOffset] = useState({ x: 0, y: 0 });
  const [postCustomizerOffset, setPostCustomizerOffset] = useState({ x: 0, y: 0 });
  const [segmentCustomizerOffset, setSegmentCustomizerOffset] = useState({ x: 0, y: 0 });

  const handlePanelDragStart = (e: React.PointerEvent, panelId: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('input') || target.closest('a')) {
      return;
    }
    e.preventDefault();
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}
    setDragPanel(panelId);
    setDragPanelStart({ x: e.clientX, y: e.clientY });
  };

  const handlePanelDragMove = (e: React.PointerEvent, panelId: string) => {
    if (dragPanel !== panelId) return;
    const dx = e.clientX - dragPanelStart.x;
    const dy = e.clientY - dragPanelStart.y;

    if (panelId === 'reposition') {
      setRepositionOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (panelId === 'viewEngine') {
      setViewEngineOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (panelId === 'post') {
      setPostCustomizerOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (panelId === 'segment') {
      setSegmentCustomizerOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
    setDragPanelStart({ x: e.clientX, y: e.clientY });
  };

  const handlePanelDragEnd = (e: React.PointerEvent, panelId: string) => {
    if (dragPanel === panelId) {
      const target = e.target as HTMLElement;
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {}
      setDragPanel(null);
    }
  };

  // Touch Pinch-to-Zoom handling on direct DOM container to block page-level tablet zoom
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let initialDist = 0;
    let origZoom = 1;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        origZoom = zoomRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist > 0) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const factor = dist / initialDist;
        const newZoom = Math.min(3.0, Math.max(0.5, origZoom * factor));
        setZoom(newZoom);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDist = 0;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  // Convert background drag to pan/drag selector & empty click-to-deselect
  const [bgClickStart, setBgClickStart] = useState<{ x: number, y: number } | null>(null);

  const handlePointerDownBackground = (e: React.PointerEvent) => {
    if (isInsertPostMode) {
      // Clicking empty canvas in insert-post mode cancels the mode
      setIsInsertPostMode(false);
      setInsertPostHover(null);
      return;
    }

    if (panMode) {
      e.preventDefault();
      setIsViewportPanning(true);
      setViewportPanStart({ x: e.clientX, y: e.clientY });
    } else {
      // Immediate clean view on pointer down empty area
      setSelectedPostId(null);
      setSelectedSegmentId(null);
      if (setIsLeftPanelOpen) {
        setIsLeftPanelOpen(false);
      }
      setBgClickStart({ x: e.clientX, y: e.clientY });
    }
  };

  // Grab directly on a fence segment to initiate global movement of the select boundary
  const handlePointerDownSegment = (e: React.PointerEvent, segId: string) => {
    e.stopPropagation();

    if (isInsertPostMode) {
      // Use the already-computed ghost position (insertPostHover) so the post
      // inserts exactly where the ghost was showing — not re-projected from the
      // raw click coords (which land on the wide panel fill, not on the segment line).
      if (insertPostHover && insertPostHover.valid && insertPostHover.segmentId === segId) {
        const seg = segments.find(s => s.id === segId);
        if (seg) {
          handleSegmentClick(seg, insertPostHover.t);
          setIsInsertPostMode(false);
          setInsertPostHover(null);
        }
      }
      return;
    }

    // Select the segment and expand customizer panel
    setSelectedSegmentId(segId);
    setSelectedPostId(null);
    setIsSegmentCustomizerMinimized(false);

    // Enter active global dragging of full fence representation
    setIsGlobalDragging(true);
    setDragOffsetStart({ x: e.clientX, y: e.clientY });
  };

  // Handle dragging nodes/posts
  const handlePointerDownPost = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    pushHistory(); // Capture snapshot of positions before drag-movement begins

    setActiveDragId(id);
    setSelectedPostId(id);
    setSelectedSegmentId(null);
    setIsPostCustomizerMinimized(false);
  };

  // Handle clicking & dragging on gates
  const handlePointerDownGate = (e: React.PointerEvent, segId: string, type: 'move' | 'resize-left' | 'resize-right') => {
    e.stopPropagation();
    setSelectedSegmentId(segId);
    setSelectedPostId(null);
    setIsSegmentCustomizerMinimized(false);

    const seg = segments.find(s => s.id === segId);
    if (!seg) return;

    const pStart = posts.find(p => p.id === seg.startPostId);
    const pEnd = posts.find(p => p.id === seg.endPostId);
    if (!pStart || !pEnd) return;

    const coords = getPercentageCoords(e.clientX, e.clientY);
    // Correct for global offset dynamically to align projection
    const t = getProjectionPct(coords.x - globalOffset.x, coords.y - globalOffset.y, pStart, pEnd);

    pushHistory(); // Capture snapshot of layout before gate dimensions/position gets changed

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    setActiveGateDragId(segId);
    setGateDragType(type);
    setGateDragStartPct(t);
    setGateDragStartPos(seg.gatePositionPercent || 40);
    setGateDragStartWidth(seg.gateWidthPercent || 25);

    if (seg.isStandaloneGate) {
      setStandaloneGateStartCoords({ x: coords.x, y: coords.y });
      setStandaloneGateStartPosts({
        startPost: { x: pStart.x, y: pStart.y },
        endPost: { x: pEnd.x, y: pEnd.y }
      });
    } else {
      setStandaloneGateStartCoords(null);
      setStandaloneGateStartPosts(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Insert Post mode: compute ghost preview position on nearest segment
    if (isInsertPostMode) {
      const coords = getPercentageCoords(e.clientX, e.clientY);
      const cursorX = coords.x - globalOffset.x;
      const cursorY = coords.y - globalOffset.y;
      const MIN_DIST = 5; // % canvas units from endpoint — refuse placement closer than this
      const HOVER_THRESHOLD = 8; // max % distance from segment line to count as "hovering"

      let best: typeof insertPostHover = null;
      let bestDist = Infinity;

      for (const seg of segments) {
        if (seg.isStandaloneGate) continue;
        const pA = posts.find(p => p.id === seg.startPostId);
        const pB = posts.find(p => p.id === seg.endPostId);
        if (!pA || !pB) continue;

        const dx = pB.x - pA.x, dy = pB.y - pA.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((cursorX - pA.x) * dx + (cursorY - pA.y) * dy) / len2));
        const projX = pA.x + t * dx;
        const projY = pA.y + t * dy;
        const dist = Math.hypot(cursorX - projX, cursorY - projY);

        if (dist < HOVER_THRESHOLD && dist < bestDist) {
          bestDist = dist;
          const segLen = Math.hypot(dx, dy);
          const distFromStart = t * segLen;
          const distFromEnd   = (1 - t) * segLen;
          best = {
            segmentId: seg.id,
            t,
            x: projX,
            y: projY,
            valid: distFromStart >= MIN_DIST && distFromEnd >= MIN_DIST,
          };
        }
      }

      setInsertPostHover(best);
      return;
    }

    if (activeDragId) {
      const coords = getPercentageCoords(e.clientX, e.clientY);
      const targetX = coords.x - globalOffset.x;
      const targetY = coords.y - globalOffset.y;

      const oldPost = posts.find(p => p.id === activeDragId);
      if (oldPost) {
        const dx = targetX - oldPost.x;
        const dy = targetY - oldPost.y;

        // Check if there is a standalone gate segment linked to this post
        const linkedSegment = segments.find(s => s.isStandaloneGate && (s.startPostId === activeDragId || s.endPostId === activeDragId));
        if (linkedSegment) {
          const otherPostId = linkedSegment.startPostId === activeDragId ? linkedSegment.endPostId : linkedSegment.startPostId;
          const otherPost = posts.find(p => p.id === otherPostId);
          if (otherPost) {
            const gatePhysicalWidthMeters = linkedSegment.gateType === 'double' ? 4.0 : 1.2;
            const targetLength = (gatePhysicalWidthMeters / propertyFrontage) * 100;

            const vx = otherPost.x - oldPost.x;
            const vy = otherPost.y - oldPost.y;
            const currentLen = Math.sqrt(vx * vx + vy * vy) || 1;

            const targetOtherX = targetX + (vx / currentLen) * targetLength;
            const targetOtherY = targetY + (vy / currentLen) * targetLength;

            setPosts(prev => prev.map(p => {
              if (p.id === activeDragId) {
                return { ...p, x: targetX, y: targetY };
              } else if (p.id === otherPostId) {
                return { ...p, x: targetOtherX, y: targetOtherY };
              }
              return p;
            }));
          }
        } else {
          setPosts(prev => prev.map(p => p.id === activeDragId ? { 
            ...p, 
            x: targetX, 
            y: targetY 
          } : p));
        }
      }
    } else if (activeGateDragId) {
      const seg = segments.find(s => s.id === activeGateDragId);
      if (seg) {
        const pStart = posts.find(p => p.id === seg.startPostId);
        const pEnd = posts.find(p => p.id === seg.endPostId);
        if (pStart && pEnd) {
          const coords = getPercentageCoords(e.clientX, e.clientY);

          if (seg.isStandaloneGate && standaloneGateStartCoords && standaloneGateStartPosts) {
            const dx = coords.x - standaloneGateStartCoords.x;
            const dy = coords.y - standaloneGateStartCoords.y;

            setPosts(prev => prev.map(p => {
              if (p.id === seg.startPostId) {
                return {
                  ...p,
                  x: standaloneGateStartPosts.startPost.x + dx,
                  y: standaloneGateStartPosts.startPost.y + dy
                };
              }
              if (p.id === seg.endPostId) {
                return {
                  ...p,
                  x: standaloneGateStartPosts.endPost.x + dx,
                  y: standaloneGateStartPosts.endPost.y + dy
                };
              }
              return p;
            }));
          } else {
            // Correct for globalOffset percentage to align gate projection perfectly
            const t = getProjectionPct(coords.x - globalOffset.x, coords.y - globalOffset.y, pStart, pEnd);
            const deltaT = t - gateDragStartPct;
            const deltaPct = deltaT * 100;

            if (gateDragType === 'move') {
              let newPos = gateDragStartPos + deltaPct;
              const width = seg.gateWidthPercent || 25;
              newPos = Math.min(Math.max(newPos, 0), 100 - width);
              setSegments(prev => prev.map(s => s.id === activeGateDragId ? { ...s, gatePositionPercent: Math.round(newPos) } : s));
            } else if (gateDragType === 'resize-left') {
              const oldEnd = gateDragStartPos + gateDragStartWidth;
              let newPos = gateDragStartPos + deltaPct;
              newPos = Math.min(Math.max(newPos, 0), oldEnd - 10);
              const newWidth = oldEnd - newPos;
              setSegments(prev => prev.map(s => s.id === activeGateDragId ? { 
                ...s, 
                gatePositionPercent: Math.round(newPos),
                gateWidthPercent: Math.round(newWidth)
              } : s));
            } else if (gateDragType === 'resize-right') {
              let newWidth = gateDragStartWidth + deltaPct;
              newWidth = Math.min(Math.max(newWidth, 10), 100 - gateDragStartPos);
              setSegments(prev => prev.map(s => s.id === activeGateDragId ? { 
                ...s, 
                gateWidthPercent: Math.round(newWidth)
              } : s));
            }
          }
        }
      }
    } else if (isViewportPanning) {
      const dx = e.clientX - viewportPanStart.x;
      const dy = e.clientY - viewportPanStart.y;
      setViewportPan(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setViewportPanStart({ x: e.clientX, y: e.clientY });
    } else if (isGlobalDragging) {
      const targetRef = zoomBoxRef.current || containerRef.current;
      const rect = targetRef?.getBoundingClientRect();
      if (rect) {
        const dx = ((e.clientX - dragOffsetStart.x) / rect.width) * 100;
        const dy = ((e.clientY - dragOffsetStart.y) / rect.height) * 100;
        setGlobalOffset(prev => ({
          x: prev.x + dx,
          y: prev.y + dy
        }));
        setDragOffsetStart({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    setActiveDragId(null);
    setActiveGateDragId(null);
    setGateDragType(null);
    setStandaloneGateStartCoords(null);
    setStandaloneGateStartPosts(null);
    setIsViewportPanning(false);

    // If we were dragging or clicking on background inside normal cursor mode
    if (!panMode && bgClickStart) {
      const distance = Math.hypot(e.clientX - bgClickStart.x, e.clientY - bgClickStart.y);
      // Small movement delta threshold confirms a precise static click
      if (distance < 5) {
        setSelectedPostId(null);
        setSelectedSegmentId(null);
        if (setIsLeftPanelOpen) {
          setIsLeftPanelOpen(false);
        }
      }
      setBgClickStart(null);
    }

    setIsGlobalDragging(false);
  };

  // Split a segment at parameter t (0–1) to insert a new post.
  // Each sub-segment inherits the original's properties; gate is transferred
  // to whichever sub-segment contains the gate's centre position.
  const handleSegmentClick = (segment: Segment, t: number) => {
    pushHistory();
    const startPost = posts.find(p => p.id === segment.startPostId);
    const endPost   = posts.find(p => p.id === segment.endPostId);
    if (!startPost || !endPost) return;

    const px = startPost.x + (endPost.x - startPost.x) * t;
    const py = startPost.y + (endPost.y - startPost.y) * t;
    const newPostId = `post_${Date.now()}`;
    const newPost: Post = { id: newPostId, x: px, y: py, type: 'standard' };

    // Gate inheritance: determine which sub-segment the gate falls in.
    // gatePositionPercent is the gate's start offset as a % of the segment.
    // We compare the gate centre (start + half-width) against t*100.
    const gateCentre = segment.hasGate
      ? (segment.gatePositionPercent ?? 40) + (segment.gateWidthPercent ?? 25) / 2
      : null;
    const gateInFirstHalf = gateCentre !== null && gateCentre < t * 100;

    // Build sub-segment for [startPost → newPost] (t fraction of original)
    const seg1: Segment = {
      id: `seg_${Date.now()}_1`,
      startPostId: segment.startPostId,
      endPostId: newPostId,
      hasGate: segment.hasGate && gateInFirstHalf,
      ...(segment.hasGate && gateInFirstHalf ? {
        gateType: segment.gateType,
        // Rescale position and width to be a % of the sub-segment's length (= t * original)
        gatePositionPercent: Math.round((segment.gatePositionPercent ?? 40) / t),
        gateWidthPercent:    Math.round((segment.gateWidthPercent    ?? 25) / t),
      } : {}),
    };

    // Build sub-segment for [newPost → endPost] ((1-t) fraction of original)
    const seg2: Segment = {
      id: `seg_${Date.now()}_2`,
      startPostId: newPostId,
      endPostId: segment.endPostId,
      hasGate: segment.hasGate && !gateInFirstHalf,
      ...(segment.hasGate && !gateInFirstHalf ? {
        gateType: segment.gateType,
        // Gate position relative to original was gPos%; relative to [P→B] starting at t:
        gatePositionPercent: Math.round(((segment.gatePositionPercent ?? 40) - t * 100) / (1 - t)),
        gateWidthPercent:    Math.round((segment.gateWidthPercent    ?? 25) / (1 - t)),
      } : {}),
    };

    setPosts(prev => [...prev, newPost]);
    setSegments(prev => [
      ...prev.filter(s => s.id !== segment.id),
      seg1,
      seg2,
    ]);
    setSelectedPostId(newPostId);
    setSelectedSegmentId(null);
  };

  // Called when user clicks a valid hover point in Insert Post mode
  const insertPostOnSegmentClick = () => {
    if (!insertPostHover || !insertPostHover.valid) return;
    const seg = segments.find(s => s.id === insertPostHover.segmentId);
    if (!seg) return;
    handleSegmentClick(seg, insertPostHover.t);
    setIsInsertPostMode(false);
    setInsertPostHover(null);
  };

  // Add a brand new node, extending straight from the selected post, or leftmost/rightmost endpoints in selected direction
  const addPostDirect = (direction: 'left' | 'right') => {
    if (posts.length === 0) {
      // If posts list is empty, initialize with 2 starting posts
      const p1Id = `post_${Date.now()}_start`;
      const p2Id = `post_${Date.now()}_end`;
      const p1: Post = { id: p1Id, x: 30, y: 75, type: 'standard' };
      const p2: Post = { id: p2Id, x: 55, y: 75, type: 'standard' };

      setPosts([p1, p2]);
      setSegments([
        {
          id: `seg_${Date.now()}`,
          startPostId: p1Id,
          endPostId: p2Id,
          hasGate: false
        }
      ]);
      setSelectedPostId(p2Id);
      return;
    }

    let basePost = posts.find(p => p.id === selectedPostId);
    if (!basePost) {
      // If no post is currently selected, pick the leftmost post for 'left' or rightmost post for 'right' extension
      const sortedByX = [...posts].sort((a, b) => a.x - b.x);
      basePost = direction === 'left' ? sortedByX[0] : sortedByX[sortedByX.length - 1];
    }

    const newId = `post_${Date.now()}`;
    
    // Default directional vector
    let dx = direction === 'left' ? -15 : 15;
    let dy = 0;

    // Extrapolate direction from existing segments connected to basePost
    const connectedSegments = segments.filter(s => s.startPostId === basePost!.id || s.endPostId === basePost!.id);
    if (connectedSegments.length > 0) {
      const prevSeg = connectedSegments[0];
      const otherPostId = prevSeg.startPostId === basePost!.id ? prevSeg.endPostId : prevSeg.startPostId;
      const otherPost = posts.find(p => p.id === otherPostId);
      if (otherPost) {
        const lengthX = basePost!.x - otherPost.x;
        const lengthY = basePost!.y - otherPost.y;
        const dist = Math.sqrt(lengthX * lengthX + lengthY * lengthY);
        if (dist > 0) {
          const extendLength = Math.min(Math.max(dist, 10), 25);
          const baseDx = (lengthX / dist) * extendLength;
          const baseDy = (lengthY / dist) * extendLength;
          
          if (direction === 'left') {
            // We want dx to carry us leftwards (negative x direction)
            dx = baseDx > 0 ? -baseDx : baseDx;
            dy = baseDx > 0 ? -baseDy : baseDy;
          } else {
            // We want dx to carry us rightwards (positive x direction)
            dx = baseDx < 0 ? -baseDx : baseDx;
            dy = baseDx < 0 ? -baseDy : baseDy;
          }
        }
      }
    }

    // Capture state in the undo history stack before applying changes!
    pushHistory();

    const newPost: Post = {
      id: newId,
      x: basePost!.x + dx,
      y: basePost!.y + dy,
      type: 'standard'
    };

    setPosts(prev => [...prev, newPost]);
    setSegments(prev => [
      ...prev,
      {
        id: `seg_${Date.now()}`,
        startPostId: basePost!.id,
        endPostId: newId,
        hasGate: false
      }
    ]);
    setSelectedPostId(newId);
  };

  // Keep addEndPost for backwards compatibility and easy triggers
  const addEndPost = () => addPostDirect('right');

  // Delete selected post
  const deleteSelectedPost = () => {
    if (!selectedPostId || posts.length <= 2) return;
    
    pushHistory(); // Capture snapshot of layout before deleting post

    // Find segments linked to this post
    const segmentsToRem = segments.filter(
      s => s.startPostId === selectedPostId || s.endPostId === selectedPostId
    );
    
    if (segmentsToRem.length === 2) {
      // Identify which segment comes before and after the deleted post
      const segA = segmentsToRem.find(s => s.endPostId === selectedPostId) ?? segmentsToRem[0];
      const segB = segmentsToRem.find(s => s.startPostId === selectedPostId) ?? segmentsToRem[1];
      const startPostId = segA.startPostId === selectedPostId ? segA.endPostId : segA.startPostId;
      const endPostId   = segB.endPostId   === selectedPostId ? segB.startPostId : segB.endPostId;

      // Compute merged gate properties if either sub-segment carried a gate
      const pA = posts.find(p => p.id === startPostId);
      const pP = posts.find(p => p.id === selectedPostId);
      const pB = posts.find(p => p.id === endPostId);
      const totalLen = pA && pB ? Math.hypot(pB.x - pA.x, pB.y - pA.y) : 0;
      const splitT   = pA && pP && totalLen > 0
        ? Math.hypot(pP.x - pA.x, pP.y - pA.y) / totalLen : 0.5;

      let mergedGateProps: Partial<Segment> = { hasGate: false };
      const gatedSeg = segA.hasGate ? segA : segB.hasGate ? segB : null;
      if (gatedSeg) {
        const isInSegA = gatedSeg === segA;
        const origPos  = gatedSeg.gatePositionPercent ?? 40;
        const origW    = gatedSeg.gateWidthPercent    ?? 25;
        // Re-map gate position into the merged segment's 0–100 coordinate space
        const mergedPos = isInSegA
          ? origPos * splitT          // segA occupies [0, splitT*100] of merged
          : splitT * 100 + origPos * (1 - splitT); // segB occupies [splitT*100, 100]
        const mergedW = isInSegA ? origW * splitT : origW * (1 - splitT);
        mergedGateProps = {
          hasGate: true,
          gateType: gatedSeg.gateType,
          gatePositionPercent: Math.round(mergedPos),
          gateWidthPercent:    Math.round(mergedW),
        };
      }

      setSegments(prev => [
        ...prev.filter(s => s.startPostId !== selectedPostId && s.endPostId !== selectedPostId),
        {
          id: `seg_${Date.now()}`,
          startPostId,
          endPostId,
          ...mergedGateProps,
        }
      ]);
    } else {
      // Just delete leading segments
      setSegments(prev => prev.filter(s => s.startPostId !== selectedPostId && s.endPostId !== selectedPostId));
    }

    setPosts(prev => prev.filter(p => p.id !== selectedPostId));
    setSelectedPostId(null);
  };

  // Delete selected segment
  const deleteSelectedSegment = () => {
    if (!selectedSegmentId) return;
    
    pushHistory(); // Capture snapshot of layout before deleting segment

    const seg = segments.find(s => s.id === selectedSegmentId);
    if (seg && seg.isStandaloneGate) {
      // Automatically clean up its supporting pillars (start and end posts)
      setPosts(prev => prev.filter(p => p.id !== seg.startPostId && p.id !== seg.endPostId));
    }

    setSegments(prev => prev.filter(s => s.id !== selectedSegmentId));
    setSelectedSegmentId(null);
  };

  // Nudge selected post with unlimited movement bounds
  const nudgePost = (dx: number, dy: number) => {
    if (!selectedPostId) return;

    pushHistory(); // Capture snapshot of positions before nudging

    setPosts(prev => prev.map(p => p.id === selectedPostId ? {
      ...p,
      x: p.x + dx,
      y: p.y + dy
    } : p));
  };

  // Shift entire fence globally
  const nudgeFenceFile = (dx: number, dy: number) => {
    setGlobalOffset(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
  };

  // Export active visual mock-up design as image file
  const handleExportDesign = () => {
    try {
      const svgElement = document.getElementById('fence_visualizer_svg') as unknown as SVGSVGElement | null;
      if (!svgElement) {
        alert("SVG canvas element not found");
        return;
      }

      // Clone original SVG elements to hide interactive cursors and temporary handles
      const clonedSvg = svgElement.cloneNode(true) as unknown as SVGSVGElement;
      
      // Clear out unnecessary overlay UI or selection rectangles
      const unnecessaryElements = clonedSvg.querySelectorAll('.gate-overlay, .selected-outline, .interaction-hitbox, .brush-indicator');
      unnecessaryElements.forEach(el => el.remove());

      // Serialize SVG
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clonedSvg);
      
      // Prepare blob signature
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Create an image node to draw on canvas (fallback to direct SVG if security blocks canvas)
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // Match standard canvas export size
          canvas.width = 1920; 
          canvas.height = 1080;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Draw background representation
            ctx.fillStyle = '#18191c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw visualizer
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const pngUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `FENCE_PRO_DESIGN_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(svgUrl);
          }
        } catch (canvasErr) {
          // If cross-origin restrictions on background photo taint canvas, fallback safely to high-res vector file
          console.warn("Canvas export restricted. Downloading premium vector specification file directly instead.", canvasErr);
          const link = document.createElement('a');
          link.href = svgUrl;
          link.download = `FENCE_PRO_VECTOR_${Date.now()}.svg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      };

      img.onerror = () => {
        // Fallback directly to SVG on error
        const link = document.createElement('a');
        link.href = svgUrl;
        link.download = `FENCE_PRO_VECTOR_${Date.now()}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      img.src = svgUrl;
    } catch (err) {
      console.error("Export layout failed", err);
    }
  };

  // Scale the fence height visually on canvas, matching height drop-down & scaling factor
  const getVisualFenceHeight = () => {
    // height parameter is 900, 1200, 1500, 1800, 2100 mm.
    // Convert this to base canvas coordinates percentages.
    const basePct = (height / 1800) * 32;
    return basePct * fenceScale;
  };

  return (
    <div className="flex flex-col h-full bg-[#f3efe6] rounded-2xl border border-[#d9d3c5] overflow-hidden">
      
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 bg-[#f3efe6] border-b border-[#d9d3c5] gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4.5 h-4.5 text-[#5f6266]" />
          <h3 className="text-sm font-semibold text-[#1a1c1e] font-display">Interactive Design Studio</h3>
          <span className="text-[11px] font-mono bg-[#ece7db] text-[#5f6266] border border-[#d9d3c5] px-2 py-0.5 rounded-full">
            Full Transparency Enabled
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Hand pan mode tool */}
          <button
            onClick={() => setPanMode(!panMode)}
            title={panMode ? "Switch to Draw and Drag state" : "Enable camera swipe and pan"}
            className={`btn-tool ${panMode ? 'is-active' : ''}`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span>{panMode ? "Panning Mode" : "Pan Tool"}</span>
          </button>

          {/* Simulated Full Screen button */}
          {setIsFullScreen && (
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? "Exit Full Screen" : "Fill screen with yard template"}
              className={`btn-tool ${isFullScreen ? 'is-active' : ''}`}
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5 animate-pulse" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isFullScreen ? "Exit Fullscreen" : "Full Screen"}</span>
            </button>
          )}

          {/* Helper Grid */}
          <button
            onClick={() => setShowHelperGrid(!showHelperGrid)}
            title="Toggle assistance alignment points"
            className={`btn-tool ${showHelperGrid ? 'is-active' : ''}`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Alignment Points</span>
          </button>

          {/* Satellite Map Measure Tool */}
          <button
            onClick={() => setShowSatelliteModal(true)}
            title="Measure real-world lot boundary using satellite photography"
            className="btn-tool"
          >
            <span>🛰️ Map Measure</span>
          </button>

          {/* Add Post Tool */}
          <button
            onClick={() => {
              setIsInsertPostMode(prev => !prev);
              setInsertPostHover(null);
              setSelectedPostId(null);
              setSelectedSegmentId(null);
              setPanMode(false);
            }}
            title="Click on a fence segment to insert a new post at that position."
            className={`btn-tool ${isInsertPostMode ? 'is-active' : ''}`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>Add Post</span>
          </button>

          {/* Undo Action */}
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            title={history.length === 0 ? "No actions to undo" : `Undo last change (Step ${history.length})`}
            className="btn-tool select-none"
          >
            <Undo className="w-3.5 h-3.5" />
            <span>Undo ({history.length})</span>
          </button>

          {/* Directional Add Post Actions */}
          <button
            onClick={() => addPostDirect('left')}
            title="Add post extending straight on the LEFT side of the fence"
            className="btn-tool"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Left</span>
          </button>
          <button
            onClick={() => addPostDirect('right')}
            title="Add post extending straight on the RIGHT side of the fence"
            className="btn-tool"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Right</span>
          </button>

          {/* Download/Export Design Button */}
          <button
            onClick={handleExportDesign}
            title="Export full visual layout design copy to image/specification sheet"
            className="flex items-center gap-1 bg-[#ff6a1f] hover:bg-[#e85a12] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-md select-none"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span>Export Design</span>
          </button>

          {selectedPostId && (
            <button
              onClick={deleteSelectedPost}
              disabled={posts.length <= 2}
              className="flex items-center gap-1 bg-[#fff1e9] hover:bg-[#fff1e9] text-red-300 border border-red-900/30 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:brightness-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Selected Post</span>
            </button>
          )}

          {selectedSegmentId && segments.find(s => s.id === selectedSegmentId)?.isStandaloneGate && (
            <button
              onClick={deleteSelectedSegment}
              className="flex items-center gap-1 bg-[#fff1e9] hover:bg-[#fff1e9] text-red-300 border border-red-900/30 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Selected Gate</span>
            </button>
          )}

          {/* Load Default / Custom Images */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={triggerFileUpload}
            className="bg-[#ff6a1f] hover:bg-[#ff6a1f] text-white font-medium text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Upload Photo
          </button>
          
          {backgroundUrl && (
            <button
              onClick={handleResetDesign}
              title="Clear only drawn fences, posts, and nodes"
              className="bg-[#ece7db] hover:bg-[#e2ddd0] text-[#3c4045] text-xs px-2.5 py-1.5 rounded-lg transition border border-[#cfc8b8] cursor-pointer"
            >
              Reset Design
            </button>
          )}
          
          {backgroundUrl && (
            <button
              onClick={handleClearCanvas}
              title="Clear entire canvas (remove background image and fence design)"
              className="flex items-center gap-1 bg-[#fff1e9] hover:bg-[#fff1e9] text-red-305 border border-red-900/30 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-red-400" />
              <span>Clear Canvas</span>
            </button>
          )}
        </div>
      </div>

      {/* Main visualizer container canvas */}
      <div className="relative flex-1 bg-white overflow-hidden select-none" ref={containerRef}>
        
        {/* Ground image of site under visualizer */}
        <div 
          className="relative w-full h-full flex items-center justify-center overflow-hidden"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerDown={handlePointerDownBackground}
        >
          
          {/* Zoom Box Wrapper - Encloses background image, helper grids, SVG, and handles so they scale together */}
          <div
            ref={zoomBoxRef}
            className={`relative transition-transform duration-100 ${
              panMode ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            style={{
              width: `${zoomBoxWidth}px`,
              height: `${zoomBoxHeight}px`,
              transform: `scale(${zoom}) translate(${viewportPan.x / zoom}px, ${viewportPan.y / zoom}px)`,
              transformOrigin: 'center center',
            }}
          >
            {backgroundUrl ? (
              <img
                src={backgroundUrl}
                alt="Client Property Yard"
                referrerPolicy="no-referrer"
                onLoad={(e) => {
                  const target = e.currentTarget;
                  if (target.naturalWidth && target.naturalHeight) {
                    setImageAspectRatio(target.naturalWidth / target.naturalHeight);
                  }
                }}
                className="w-full h-full object-contain transition-opacity duration-300 pointer-events-none"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl m-4 select-none transition-colors duration-200 bg-white/40 border-[#cfc8b8] text-[#1a1c1e] shadow-2xl">
                <div className="max-w-md text-center flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border transition-colors bg-[#ff6a1f]/10 border-[#ff6a1f]/20 text-[#ff6a1f]">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h3 className="font-display text-2xl font-extrabold mb-2 leading-none uppercase tracking-wide text-[#1a1c1e]">
                    Initialize Property Backdrop
                  </h3>
                  <p className="text-xs text-[#5f6266] mb-6 leading-relaxed">
                    Upload a high-resolution snapshot of your property boundary to position posts and trace custom framing lines.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-md">
                    <button 
                      onClick={triggerFileUpload}
                      className="flex-1 bg-[#e85a12] hover:bg-[#ff6a1f] text-white font-bold py-2.5 px-3 rounded-lg text-xs uppercase tracking-wider transition cursor-pointer shadow"
                    >
                      Upload Photo
                    </button>
                    <button
                      type="button"
                      onClick={loadDefaultImage}
                      className="btn-tool flex-1 uppercase tracking-wider"
                    >
                      Use Demo Yard
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSatelliteModal(true)}
                      className="btn-tool flex-1 uppercase tracking-wider"
                    >
                      <span>🛰️ Map Measure</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* Grid helper overlay */}
          {showHelperGrid && (
            <div className="absolute inset-0 border border-[#ff6a1f]/10 pointer-events-none grid grid-cols-6 grid-rows-6">
              {Array.from({ length: 36 }).map((_, i) => (
                <div key={i} className="border-t border-l border-white/[0.02]" />
              ))}
            </div>
          )}

          {/* Canvas SVG representing the interactive fence structure */}
          <svg
            id="fence_visualizer_svg"
            className="absolute inset-0 w-full h-full cursor-crosshair overflow-visible pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* SVG STYLES AND DESIGN REFERENCE PATTERNS */}
            <defs>
              {/* Chainwire Dynamic Repeat mesh */}
              <pattern id="chainwire-pattern" width="3" height="3" patternUnits="userSpaceOnUse" overflow="visible">
                <path d="M 0 1.5 L 1.5 0 L 3 1.5 L 1.5 3 Z" fill="none" stroke="currentColor" strokeWidth="0.12" opacity="0.65" />
                <path d="M 0 0 L 3 3 M 3 0 L 0 3" fill="none" stroke="currentColor" strokeWidth="0.08" opacity="0.3" />
              </pattern>

              {/* Black Chainwire mesh pattern for high-contrast Post & Rail combo */}
              <pattern id="black-chainwire-pattern" width="1.6" height="1.6" patternUnits="userSpaceOnUse" overflow="visible">
                <path d="M 0 0.8 L 0.8 0 L 1.6 0.8 L 0.8 1.6 Z" fill="none" stroke="#000000" strokeWidth="0.18" />
                <path d="M 0 0 L 1.6 1.6 M 1.6 0 L 0 1.6" fill="none" stroke="#222225" strokeWidth="0.10" opacity="0.6" />
              </pattern>
              
              {/* Colorbond ribbed sheet shading gradients */}
              <linearGradient id="colorbond-rib-grad" x1="0%" y1="0%" x2="100%" y2="0%" spreadMethod="repeat">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.3" />
                <stop offset="35%" stopColor="#ffffff" stopOpacity="0.15" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.0" />
                <stop offset="65%" stopColor="#000000" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
              </linearGradient>

              {/* Timber horizontal slat grain feeling */}
              <linearGradient id="timber-grain" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                <stop offset="30%" stopColor="#ffffff" stopOpacity="0.0" />
                <stop offset="80%" stopColor="#000000" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
              </linearGradient>

              {/* Post & Rail — post body gradients (horizontal: lit left → shadow right) */}
              <linearGradient id="pr-post-tan" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#dda96a" stopOpacity="1" />
                <stop offset="40%"  stopColor="#c8965a" stopOpacity="1" />
                <stop offset="100%" stopColor="#8f6235" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="pr-post-red" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#9b4f3d" stopOpacity="1" />
                <stop offset="40%"  stopColor="#7a3b2e" stopOpacity="1" />
                <stop offset="100%" stopColor="#4e2219" stopOpacity="1" />
              </linearGradient>

              {/* Post & Rail — rail body gradients (vertical: lit top → shadow bottom) */}
              <linearGradient id="pr-rail-tan" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#dda96a" stopOpacity="1" />
                <stop offset="45%"  stopColor="#c8965a" stopOpacity="1" />
                <stop offset="100%" stopColor="#8f6235" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="pr-rail-red" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#9b4f3d" stopOpacity="1" />
                <stop offset="45%"  stopColor="#7a3b2e" stopOpacity="1" />
                <stop offset="100%" stopColor="#4e2219" stopOpacity="1" />
              </linearGradient>

              {/* Post & Rail — soft drop-shadow filter */}
              <filter id="pr-shadow" x="-10%" y="-10%" width="130%" height="160%">
                <feDropShadow dx="0" dy="0.45" stdDeviation="0.35" floodOpacity="0.32" />
              </filter>

              {/* Post & Rail — Natural Tan colour correction: slight desaturate + lighten */}
              <filter id="pr-tan-adjust" colorInterpolationFilters="sRGB">
                <feColorMatrix type="saturate" values="0.85"/>
                <feComponentTransfer>
                  <feFuncR type="linear" slope="1.08" intercept="0.02"/>
                  <feFuncG type="linear" slope="1.06" intercept="0.02"/>
                  <feFuncB type="linear" slope="1.04" intercept="0.02"/>
                </feComponentTransfer>
              </filter>

            </defs>

            {/* DRAG-AND-DROP DISPLACEMENT LAYER */}
            <g transform={`translate(${globalOffset.x}, ${globalOffset.y})`}>
              
              {/* Unified depth-sorted render — far segments first so closer ones always occlude them.
                  Each segment renders: panel infill → gate overlay → its own end posts.
                  A shared corner post renders with whichever segment has the highest avgY
                  (frontmost), so it always sits at the correct depth layer. */}
              {(() => {
                const sorted = [...segments]
                  .map(seg => {
                    const pStart = posts.find(p => p.id === seg.startPostId);
                    const pEnd   = posts.find(p => p.id === seg.endPostId);
                    const avgY   = pStart && pEnd ? (pStart.y + pEnd.y) / 2 : 0;
                    return { seg, pStart, pEnd, avgY };
                  })
                  .sort((a, b) => a.avgY - b.avgY);

                // For each post: find the sorted index of the segment with the highest avgY
                // (frontmost / closest to viewer) that references this post. That segment
                // owns the post and will render it at the correct depth layer.
                const postFrontmostIdx = new Map<string, number>();
                sorted.forEach(({ pStart, pEnd, avgY }, idx) => {
                  [pStart, pEnd].forEach(p => {
                    if (!p) return;
                    const existingIdx = postFrontmostIdx.get(p.id);
                    if (existingIdx === undefined || sorted[existingIdx].avgY < avgY) {
                      postFrontmostIdx.set(p.id, idx);
                    }
                  });
                });

                const renderPost = (post: typeof posts[0]) => {
                  const isSelected = selectedPostId === post.id;
                  const scale = getPerspectiveScale(post.y);
                  const vh = getVisualFenceHeight() * scale;
                  let postWidth = vh * 0.055;
                  let postColorHex = postColor.hex;
                  let strokeWidth = 0.05;
                  let capHeight = 0.22 * scale;
                  if (material === 'post_and_rail') {
                    postWidth = vh * 0.075;
                    postColorHex = color.hex;
                    capHeight = 0.22 * scale;
                  } else if (post.type === 'corner') {
                    postWidth = vh * 0.065;
                  } else if (post.type === 'H-post') {
                    postWidth = vh * 0.070;
                  } else if (post.type === 'decorative') {
                    postWidth = vh * 0.090;
                    postColorHex = '#d1c7bd';
                    capHeight = 0.45 * scale;
                  } else if (post.type === 'gate') {
                    postWidth = 0.8 * scale;
                  }
                  const x = post.x;
                  const y = post.y;
                  const prIsRed = material === 'post_and_rail' && color.name === 'Reddish-Brown';
                  const prTexHref = prIsRed ? '/pr-red-texture.jpg' : '/pr-tan-texture.jpg';
                  const prTexFilter = prIsRed ? undefined : 'url(#pr-tan-adjust)';
                  const prStainDark = prIsRed ? '#2e1108' : '#6b3e18';
                  const prStainMid  = prIsRed ? '#4e2219' : '#a0682e';
                  return (
                    <g key={post.id} className="pointer-events-none" filter={material === 'post_and_rail' ? 'url(#pr-shadow)' : undefined}>
                      <ellipse cx={x} cy={y + 0.2} rx={postWidth * 0.9} ry="0.18" fill="#000" opacity={material === 'post_and_rail' ? 0.38 : 0.32} />
                      {material === 'post_and_rail' ? (() => {
                        const pLeft = x - postWidth / 2;
                        const pTop  = y - vh;
                        const pBot  = y + 0.3;
                        const clipId = `pr-clip-node-${post.id}`;
                        return (
                          <>
                            <defs><clipPath id={clipId}><path d={`M ${pLeft} ${pBot} L ${pLeft} ${pTop} L ${x + postWidth/2} ${pTop} L ${x + postWidth/2} ${pBot} Z`} /></clipPath></defs>
                            <image href={prTexHref} x={pLeft} y={pTop} width={postWidth} height={pBot - pTop} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} filter={prTexFilter} />
                            <path d={`M ${pLeft} ${pBot} L ${pLeft} ${pTop} L ${x + postWidth/2} ${pTop} L ${x + postWidth/2} ${pBot} Z`} fill="none" stroke={prStainDark} strokeWidth="0.08" />
                          </>
                        );
                      })() : (
                        <path d={`M ${x - postWidth/2} ${y + 0.3} L ${x - postWidth/2} ${y - vh} L ${x + postWidth/2} ${y - vh} L ${x + postWidth/2} ${y + 0.3} Z`} fill={postColorHex} stroke="#000000" strokeWidth={strokeWidth} />
                      )}
                      {material !== 'post_and_rail' && (
                        <line x1={x - postWidth/3} y1={y + 0.2} x2={x - postWidth/3} y2={y - vh} stroke="#ffffff" strokeWidth={postWidth * 0.16} opacity={post.type === 'decorative' ? 0.1 : 0.28} />
                      )}
                      {material === 'post_and_rail' ? (
                        <path d={`M ${x - postWidth/2 - 0.06} ${y - vh} L ${x - postWidth * 0.12} ${y - vh - capHeight * 0.65} L ${x} ${y - vh - capHeight} L ${x + postWidth * 0.12} ${y - vh - capHeight * 0.65} L ${x + postWidth/2 + 0.06} ${y - vh} Z`} fill={prStainMid} stroke={prStainDark} strokeWidth="0.05" />
                      ) : (
                        <path d={`M ${x - postWidth/2 - 0.06} ${y - vh} L ${x - postWidth/2 - 0.06} ${y - vh - capHeight} L ${x + postWidth/2 + 0.06} ${y - vh - capHeight} L ${x + postWidth/2 + 0.06} ${y - vh} Z`} fill={postColorHex} stroke="#000" strokeWidth="0.04" />
                      )}
                      {post.type === 'decorative' && material !== 'post_and_rail' && (
                        <polygon points={`${x - postWidth/2 - 0.06},${y - vh - capHeight} ${x + postWidth/2 + 0.06},${y - vh - capHeight} ${x},${y - vh - capHeight - 0.25 * scale}`} fill="#b0a59a" stroke="#000" strokeWidth="0.04" />
                      )}
                      {isSelected && (
                        <rect x={x - postWidth/2 - 0.4} y={y - vh - capHeight - 0.4} width={postWidth + 0.8} height={vh + capHeight + 1.1} fill="none" stroke="#14b8a6" strokeWidth="0.25" strokeDasharray="0.8 0.8" />
                      )}
                    </g>
                  );
                };

                const panelGateEls = sorted.map(({ seg, pStart, pEnd }, sIdx) => {
                if (!pStart || !pEnd) return null;
                if (seg.isStandaloneGate) return null;

                const isSelected = selectedSegmentId === seg.id;

                const segmentWidth = pEnd.x - pStart.x;
                const segmentHeight = pEnd.y - pStart.y;
                const segmentLength = Math.sqrt(segmentWidth ** 2 + segmentHeight ** 2);

                // Structural line post count for this segment — pre-allocated so the total across
                // all segments exactly matches the billed intermediatePostCount in estimateFencingCosts
                const intermediateCount = intermediatePostCounts.get(seg.id) || 0;

                // Visual-only span count: scales post/panel density to the drawn pixel path length
                // rather than the real-world metre count, preventing cramping when a short path
                // represents a long fence on an uploaded photo.
                // Span width: convert fence height (y-SVG-units) to pixels, target 3:1 bay ratio,
                // then convert back to x-SVG-units — bridges the different x/y pixel scales.
                const pixPerXUnit = containerSize.width / 100;
                const pixPerYUnit = containerSize.height / 100;
                const fenceHeightPx = getVisualFenceHeight() * pixPerYUnit;
                const spanPixelSize = (fenceHeightPx * 3.0) / pixPerXUnit;
                const visualSpanCount = Math.max(1, Math.round(segmentLength / spanPixelSize));

                // Perspective scaling factors for the start and end posts
                const scaleStart = getPerspectiveScale(pStart.y);
                const scaleEnd = getPerspectiveScale(pEnd.y);

                const vhStart = getVisualFenceHeight() * scaleStart;
                const vhEnd = getVisualFenceHeight() * scaleEnd;

                // Rendering materials procedurally inside SVG
                const panelEl: React.ReactNode = (() => {
                if (material === 'slat_fencing') {
                  // DRAW HORIZONTAL SLATS (Modern colorbond or metal slat layout)
                  const isChunky = slatProfile === '90';
                  const baseVh = getVisualFenceHeight();
                  // 65mm: ~20 slats at 1800mm with slightly thicker slat body (less gap)
                  // 90mm: ~13 slats at 1800mm with much thicker slat body (genuinely chunky look)
                  const slatTotal = Math.max(
                    isChunky
                      ? Math.round(baseVh * 0.40) + 1   // ~13 at 1800mm
                      : Math.round(baseVh * 0.75) - 4,  // ~20 at 1800mm
                    4
                  );
                  const slatBodyH = isChunky ? 1.30 : 0.68; // 90mm: thick/chunky; 65mm: slightly thicker than before
                  const pitch = baseVh / slatTotal;          // total slot height per slat
                  const slatGap = pitch - slatBodyH;         // remaining space = gap
                  const slatRatio = slatBodyH / pitch;       // fill fraction for rendering
                  const slatHeight = slatBodyH;

                  return (
                    <g key={seg.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => handlePointerDownSegment(e, seg.id)}>
                      
                      {/* Horizontal metal/wood slats with perspective sloping */}
                      {(() => {
                        const slatPercent = slatRatio / slatTotal;
                        return Array.from({ length: slatTotal }).map((_, i) => {
                          const ratio = i / slatTotal;
                          const nextRatio = ratio + slatPercent;

                          const offsetStart = vhStart * ratio;
                          const offsetEnd = vhEnd * ratio;
                          const nextOffsetStart = vhStart * nextRatio;
                          const nextOffsetEnd = vhEnd * nextRatio;

                          const x1 = pStart.x;
                          const y1 = pStart.y - offsetStart;
                          const x2 = pEnd.x;
                          const y2 = pEnd.y - offsetEnd;

                          const topY1 = pStart.y - nextOffsetStart;
                          const topY2 = pEnd.y - nextOffsetEnd;

                          // Support skipping slat parts for gates
                          if (seg.hasGate) {
                            const { startPct: pt1, endPct: pt2 } = getGateSpanPcts(seg, segmentLength);
                            // variables removed

                            const gX1_val = x1 + pt1 * segmentWidth;
                            const gY1_val = y1 + pt1 * segmentHeight;
                            const gX2_val = x1 + pt2 * segmentWidth;
                            const gY2_val = y1 + pt2 * segmentHeight;

                            const gTopY1_y = topY1 + pt1 * (topY2 - topY1);
                            const gTopY2_y = topY1 + pt2 * (topY2 - topY1);

                            return (
                              <g key={i}>
                                {/* Left of gate partition */}
                                <path
                                  d={`
                                    M ${x1} ${y1} 
                                    L ${gX1_val} ${gY1_val} 
                                    L ${gX1_val} ${gTopY1_y} 
                                    L ${x1} ${topY1} 
                                    Z
                                  `}
                                  fill={color.hex}
                                  stroke="#111"
                                  strokeWidth="0.04"
                                />

                                {/* Right of gate partition */}
                                <path
                                  d={`
                                    M ${gX2_val} ${gY2_val} 
                                    L ${x2} ${y2} 
                                    L ${x2} ${topY2} 
                                    L ${gX2_val} ${gTopY2_y} 
                                    Z
                                  `}
                                  fill={color.hex}
                                  stroke="#111"
                                  strokeWidth="0.04"
                                />
                              </g>
                            );
                          }

                          return (
                            <g key={i}>
                              <path
                                d={`
                                  M ${x1} ${y1} 
                                  L ${x2} ${y2} 
                                  L ${x2} ${topY2} 
                                  L ${x1} ${topY1} 
                                  Z
                                `}
                                fill={color.hex}
                                stroke="#111"
                                strokeWidth="0.04"
                              />
                              {/* Soft lighting highlight on top shadow */}
                              <path
                                d={`M ${x1} ${topY1 + 0.08} Q ${x1 + segmentWidth*0.5} ${topY1 + 0.08 + (topY2 - topY1)*0.5}, ${x2} ${topY2 + 0.08}`}
                                stroke="#ffffff"
                                strokeWidth="0.06"
                                opacity="0.14"
                                fill="none"
                              />
                            </g>
                          );
                        });
                      })()}

                      {/* Mandatory structural line posts (2.4m max span) — billed in the quote, not decorative */}
                      {visualSpanCount > 1 && Array.from({ length: visualSpanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / visualSpanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;

                        // Skip drawing intermediate pillar if it drops exactly within a gate span
                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }

                        const scale = getPerspectiveScale(py);
                        const vh = getVisualFenceHeight() * scale;

                        let postWidth = vh * 0.055;
                        let postColorHex = postColor.hex;

                        return (
                          <g key={`mid-post-${j}`} className="pointer-events-none">
                            {/* Shadow */}
                            <ellipse cx={px} cy={py + 0.2} rx={postWidth * 0.9} ry="0.18" fill="#000" opacity="0.32" />

                            {/* Column */}
                            <path
                              d={`
                                M ${px - postWidth/2} ${py + 0.3} 
                                L ${px - postWidth/2} ${py - vh} 
                                L ${px + postWidth/2} ${py - vh} 
                                L ${px + postWidth/2} ${py + 0.3} 
                                Z
                              `}
                              fill={postColorHex}
                              stroke="#000000"
                              strokeWidth="0.04"
                            />

                          </g>
                        );
                      })}

                      {/* Selection Aura */}
                      {isSelected && (
                        <polygon
                          points={`
                            ${pStart.x},${pStart.y}
                            ${pEnd.x},${pEnd.y}
                            ${pEnd.x},${pEnd.y - vhEnd}
                            ${pStart.x},${pStart.y - vhStart}
                          `}
                          fill="rgba(20, 184, 166, 0.06)"
                          stroke="#14b8a6"
                          strokeWidth="0.32"
                          strokeDasharray="1 1"
                        />
                      )}
                    </g>
                  );

                } else if (material === 'post_and_rail') {
                  // DRAW CLASSIC TIMBER POST & RAIL
                  // Rail vertical positions (as fraction of fence height from ground up)
                  const railPositions =
                    railCount === 2 ? [0.32, 0.75]
                    : railCount === 4 ? [0.18, 0.42, 0.65, 0.88]
                    : [0.20, 0.52, 0.84]; // 3 rails default
                  const railThickness = getVisualFenceHeight() * 0.10;

                  // Resolve stain from chosen colour name
                  const isRedStain = color.name === 'Reddish-Brown';
                  const texHref = isRedStain
                    ? '/pr-red-texture.jpg'
                    : '/pr-tan-texture.jpg';
                  const texFilter = isRedStain ? undefined : 'url(#pr-tan-adjust)';
                  const stainDark  = isRedStain ? '#2e1108' : '#6b3e18';
                  const stainMid   = isRedStain ? '#4e2219' : '#a0682e';

                  // Helper: draw one post column with photo texture clipped to its rect.
                  // clipPath + image are both in root SVG space (no transforms anywhere in this
                  // render path), so absolute coords are all that's needed.
                  const renderTimberPost = (px: number, py: number, scale: number, key: string) => {
                    const vh = getVisualFenceHeight() * scale;
                    const pw = vh * 0.075;
                    const capH = 0.22 * scale;
                    const left  = px - pw / 2;
                    const top   = py - vh;
                    const bottom = py + 0.3;
                    const clipId = `pr-clip-post-${key}`;
                    return (
                      <g key={key} className="pointer-events-none" filter="url(#pr-shadow)">
                        <defs>
                          <clipPath id={clipId}>
                            <path d={`M ${left} ${bottom} L ${left} ${top} L ${px + pw/2} ${top} L ${px + pw/2} ${bottom} Z`} />
                          </clipPath>
                        </defs>
                        {/* Ground shadow ellipse */}
                        <ellipse cx={px} cy={py + 0.22} rx={pw * 0.85} ry="0.18" fill="#000" opacity="0.38" />
                        {/* Post body — photo texture clipped to post rect */}
                        <image
                          href={texHref}
                          x={left} y={top}
                          width={pw} height={bottom - top}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#${clipId})`}
                          filter={texFilter}
                        />
                        {/* Outline stroke over the texture */}
                        <path
                          d={`M ${left} ${bottom} L ${left} ${top} L ${px + pw/2} ${top} L ${px + pw/2} ${bottom} Z`}
                          fill="none"
                          stroke={stainDark}
                          strokeWidth="0.08"
                        />
                        {/* Chamfered pyramid cap */}
                        <path
                          d={`
                            M ${left - 0.06} ${top}
                            L ${px - pw * 0.12} ${top - capH * 0.65}
                            L ${px} ${top - capH}
                            L ${px + pw * 0.12} ${top - capH * 0.65}
                            L ${px + pw/2 + 0.06} ${top}
                            Z
                          `}
                          fill={stainMid}
                          stroke={stainDark}
                          strokeWidth="0.04"
                        />
                      </g>
                    );
                  };

                  return (
                    <g key={seg.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => handlePointerDownSegment(e, seg.id)}>

                      {/* Optional chainwire mesh — behind the rails, low opacity so it reads as thin wire */}
                      {includeChainwire && (
                        <polygon
                          points={`${pStart.x},${pStart.y} ${pEnd.x},${pEnd.y} ${pEnd.x},${pEnd.y - vhEnd} ${pStart.x},${pStart.y - vhStart}`}
                          fill="url(#black-chainwire-pattern)"
                          stroke="none"
                          opacity="0.28"
                        />
                      )}

                      {/* Horizontal timber rails */}
                      {railPositions.map((heightPct, rIdx) => {
                        const offsetStart = vhStart * heightPct;
                        const offsetEnd   = vhEnd   * heightPct;
                        const rtStart = railThickness * scaleStart;
                        const rtEnd   = railThickness * scaleEnd;

                        const x1 = pStart.x;
                        const y1 = pStart.y - offsetStart;
                        const x2 = pEnd.x;
                        const y2 = pEnd.y - offsetEnd;

                        const drawRail = (ax: number, ay: number, bx: number, by: number, thA: number, thB: number, key: string) => {
                          // Bounding box of this rail trapezoid in root SVG space
                          const rLeft  = Math.min(ax, bx);
                          const rTop   = Math.min(ay - thA, by - thB);
                          const rRight = Math.max(ax, bx);
                          const rBot   = Math.max(ay, by);
                          const clipId = `pr-clip-rail-${seg.id}-${key}`;
                          const panelPath = `M ${ax} ${ay} L ${bx} ${by} L ${bx} ${by - thB} L ${ax} ${ay - thA} Z`;
                          return (
                            <g key={key} filter="url(#pr-shadow)">
                              <defs>
                                <clipPath id={clipId}>
                                  <path d={panelPath} />
                                </clipPath>
                              </defs>
                              {/* Photo texture clipped to rail trapezoid */}
                              <image
                                href={texHref}
                                x={rLeft} y={rTop}
                                width={rRight - rLeft} height={rBot - rTop}
                                preserveAspectRatio="xMidYMid slice"
                                clipPath={`url(#${clipId})`}
                                filter={texFilter}
                              />
                              {/* Outline stroke */}
                              <path d={panelPath} fill="none" stroke={stainDark} strokeWidth="0.06" />
                            </g>
                          );
                        };

                        if (seg.hasGate) {
                          const { startPct: pt1, endPct: pt2 } = getGateSpanPcts(seg, segmentLength);
                          const gX1 = x1 + pt1 * segmentWidth, gY1 = y1 + pt1 * segmentHeight;
                          const gX2 = x1 + pt2 * segmentWidth, gY2 = y1 + pt2 * segmentHeight;
                          const thAt = (p: number) => rtStart + p * (rtEnd - rtStart);
                          return (
                            <g key={rIdx}>
                              {drawRail(x1, y1, gX1, gY1, rtStart, thAt(pt1), 'L')}
                              {drawRail(gX2, gY2, x2, y2, thAt(pt2), rtEnd, 'R')}
                            </g>
                          );
                        }
                        return drawRail(x1, y1, x2, y2, rtStart, rtEnd, String(rIdx));
                      })}

                      {/* Intermediate structural posts */}
                      {visualSpanCount > 1 && Array.from({ length: visualSpanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / visualSpanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;
                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }
                        return renderTimberPost(px, py, getPerspectiveScale(py), `mid-post-wood-${j}`);
                      })}

                      {/* Selection Aura */}
                      {isSelected && (
                        <polygon
                          points={`${pStart.x},${pStart.y} ${pEnd.x},${pEnd.y} ${pEnd.x},${pEnd.y - vhEnd} ${pStart.x},${pStart.y - vhStart}`}
                          fill="rgba(20, 184, 166, 0.05)"
                          stroke="#14b8a6"
                          strokeWidth="0.3"
                          strokeDasharray="1 1"
                        />
                      )}
                    </g>
                  );
                } else if (material === 'aluminium_blade') {
                  // ─── ALUMINIUM BLADE FENCING ──────────────────────────────────────────
                  // CAD spec: 65×16×1.2mm blades, 85mm pitch (16mm blade + 69mm gap),
                  // two 40×40mm backing rails at 150mm from top and bottom of fence height.
                  // Blade density is pixel-relative (anti-aliasing rule) so the canvas
                  // always reads as clean architectural blade fencing regardless of zoom.

                  const railFracBottom = 150 / height; // 150mm from bottom / total height
                  const railFracTop    = (height - 150) / height; // 150mm from top

                  const railThickStart = (40 / height) * vhStart;
                  const railThickEnd   = (40 / height) * vhEnd;

                  // Pixel-relative blade pitch (anti-aliasing rule): density follows on-screen
                  // length, NOT physical meters, so it never collapses into a solid black barcode.
                  const bladePitchSVG = Math.max(0.85, 1100 / containerSize.width);
                  const numBlades = Math.max(1, Math.round(segmentLength / bladePitchSVG));

                  // CAD ratio: 16mm face within an 85mm pitch (16 face + 69 gap). The gap reads
                  // ~4.3x the face. Front face = (16/85) of the pitch; depth side ≈ face width.
                  const faceWidth  = bladePitchSVG * (16 / 85);
                  const depthWidth = faceWidth * 0.85; // 2.5D side face simulating 65mm depth receding right

                  // Shaded tones for the louver depth illusion (single light source, recede to the right)
                  const faceFill = color.hex;
                  const sideFill = shadeHex(color.hex, 0.55); // darker right-side profile
                  const topFill  = shadeHex(color.hex, 1.25); // subtle lit top cut

                  const renderBlade = (k: number) => {
                    const t = (k + 0.5) / numBlades;

                    // Skip blade if it falls within a gate opening
                    if (seg.hasGate) {
                      const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                      if (t >= startPct && t <= endPct) return null;
                    }

                    const bx = pStart.x + t * segmentWidth;
                    const by = pStart.y + t * segmentHeight;
                    const scaleB = getPerspectiveScale(by);
                    const vhB = vhStart + t * (vhEnd - vhStart);

                    const fw = faceWidth * scaleB;
                    const dw = depthWidth * scaleB;

                    // Blades span the full fence height (ground → top); the 40×40 rails are inset
                    // 150mm from each end, so the blade tips cleanly overhang past both rails.
                    const topY = by - vhB;               // clean sharp top (above top rail)
                    const botY = by;                     // ground line (below bottom rail)
                    const bladeH = botY - topY;

                    const xL = bx - fw / 2;               // left edge of front face
                    const xR = bx + fw / 2;               // right edge of front face

                    return (
                      <g key={`blade-${k}`} className="pointer-events-none">
                        {/* Side depth face (receding right) — darker, drawn first so the front face overlaps it */}
                        <polygon
                          points={`${xR},${topY} ${xR + dw},${topY + dw * 0.35} ${xR + dw},${botY + dw * 0.35} ${xR},${botY}`}
                          fill={sideFill}
                        />
                        {/* Front face — flat architectural cut, no caps */}
                        <rect
                          x={xL}
                          y={topY}
                          width={fw}
                          height={bladeH}
                          fill={faceFill}
                        />
                        {/* Sharp lit top edge of the front face */}
                        <polygon
                          points={`${xL},${topY} ${xR},${topY} ${xR + dw},${topY + dw * 0.35} ${xL + dw},${topY + dw * 0.35}`}
                          fill={topFill}
                        />
                      </g>
                    );
                  };

                  return (
                    <g key={seg.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => handlePointerDownSegment(e, seg.id)}>

                      {/* ── BACKGROUND LAYER: horizontal backing rails drawn FIRST ── */}
                      {/* Backing rail — bottom (40×40mm at 150mm from base) */}
                      {(() => {
                        const oS = vhStart * railFracBottom;
                        const oE = vhEnd   * railFracBottom;
                        return (
                          <path
                            d={`M ${pStart.x} ${pStart.y - oS} L ${pEnd.x} ${pEnd.y - oE} L ${pEnd.x} ${pEnd.y - oE - railThickEnd} L ${pStart.x} ${pStart.y - oS - railThickStart} Z`}
                            fill={shadeHex(color.hex, 0.7)}
                            stroke="#00000055"
                            strokeWidth="0.04"
                          />
                        );
                      })()}

                      {/* Backing rail — top (40×40mm at 150mm from top) */}
                      {(() => {
                        const oS = vhStart * railFracTop;
                        const oE = vhEnd   * railFracTop;
                        return (
                          <path
                            d={`M ${pStart.x} ${pStart.y - oS} L ${pEnd.x} ${pEnd.y - oE} L ${pEnd.x} ${pEnd.y - oE - railThickEnd} L ${pStart.x} ${pStart.y - oS - railThickStart} Z`}
                            fill={shadeHex(color.hex, 0.7)}
                            stroke="#00000055"
                            strokeWidth="0.04"
                          />
                        );
                      })()}

                      {/* ── FOREGROUND LAYER: vertical blades drawn LAST, face-mounted over the rails ── */}
                      {Array.from({ length: numBlades }).map((_, k) => renderBlade(k))}

                      {/* Mandatory structural line posts (2.364m max span) — billed in the quote, not decorative */}
                      {visualSpanCount > 1 && Array.from({ length: visualSpanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / visualSpanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;

                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }

                        const scale = getPerspectiveScale(py);
                        const vh = getVisualFenceHeight() * scale;
                        const postWidth = vh * 0.055;

                        return (
                          <g key={`blade-post-${j}`} className="pointer-events-none">
                            <ellipse cx={px} cy={py + 0.2} rx={postWidth * 0.85} ry="0.16" fill="#000" opacity="0.28" />
                            <path
                              d={`M ${px - postWidth/2} ${py + 0.3} L ${px - postWidth/2} ${py - vh} L ${px + postWidth/2} ${py - vh} L ${px + postWidth/2} ${py + 0.3} Z`}
                              fill={postColor.hex}
                              stroke="#00000088"
                              strokeWidth="0.04"
                            />
                          </g>
                        );
                      })}

                      {/* Selection Aura */}
                      {isSelected && (
                        <polygon
                          points={`${pStart.x},${pStart.y} ${pEnd.x},${pEnd.y} ${pEnd.x},${pEnd.y - vhEnd} ${pStart.x},${pStart.y - vhStart}`}
                          fill="rgba(20, 184, 166, 0.06)"
                          stroke="#14b8a6"
                          strokeWidth="0.32"
                          strokeDasharray="1 1"
                        />
                      )}
                    </g>
                  );
                } else if (material === 'colorbond_solid_panel') {
                  // ─── COLORBOND SOLID PANEL FENCING ────────────────────────────────────────
                  // 2400mm standard panel kit (Sawtooth or Trimline profile).
                  // ~15 vertical ribs per 2400mm span (150mm rib pitch) rendered as subtle
                  // shadow/highlight lines on top of a solid flat panel fill.
                  // Structural posts placed every 2400mm; seam lines mark panel joins.

                  const isSawtooth = solidPanelProfile === 'sawtooth';

                  // Thin cap rails at top and bottom (~25mm visible steel trim channel)
                  const railMm = 25;
                  const topCapFrac = (height - railMm) / height;
                  const botCapFrac = railMm / height;

                  // Tonal variants
                  const panelFill = color.hex;
                  const ribShadow = shadeHex(color.hex, 0.76);
                  const ribLight = shadeHex(color.hex, 1.14);
                  const capRailFill = shadeHex(color.hex, 0.80);
                  const seamColor = shadeHex(color.hex, 0.60);

                  // Perspective-correct position helpers along segment
                  const xAt = (t: number) => pStart.x + t * segmentWidth;
                  const yAt = (t: number) => pStart.y + t * segmentHeight;
                  const vhAt = (t: number) => vhStart + t * (vhEnd - vhStart);

                  // Gate opening span fractions
                  const gatePcts = seg.hasGate ? getGateSpanPcts(seg, segmentLength) : null;
                  const gS = gatePcts?.startPct ?? 0;
                  const gE = gatePcts?.endPct ?? 0;

                  // Panel fill spans: one quad normally, two when a gate cuts the panel
                  const fillSpans: [number, number][] = seg.hasGate
                    ? ([[0, gS], [gE, 1.0]] as [number, number][]).filter(([a, b]) => b > a)
                    : [[0, 1.0]];

                  const panelPath = (tA: number, tB: number) =>
                    `M ${xAt(tA)} ${yAt(tA)} L ${xAt(tB)} ${yAt(tB)} L ${xAt(tB)} ${yAt(tB) - vhAt(tB)} L ${xAt(tA)} ${yAt(tA) - vhAt(tA)} Z`;

                  // 15 ribs per 2400mm structural span × visualSpanCount spans (pixel-scaled, not metre-derived)
                  const ribsPerSpan = 15;
                  const totalRibs = ribsPerSpan * visualSpanCount;
                  const ribStrokeW = Math.max(0.35, segmentLength / 2800);

                  return (
                    <g key={seg.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => handlePointerDownSegment(e, seg.id)}>

                      {/* 1. Base panel fill — solid quadrilateral(s) */}
                      {fillSpans.map(([tA, tB], i) => (
                        <path key={`cpfill-${i}`} d={panelPath(tA, tB)} fill={panelFill} />
                      ))}

                      {/* 2. Vertical rib / profile texture */}
                      {Array.from({ length: totalRibs + 1 }).map((_, ri) => {
                        const t = ri / totalRibs;
                        if (seg.hasGate && t > gS && t < gE) return null;
                        const bx = xAt(t);
                        const by = yAt(t);
                        const topY = by - vhAt(t);
                        if (isSawtooth) {
                          // Alternating lit/shadow strips simulate the V-groove zigzag cross-section
                          const sw = Math.max(0.5, (segmentLength / totalRibs) * 0.45);
                          return (
                            <line key={`cprib-${ri}`}
                              x1={bx} y1={topY} x2={bx} y2={by}
                              stroke={ri % 2 === 0 ? ribLight : ribShadow}
                              strokeWidth={sw}
                              strokeOpacity="0.72"
                            />
                          );
                        } else {
                          // Trimline: faint shadow groove at each rib position
                          return (
                            <line key={`cprib-${ri}`}
                              x1={bx} y1={topY} x2={bx} y2={by}
                              stroke={ribShadow}
                              strokeWidth={ribStrokeW}
                              strokeOpacity="0.48"
                            />
                          );
                        }
                      })}

                      {/* 3. Panel join seam lines at 2400mm intervals */}
                      {visualSpanCount > 1 && Array.from({ length: visualSpanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / visualSpanCount;
                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }
                        return (
                          <line key={`cpseam-${j}`}
                            x1={xAt(t)} y1={yAt(t)}
                            x2={xAt(t)} y2={yAt(t) - vhAt(t)}
                            stroke={seamColor}
                            strokeWidth={Math.max(0.7, segmentLength / 1400)}
                            strokeOpacity="0.58"
                          />
                        );
                      })}

                      {/* 4. Bottom cap rail */}
                      {fillSpans.map(([tA, tB], i) => {
                        const oA = vhAt(tA) * botCapFrac;
                        const oB = vhAt(tB) * botCapFrac;
                        return (
                          <path key={`cpbotrail-${i}`}
                            d={`M ${xAt(tA)} ${yAt(tA)} L ${xAt(tB)} ${yAt(tB)} L ${xAt(tB)} ${yAt(tB) - oB} L ${xAt(tA)} ${yAt(tA) - oA} Z`}
                            fill={capRailFill}
                            stroke="#00000030"
                            strokeWidth="0.04"
                          />
                        );
                      })}

                      {/* 5. Top cap rail */}
                      {fillSpans.map(([tA, tB], i) => {
                        const oA = vhAt(tA) * topCapFrac;
                        const oB = vhAt(tB) * topCapFrac;
                        const thA = vhAt(tA) * (railMm / height);
                        const thB = vhAt(tB) * (railMm / height);
                        return (
                          <path key={`cptoprail-${i}`}
                            d={`M ${xAt(tA)} ${yAt(tA) - oA} L ${xAt(tB)} ${yAt(tB) - oB} L ${xAt(tB)} ${yAt(tB) - oB - thB} L ${xAt(tA)} ${yAt(tA) - oA - thA} Z`}
                            fill={capRailFill}
                            stroke="#00000030"
                            strokeWidth="0.04"
                          />
                        );
                      })}

                      {/* 6. Structural intermediate posts (one per 2400mm span) */}
                      {visualSpanCount > 1 && Array.from({ length: visualSpanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / visualSpanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;

                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }

                        const scale = getPerspectiveScale(py);
                        const vh = getVisualFenceHeight() * scale;
                        const postWidth = vh * 0.055;

                        return (
                          <g key={`cppost-${j}`} className="pointer-events-none">
                            <ellipse cx={px} cy={py + 0.2} rx={postWidth * 0.85} ry="0.16" fill="#000" opacity="0.28" />
                            <path
                              d={`M ${px - postWidth/2} ${py + 0.3} L ${px - postWidth/2} ${py - vh} L ${px + postWidth/2} ${py - vh} L ${px + postWidth/2} ${py + 0.3} Z`}
                              fill={postColor.hex}
                              stroke="#00000088"
                              strokeWidth="0.04"
                            />
                          </g>
                        );
                      })}

                      {/* Selection aura */}
                      {isSelected && (
                        <polygon
                          points={`${pStart.x},${pStart.y} ${pEnd.x},${pEnd.y} ${pEnd.x},${pEnd.y - vhEnd} ${pStart.x},${pStart.y - vhStart}`}
                          fill="rgba(20, 184, 166, 0.06)"
                          stroke="#14b8a6"
                          strokeWidth="0.32"
                          strokeDasharray="1 1"
                        />
                      )}
                    </g>
                  );
                } else if (material === 'aluminium_perforated') {
                  // ─── ALUMINIUM PERFORATED PANEL FENCING ────────────────────────────────
                  // Pool-compliant framed panel with uniform 9mm punched round holes on a
                  // ~13.5mm grid (AS1926.1). Rendered as an SVG <pattern> dot grid over a
                  // solid base fill so it reads semi-transparent like the real product.

                  // Frame/post colour: slightly darkened version of the panel colour for the
                  // extruded aluminium frame channel that surrounds each 2000mm panel.
                  const frameFill = shadeHex(color.hex, 0.78);
                  const frameThickStart = vhStart * 0.028; // ~25mm frame channel top & bottom
                  const frameThickEnd   = vhEnd   * 0.028;

                  // Fine-mesh hole pattern: ~55 rows at 1800mm → reads as perforated screen at screen distance.
                  // Each tile is a transparent "hole" background; a small colored circle represents the metal land.
                  // Open area ≈ 1 − π(0.33)² ≈ 65.7% transparent, matching the see-through real product.
                  const holeStep = getVisualFenceHeight() * 0.018; // 65% smaller than previous 0.052
                  const metalR   = holeStep * 0.33; // radius of solid metal dot (background = hole / transparent)
                  const patternId = `perf-holes-${seg.id}`;

                  // Clip the perforated quad so holes don't bleed outside the panel boundary
                  const clipId = `perf-clip-${seg.id}`;
                  const panelPath = `M ${pStart.x} ${pStart.y} L ${pEnd.x} ${pEnd.y} L ${pEnd.x} ${pEnd.y - vhEnd} L ${pStart.x} ${pStart.y - vhStart} Z`;

                  // Gate openings
                  const gatePcts = seg.hasGate ? getGateSpanPcts(seg, segmentLength) : null;
                  const gS = gatePcts?.startPct ?? 0;
                  const gE = gatePcts?.endPct ?? 0;
                  const fillSpans: [number, number][] = seg.hasGate
                    ? ([[0, gS], [gE, 1.0]] as [number, number][]).filter(([a, b]) => b > a)
                    : [[0, 1.0]];

                  const xAt = (t: number) => pStart.x + t * segmentWidth;
                  const yAt = (t: number) => pStart.y + t * segmentHeight;
                  const vhAt = (t: number) => vhStart + t * (vhEnd - vhStart);

                  const spanPath = (tA: number, tB: number) =>
                    `M ${xAt(tA)} ${yAt(tA)} L ${xAt(tB)} ${yAt(tB)} L ${xAt(tB)} ${yAt(tB) - vhAt(tB)} L ${xAt(tA)} ${yAt(tA) - vhAt(tA)} Z`;

                  return (
                    <g key={seg.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => handlePointerDownSegment(e, seg.id)}>
                      <defs>
                        {/* Fine-mesh pattern: transparent background (= hole) + colored circle (= metal land).
                            Background photo shows through the ~66% open area between circles. */}
                        <pattern id={patternId} x="0" y="0" width={holeStep} height={holeStep} patternUnits="userSpaceOnUse">
                          <circle cx={holeStep / 2} cy={holeStep / 2} r={metalR} fill={color.hex} />
                        </pattern>
                        <clipPath id={clipId}>
                          <path d={panelPath} />
                        </clipPath>
                      </defs>

                      {/* 1. Faint ambient tint — real perforated metal has slight haze at viewing angles */}
                      {fillSpans.map(([tA, tB], i) => (
                        <path key={`pf-fill-${i}`} d={spanPath(tA, tB)} fill={color.hex} opacity={0.09} />
                      ))}

                      {/* 2. Dot-grid perforation overlay — clipped to panel outline */}
                      {fillSpans.map(([tA, tB], i) => {
                        const left  = Math.min(xAt(tA), xAt(tB));
                        const right = Math.max(xAt(tA), xAt(tB));
                        const top   = Math.min(yAt(tA) - vhAt(tA), yAt(tB) - vhAt(tB));
                        const bot   = Math.max(yAt(tA), yAt(tB));
                        return (
                          <rect
                            key={`pf-dots-${i}`}
                            x={left} y={top}
                            width={right - left} height={bot - top}
                            fill={`url(#${patternId})`}
                            clipPath={`url(#${clipId})`}
                          />
                        );
                      })}

                      {/* 3. Top frame rail */}
                      {fillSpans.map(([tA, tB], i) => {
                        const oA = vhAt(tA); const oB = vhAt(tB);
                        return (
                          <path key={`pf-topframe-${i}`}
                            d={`M ${xAt(tA)} ${yAt(tA) - oA} L ${xAt(tB)} ${yAt(tB) - oB} L ${xAt(tB)} ${yAt(tB) - oB + frameThickEnd} L ${xAt(tA)} ${yAt(tA) - oA + frameThickStart} Z`}
                            fill={frameFill} stroke="#00000030" strokeWidth="0.03"
                          />
                        );
                      })}

                      {/* 4. Bottom frame rail */}
                      {fillSpans.map(([tA, tB], i) => (
                        <path key={`pf-botframe-${i}`}
                          d={`M ${xAt(tA)} ${yAt(tA)} L ${xAt(tB)} ${yAt(tB)} L ${xAt(tB)} ${yAt(tB) - frameThickEnd} L ${xAt(tA)} ${yAt(tA) - frameThickStart} Z`}
                          fill={frameFill} stroke="#00000030" strokeWidth="0.03"
                        />
                      ))}

                      {/* 5. Intermediate structural posts (one per 2000mm panel span) */}
                      {visualSpanCount > 1 && Array.from({ length: visualSpanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / visualSpanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;
                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }
                        const sc = getPerspectiveScale(py);
                        const vh = getVisualFenceHeight() * sc;
                        const pw = vh * 0.055;
                        return (
                          <g key={`pf-post-${j}`} className="pointer-events-none">
                            <ellipse cx={px} cy={py + 0.2} rx={pw * 0.85} ry="0.16" fill="#000" opacity="0.28" />
                            <path d={`M ${px - pw/2} ${py + 0.3} L ${px - pw/2} ${py - vh} L ${px + pw/2} ${py - vh} L ${px + pw/2} ${py + 0.3} Z`} fill={frameFill} stroke="#00000088" strokeWidth="0.04" />
                          </g>
                        );
                      })}

                      {/* 6. Selection aura */}
                      {isSelected && (
                        <polygon
                          points={`${pStart.x},${pStart.y} ${pEnd.x},${pEnd.y} ${pEnd.x},${pEnd.y - vhEnd} ${pStart.x},${pStart.y - vhStart}`}
                          fill="rgba(20, 184, 166, 0.06)"
                          stroke="#14b8a6"
                          strokeWidth="0.32"
                          strokeDasharray="1 1"
                        />
                      )}
                    </g>
                  );
                }
                return null;
                })();

                // ── GATE OVERLAY for this segment ──────────────────────────────────────
                const gateEl: React.ReactNode = (() => {
                if (!seg.hasGate) return null;

                const { startPct: gStartPct, endPct: gEndPct } = getGateSpanPcts(seg, segmentLength);

                const gx1 = pStart.x + gStartPct * segmentWidth;
                const gy1 = pStart.y + gStartPct * segmentHeight;

                const gx2 = pStart.x + gEndPct * segmentWidth;
                const gy2 = pStart.y + gEndPct * segmentHeight;

                const scaleG1 = getPerspectiveScale(gy1);
                const scaleG2 = getPerspectiveScale(gy2);

                const vhStart = getVisualFenceHeight() * scaleG1;
                const vhEnd = getVisualFenceHeight() * scaleG2;

                const ghtStart = vhStart * 0.95; // Gates are slightly recessed
                const ghtEnd = vhEnd * 0.95;

                return (
                  <g 
                    key={`gate-${seg.id}`} 
                    className="gate-overlay pointer-events-auto cursor-grab active:cursor-grabbing group/gate"
                    onPointerDown={(e) => handlePointerDownGate(e, seg.id, 'move')}
                  >
                    
                    {/* Glowing Selection Aura/Halo around selected gate */}
                    {isSelected && (
                      <polygon
                        points={`
                          ${gx1 - 0.6},${gy1 + 0.4}
                          ${gx2 + 0.6},${gy2 + 0.4}
                          ${gx2 + 0.6},${gy2 - ghtEnd - 0.4}
                          ${gx1 - 0.6},${gy1 - ghtStart - 0.4}
                        `}
                        fill="rgba(20, 184, 166, 0.08)"
                        stroke="#14b8a6"
                        strokeWidth="0.22"
                        strokeDasharray="0.8 0.8"
                        className="pointer-events-none animate-[pulse_2s_infinite_ease-in-out]"
                      />
                    )}

                    {/* Shadow underneath gate frame */}
                    <line x1={gx1} y1={gy1} x2={gx2} y2={gy2} stroke="#000" strokeWidth="0.4" opacity="0.15" />

                    {/* Highly detailed procedural SVG elements for Single and Double Gates */}
                    {(() => {
                      const px = (t: number, h_ratio: number = 0) => {
                        return gx1 + t * (gx2 - gx1);
                      };
                      const py = (t: number, h_ratio: number = 0) => {
                        const currentBaseY = gy1 + t * (gy2 - gy1);
                        const currentGht = ghtStart + t * (ghtEnd - ghtStart);
                        return currentBaseY - h_ratio * currentGht;
                      };

                      if (seg.gateType === 'double') {
                        return (
                          <g>
                            {/* LEFT GATE LEAF */}
                            {/* 1. Heavy Top bar */}
                            <polygon
                              points={`${px(0, 1)},${py(0, 1)} ${px(0.495, 1)},${py(0.495, 1)} ${px(0.495, 0.91)},${py(0.495, 0.91)} ${px(0, 0.91)},${py(0, 0.91)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 2. Heavy Bottom bar */}
                            <polygon
                              points={`${px(0, 0.09)},${py(0, 0.09)} ${px(0.495, 0.09)},${py(0.495, 0.09)} ${px(0.495, 0)},${py(0.495, 0)} ${px(0, 0)},${py(0, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 3. Left vertical border */}
                            <polygon
                              points={`${px(0, 1)},${py(0, 1)} ${px(0.04, 1)},${py(0.04, 1)} ${px(0.04, 0)},${py(0.04, 0)} ${px(0, 0)},${py(0, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 4. Right vertical border */}
                            <polygon
                              points={`${px(0.455, 1)},${py(0.455, 1)} ${px(0.495, 1)},${py(0.495, 1)} ${px(0.495, 0)},${py(0.495, 0)} ${px(0.455, 0)},${py(0.455, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 5. Left leaf inner slats */}
                            {(() => {
                              const isChunky = slatProfile === '90';
                              const innerSlatCount = isChunky ? 8 : 12;
                              const slatSpan = 0.82; // from 0.09 to 0.91 height ratio
                              const slatStep = slatSpan / innerSlatCount;
                              const slatRatio = isChunky ? 0.84 : 0.76;

                              return Array.from({ length: innerSlatCount }).map((_, sIdx) => {
                                const hStart = 0.09 + sIdx * slatStep + (slatStep * (1 - slatRatio) / 2);
                                const hEnd = hStart + slatStep * slatRatio;

                                return (
                                  <polygon
                                    key={`l-slat-${sIdx}`}
                                    points={`
                                      ${px(0.04, hStart)},${py(0.04, hStart)}
                                      ${px(0.455, hStart)},${py(0.455, hStart)}
                                      ${px(0.455, hEnd)},${py(0.455, hEnd)}
                                      ${px(0.04, hEnd)},${py(0.04, hEnd)}
                                    `}
                                    fill={color.hex}
                                    stroke="#111"
                                    strokeWidth="0.03"
                                  />
                                );
                              });
                            })()}

                            {/* RIGHT GATE LEAF */}
                            {/* 1. Heavy Top bar */}
                            <polygon
                              points={`${px(0.505, 1)},${py(0.505, 1)} ${px(1, 1)},${py(1, 1)} ${px(1, 0.91)},${py(1, 0.91)} ${px(0.505, 0.91)},${py(0.505, 0.91)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 2. Heavy Bottom bar */}
                            <polygon
                              points={`${px(0.505, 0.09)},${py(0.505, 0.09)} ${px(1, 0.09)},${py(1, 0.09)} ${px(1, 0)},${py(1, 0)} ${px(0.505, 0)},${py(0.505, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 3. Left vertical border */}
                            <polygon
                              points={`${px(0.505, 1)},${py(0.505, 1)} ${px(0.545, 1)},${py(0.545, 1)} ${px(0.545, 0)},${py(0.545, 0)} ${px(0.505, 0)},${py(0.505, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 4. Right vertical border */}
                            <polygon
                              points={`${px(0.96, 1)},${py(0.96, 1)} ${px(1, 1)},${py(1, 1)} ${px(1, 0)},${py(1, 0)} ${px(0.96, 0)},${py(0.96, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 5. Right leaf inner slats */}
                            {(() => {
                              const isChunky = slatProfile === '90';
                              const innerSlatCount = isChunky ? 8 : 12;
                              const slatSpan = 0.82;
                              const slatStep = slatSpan / innerSlatCount;
                              const slatRatio = isChunky ? 0.84 : 0.76;

                              return Array.from({ length: innerSlatCount }).map((_, sIdx) => {
                                const hStart = 0.09 + sIdx * slatStep + (slatStep * (1 - slatRatio) / 2);
                                const hEnd = hStart + slatStep * slatRatio;

                                return (
                                  <polygon
                                    key={`r-slat-${sIdx}`}
                                    points={`
                                      ${px(0.545, hStart)},${py(0.545, hStart)}
                                      ${px(0.96, hStart)},${py(0.96, hStart)}
                                      ${px(0.96, hEnd)},${py(0.96, hEnd)}
                                      ${px(0.545, hEnd)},${py(0.545, hEnd)}
                                    `}
                                    fill={color.hex}
                                    stroke="#111"
                                    strokeWidth="0.03"
                                  />
                                );
                              });
                            })()}

                            {/* Center meeting lock-box and black lever handle */}
                            <polygon
                              points={`
                                ${px(0.485, 0.54)},${py(0.485, 0.54)}
                                ${px(0.515, 0.54)},${py(0.515, 0.54)}
                                ${px(0.515, 0.43)},${py(0.515, 0.43)}
                                ${px(0.485, 0.43)},${py(0.485, 0.43)}
                              `}
                              fill="#1a1c1e"
                              stroke="#000000"
                              strokeWidth="0.02"
                            />
                            <line
                              x1={px(0.495, 0.485)}
                              y1={py(0.495, 0.485)}
                              x2={px(0.47, 0.485)}
                              y2={py(0.47, 0.485)}
                              stroke="#0d0e0f"
                              strokeWidth="0.12"
                              strokeLinecap="round"
                            />
                            <circle cx={px(0.495, 0.485)} cy={py(0.495, 0.485)} r="0.08" fill="#333" />
                          </g>
                        );
                      } else {
                        // SINGLE PEDESTRIAN GATE
                        return (
                          <g>
                            {/* 1. Heavy Top bar */}
                            <polygon
                              points={`${px(0, 1)},${py(0, 1)} ${px(1, 1)},${py(1, 1)} ${px(1, 0.91)},${py(1, 0.91)} ${px(0, 0.91)},${py(0, 0.91)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 2. Heavy Bottom bar */}
                            <polygon
                              points={`${px(0, 0.09)},${py(0, 0.09)} ${px(1, 0.09)},${py(1, 0.09)} ${px(1, 0)},${py(1, 0)} ${px(0, 0)},${py(0, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 3. Left vertical border */}
                            <polygon
                              points={`${px(0, 1)},${py(0, 1)} ${px(0.06, 1)},${py(0.06, 1)} ${px(0.06, 0)},${py(0.06, 0)} ${px(0, 0)},${py(0, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 4. Right vertical border */}
                            <polygon
                              points={`${px(0.94, 1)},${py(0.94, 1)} ${px(1, 1)},${py(1, 1)} ${px(1, 0)},${py(1, 0)} ${px(0.94, 0)},${py(0.94, 0)}`}
                              fill={color.hex}
                              stroke="#000000"
                              strokeWidth="0.05"
                            />
                            {/* 5. Pedestrian inner slats */}
                            {(() => {
                              const isChunky = slatProfile === '90';
                              const innerSlatCount = isChunky ? 8 : 12;
                              const slatSpan = 0.82; // from 0.09 to 0.91 height ratio
                              const slatStep = slatSpan / innerSlatCount;
                              const slatRatio = isChunky ? 0.84 : 0.76;

                              return Array.from({ length: innerSlatCount }).map((_, sIdx) => {
                                const hStart = 0.09 + sIdx * slatStep + (slatStep * (1 - slatRatio) / 2);
                                const hEnd = hStart + slatStep * slatRatio;

                                return (
                                  <polygon
                                    key={`s-slat-${sIdx}`}
                                    points={`
                                      ${px(0.06, hStart)},${py(0.06, hStart)}
                                      ${px(0.94, hStart)},${py(0.94, hStart)}
                                      ${px(0.94, hEnd)},${py(0.94, hEnd)}
                                      ${px(0.06, hEnd)},${py(0.06, hEnd)}
                                    `}
                                    fill={color.hex}
                                    stroke="#111"
                                    strokeWidth="0.03"
                                  />
                                );
                              });
                            })()}

                            {/* Pedestrian Lock-box and handle lever */}
                            <polygon
                              points={`
                                ${px(0.91, 0.54)},${py(0.91, 0.54)}
                                ${px(0.938, 0.54)},${py(0.938, 0.54)}
                                ${px(0.938, 0.43)},${py(0.938, 0.43)}
                                ${px(0.91, 0.43)},${py(0.91, 0.43)}
                              `}
                              fill="#1a1c1e"
                              stroke="#000000"
                              strokeWidth="0.02"
                            />
                            <line
                              x1={px(0.92, 0.485)}
                              y1={py(0.92, 0.485)}
                              x2={px(0.89, 0.485)}
                              y2={py(0.89, 0.485)}
                              stroke="#0d0e0f"
                              strokeWidth="0.10"
                              strokeLinecap="round"
                            />
                            <circle cx={px(0.92, 0.485)} cy={py(0.92, 0.485)} r="0.06" fill="#333" />
                          </g>
                        );
                      }
                    })()}

                    {/* Left and Right heavy structural posts / pillars supporting the gate leaf */}
                    <line x1={gx1} y1={gy1 + 0.4} x2={gx1} y2={gy1 - vhStart} stroke={postColor.hex} strokeWidth={0.88 * scaleG1} strokeLinecap="square" />
                    <line x1={gx2} y1={gy2 + 0.4} x2={gx2} y2={gy2 - vhEnd} stroke={postColor.hex} strokeWidth={0.88 * scaleG2} strokeLinecap="square" opacity="0.95" />

                    {/* Heavy duty black metal hinge mounts attaching to side posts */}
                    <circle cx={gx1} cy={gy1 - ghtStart * 0.8} r={0.16 * scaleG1} fill="#111" />
                    <circle cx={gx1} cy={gy1 - ghtStart * 0.2} r={0.16 * scaleG1} fill="#111" />
                    <circle cx={gx2} cy={gy2 - ghtEnd * 0.8} r={0.16 * scaleG2} fill="#111" />
                    <circle cx={gx2} cy={gy2 - ghtEnd * 0.2} r={0.16 * scaleG2} fill="#111" />

                    {/* Gate Label Bubble */}
                    <g transform={`translate(${(gx1 + gx2) / 2}, ${(gy1 + gy2) / 2 - (ghtStart + ghtEnd) / 4 - 2.2})`}>
                      <rect x="-4.5" y="-1.1" width="9" height="2.2" rx="0.6" fill="#1f2125" stroke={isSelected ? '#14b8a6' : '#444'} strokeWidth="0.12" />
                      <text x={seg.isStandaloneGate && isSelected ? -1.0 : 0} y={0.35} fill="#ffffff" fontSize="0.92" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">
                        {seg.gateType === 'double' ? 'Double Gate' : 'Single Gate'}
                      </text>
                      
                      {seg.isStandaloneGate && isSelected && (
                        <g 
                          transform="translate(2.7, 0)" 
                          className="cursor-pointer pointer-events-auto hover:opacity-80"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            deleteSelectedSegment();
                          }}
                        >
                          <circle r="0.6" fill="#ef4444" />
                          {/* Draw a tiny white X */}
                          <line x1="-0.22" y1="-0.22" x2="0.22" y2="0.22" stroke="#ffffff" strokeWidth="0.12" strokeLinecap="round" />
                          <line x1="0.22" y1="-0.22" x2="-0.22" y2="0.22" stroke="#ffffff" strokeWidth="0.12" strokeLinecap="round" />
                        </g>
                      )}
                    </g>
                    
                    {/* Active drag handles when selected */}
                    {isSelected && !seg.isStandaloneGate && (
                      <g className="pointer-events-auto">
                        {/* Left resize handle (filled teal circle) */}
                        <circle
                          cx={gx1}
                          cy={gy1}
                          r={0.8 * scaleG1}
                          fill="#14b8a6"
                          stroke="#ffffff"
                          strokeWidth="0.12"
                          className="transition-transform duration-200"
                        />
                        {/* Invisible tablet touch hitbox */}
                        <circle
                          cx={gx1}
                          cy={gy1}
                          r={Math.max(2.5, 2.8 * scaleG1)}
                          fill="transparent"
                          className="cursor-ew-resize hover:scale-110 transition-transform duration-200"
                          onPointerDown={(e) => handlePointerDownGate(e, seg.id, 'resize-left')}
                        />
                        
                        {/* Right resize handle (filled teal circle) */}
                        <circle
                          cx={gx2}
                          cy={gy2}
                          r={0.8 * scaleG2}
                          fill="#14b8a6"
                          stroke="#ffffff"
                          strokeWidth="0.12"
                          className="transition-transform duration-200"
                        />
                        {/* Invisible tablet touch hitbox */}
                        <circle
                          cx={gx2}
                          cy={gy2}
                          r={Math.max(2.5, 2.8 * scaleG2)}
                          fill="transparent"
                          className="cursor-ew-resize hover:scale-110 transition-transform duration-200"
                          onPointerDown={(e) => handlePointerDownGate(e, seg.id, 'resize-right')}
                        />
                      </g>
                    )}
                  </g>
                );
                })();

                // Render end-posts owned by this segment (i.e. this is the frontmost
                // segment referencing each post). Shared corner posts render exactly once.
                const postEls = [pStart, pEnd]
                  .filter((p): p is typeof posts[0] => !!p && postFrontmostIdx.get(p.id) === sIdx)
                  .map(renderPost);

                return <React.Fragment key={sIdx}>{panelEl}{gateEl}{postEls}</React.Fragment>;
              });

              return <>{panelGateEls}</>;
              })()}

              {/* Ghost post preview in Insert Post mode */}
              {insertPostHover && (() => {
                const gh = getVisualFenceHeight();
                const pw = gh * 0.055;
                return (
                  <rect
                    x={insertPostHover.x - pw / 2}
                    y={insertPostHover.y - gh}
                    width={pw}
                    height={gh}
                    fill={insertPostHover.valid ? 'rgba(20,184,166,0.55)' : 'rgba(239,68,68,0.55)'}
                    stroke={insertPostHover.valid ? '#14b8a6' : '#ef4444'}
                    strokeWidth={0.15}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })()}

            </g>
          </svg>

          {/* 4. DRAG HANDLES BUTTONS LAYER (Floating absolute HTML nodes on top of SVG) */}
          {(selectedPostId !== null || selectedSegmentId !== null || activeTab === 'posts') && posts.map((post) => {
            const isSelected = selectedPostId === post.id;
            
            // Apply global movement offset to match SVG positions perfectly
            const leftPct = `${post.x + globalOffset.x}%`;
            const topPct = `${post.y + globalOffset.y}%`;

            // Get dynamic perspective scale for the interactive grab handle
            const handleScale = getPerspectiveScale(post.y);
            const handleSize = Math.max(16, Math.min(28, 18 * handleScale)); // Visual size of the dot
            
            // Generous touch target size: 44px minimum for tablet usability
            const touchTargetSize = 44;
            const ml = -touchTargetSize / 2;
            const mt = -touchTargetSize / 2;

            return (
              <div
                key={post.id}
                onPointerDown={(e) => handlePointerDownPost(e, post.id)}
                className="absolute flex items-center justify-center cursor-move select-none touch-none z-20 group"
                style={{ 
                  left: leftPct, 
                  top: topPct,
                  width: `${touchTargetSize}px`,
                  height: `${touchTargetSize}px`,
                  marginLeft: `${ml}px`,
                  marginTop: `${mt}px`
                }}
              >
                {/* Visual Anchor Dot representing the ground vertex */}
                <div
                  className={`rounded-full flex items-center justify-center transition shadow-md duration-200 ${
                    isSelected 
                      ? 'bg-[#ff6a1f] border border-white ring-2 ring-[#ff6a1f] scale-110 shadow-lg' 
                      : activeDragId === post.id 
                        ? 'bg-[#ff6a1f] scale-125 shadow-lg border border-white'
                        : 'bg-[#ece7db] border bg-[#f3efe6] border-white/60 hover:bg-[#e2ddd0] hover:scale-115'
                  }`}
                  style={{
                    width: `${handleSize}px`,
                    height: `${handleSize}px`
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-[#ece7db]/60" />
                </div>
                
                {/* Floating Tooltip Label */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-[#1a1c1e] text-[9px] px-1.5 py-0.5 rounded border border-[#cfc8b8] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-sans flex items-center gap-1 shadow-md">
                  <span className="font-semibold text-[#ff6a1f] uppercase">{post.type} post</span>
                  <span className="text-[#5f6266] font-mono">({Math.round(post.x)}%, {Math.round(post.y)}%)</span>
                </div>
              </div>
            );
          })}


          </div>
        </div>

        {/* 6. Insert Post mode HUD banner */}
        {isInsertPostMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 border border-teal-400/40 px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 z-40 select-none pointer-events-none">
            <GitCommit className="w-4 h-4 text-teal-500 shrink-0" />
            <span className="text-[11px] font-bold text-[#1a1c1e] uppercase tracking-wider">Add Post Mode</span>
            <span className="text-[10px] text-[#5f6266]">— hover a segment and click to insert</span>
          </div>
        )}

        {/* 5. CANVAS VIEW NAVIGATOR HUD (Digital Zoom & Pan Controls) */}
        <div
          onPointerDown={(e) => handlePanelDragStart(e, 'viewEngine')}
          onPointerMove={(e) => handlePanelDragMove(e, 'viewEngine')}
          onPointerUp={(e) => handlePanelDragEnd(e, 'viewEngine')}
          className={`absolute bottom-4 right-4 bg-white/95 border border-[#d9d3c5] px-2.5 py-1.5 rounded-lg shadow-xl flex items-center gap-2 z-30 select-none cursor-grab active:cursor-grabbing ${
            dragPanel === 'viewEngine' ? 'ring-1 ring-[#ff6a1f]/50' : ''
          }`}
          style={{
            transform: `translate(${viewEngineOffset.x}px, ${viewEngineOffset.y}px)`,
            touchAction: 'none'
          }}
        >
          <div className="flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-[#ff6a1f] rotate-12" />
            <span className="text-[10px] font-bold text-[#3c4045] font-sans uppercase tracking-wider">HUD</span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-[#d9d3c5] pl-2">
            <button
              onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
              className="btn-tool btn-tool-sm"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-[10px] font-mono font-bold text-[#3c4045] bg-[#ece7db] px-1.5 py-0.5 rounded border border-[#d9d3c5]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(3.0, prev + 0.25))}
              className="btn-tool btn-tool-sm"
              title="Zoom In"
            >
              +
            </button>
          </div>

          {(zoom !== 1 || viewportPan.x !== 0 || viewportPan.y !== 0) && (
            <button
              onClick={() => {
                setZoom(1);
                setViewportPan({ x: 0, y: 0 });
              }}
              className="btn-tool btn-tool-sm"
              title="Reset Zoom & Panning"
            >
              Reset
            </button>
          )}
        </div>

        {/* Global movement controller widget on canvas */}
        {isShiftResizeMinimized ? (
          <button
            onPointerDown={(e) => handlePanelDragStart(e, 'reposition')}
            onPointerMove={(e) => handlePanelDragMove(e, 'reposition')}
            onPointerUp={(e) => handlePanelDragEnd(e, 'reposition')}
            onClick={() => setIsShiftResizeMinimized(false)}
            className={`absolute bottom-4 left-4 bg-white/95 hover:bg-[#ece7db] border border-[#d9d3c5] px-2.5 py-1.5 rounded-lg shadow-xl z-30 flex items-center gap-1 text-[10px] font-bold text-[#3c4045] cursor-grab active:cursor-grabbing select-none`}
            style={{
              transform: `translate(${repositionOffset.x}px, ${repositionOffset.y}px)`,
              touchAction: 'none'
            }}
            title="Expand positioning controls"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Move Fence</span>
          </button>
        ) : (
          <div
            onPointerDown={(e) => handlePanelDragStart(e, 'reposition')}
            onPointerMove={(e) => handlePanelDragMove(e, 'reposition')}
            onPointerUp={(e) => handlePanelDragEnd(e, 'reposition')}
            className={`absolute bottom-4 left-4 bg-white/95 border border-[#d9d3c5] px-2.5 py-2 rounded-lg shadow-xl flex flex-col gap-1.5 z-30 select-none max-w-[170px] cursor-grab active:cursor-grabbing ${
              dragPanel === 'reposition' ? 'ring-1 ring-[#ff6a1f]/50' : ''
            }`}
            style={{
              transform: `translate(${repositionOffset.x}px, ${repositionOffset.y}px)`,
              touchAction: 'none'
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[10px] font-bold text-[#3c4045]">
                <Sliders className="w-3 h-3 text-[#ff6a1f]" />
                <span>Move Fence</span>
              </div>
              <button
                onClick={() => setIsShiftResizeMinimized(true)}
                className="text-[9px] text-[#5f6266] hover:text-[#ff6a1f] transition cursor-pointer font-bold shrink-0 uppercase"
                title="Collapse Panel"
              >
                Hide
              </button>
            </div>

            {/* D-Pad positioning cluster */}
            <div className="grid grid-cols-3 gap-1 w-max mx-auto py-0.5">
              <div />
              <button
                onClick={() => nudgeFenceFile(0, -1)}
                title="Shift Fence Up"
                className="btn-tool btn-tool-sm w-5.5 h-5.5"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <div />

              <button
                onClick={() => nudgeFenceFile(-1, 0)}
                title="Shift Fence Left"
                className="btn-tool btn-tool-sm w-5.5 h-5.5"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setGlobalOffset({ x: 0, y: 0 })}
                title="Recenter Fence"
                className="btn-tool btn-tool-sm w-5.5 h-5.5 font-mono text-[8px] uppercase"
              >
                RST
              </button>
              <button
                onClick={() => nudgeFenceFile(1, 0)}
                title="Shift Fence Right"
                className="btn-tool btn-tool-sm w-5.5 h-5.5"
              >
                <ChevronRight className="w-3 h-3" />
              </button>

              <div />
              <button
                onClick={() => nudgeFenceFile(0, 1)}
                title="Shift Fence Down"
                className="btn-tool btn-tool-sm w-5.5 h-5.5"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
              <div />
            </div>

            {/* Sizing scale slider is disabled; height is strictly locked to the global height dropdown */}
          </div>
        )}

        {/* Selected element mini floating control dashboard */}
        {selectedPostId && (
          isPostCustomizerMinimized ? (
            <button
              onPointerDown={(e) => handlePanelDragStart(e, 'post')}
              onPointerMove={(e) => handlePanelDragMove(e, 'post')}
              onPointerUp={(e) => handlePanelDragEnd(e, 'post')}
              onClick={() => setIsPostCustomizerMinimized(false)}
              className={`absolute top-4 right-4 bg-white/95 border border-[#ff6a1f]/20 px-2.5 py-1.5 rounded-lg shadow-xl z-30 flex items-center justify-between w-44 text-[10px] text-[#1a1c1e] cursor-grab active:cursor-grabbing select-none`}
              style={{
                transform: `translate(${postCustomizerOffset.x}px, ${postCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
              title="Expand selected post customizer"
            >
              <span className="font-bold text-[#ff6a1f]">Post Upgrade</span>
              <span className="text-[9px] text-[#5f6266] uppercase font-semibold">[+]</span>
            </button>
          ) : (
            <div
              onPointerDown={(e) => handlePanelDragStart(e, 'post')}
              onPointerMove={(e) => handlePanelDragMove(e, 'post')}
              onPointerUp={(e) => handlePanelDragEnd(e, 'post')}
              className={`absolute top-4 right-4 bg-white/95 border border-[#ff6a1f]/20 px-2.5 py-2 rounded-lg shadow-xl z-30 w-48 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-white transition-all duration-150 ${
                dragPanel === 'post' ? 'ring-1 ring-[#ff6a1f]/50' : ''
              }`}
              style={{
                transform: `translate(${postCustomizerOffset.x}px, ${postCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
            >
              <div className="flex items-center justify-between font-sans">
                <span className="text-[10px] font-bold text-[#ff6a1f] uppercase tracking-wider">Post Upgrade</span>
                <button
                  onClick={() => setIsPostCustomizerMinimized(true)}
                  className="text-[9px] text-[#5f6266] hover:text-[#ff6a1f] transition cursor-pointer font-bold uppercase shrink-0"
                  title="Minimize"
                >
                  Hide
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] text-[#5f6266] uppercase tracking-widest leading-none mb-0.5">Style:</label>
                <select
                  value={posts.find(p => p.id === selectedPostId)?.type || 'standard'}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setPosts(prev => prev.map(p => p.id === selectedPostId ? { ...p, type: val } : p));
                  }}
                  className="w-full text-[10px] font-medium bg-[#ece7db] text-[#1a1c1e] rounded px-1.5 py-0.5 border border-[#cfc8b8] focus:outline-none focus:border-[#ff6a1f]"
                >
                  <option value="standard">Standard (50mm)</option>
                  <option value="corner">Heavy Corner (100mm)</option>
                  <option value="gate">Gate Post (80mm)</option>
                  <option value="H-post">H-Post guide</option>
                  <option value="decorative">Sandstone Pillar</option>
                </select>
              </div>

              {/* Micro Nudges inside popup */}
              <div className="flex flex-col gap-1 mt-0.5 border-t border-[#d9d3c5] pt-1">
                <span className="text-[8px] text-[#5f6266] text-center uppercase tracking-wider font-bold">Nudge Node</span>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => nudgePost(0, -0.25)} className="px-1 py-0.5 bg-[#ece7db] text-[#1a1c1e] rounded text-[9px] hover:bg-[#e2ddd0] cursor-pointer uppercase">▲ Up</button>
                  <button onClick={() => nudgePost(0, 0.25)} className="px-1 py-0.5 bg-[#ece7db] text-[#1a1c1e] rounded text-[9px] hover:bg-[#e2ddd0] cursor-pointer uppercase">▼ Down</button>
                  <button onClick={() => nudgePost(-0.25, 0)} className="px-1 py-0.5 bg-[#ece7db] text-[#1a1c1e] rounded text-[9px] hover:bg-[#e2ddd0] cursor-pointer uppercase">◀ L</button>
                  <button onClick={() => nudgePost(0.25, 0)} className="px-1 py-0.5 bg-[#ece7db] text-[#1a1c1e] rounded text-[9px] hover:bg-[#e2ddd0] cursor-pointer uppercase">▶ R</button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-1.5 mt-1.5 border-t border-[#d9d3c5] pt-1.5">
                <button
                  onClick={() => setSelectedPostId(null)}
                  className="bg-[#ece7db] hover:bg-[#e2ddd0] text-[#1a1c1e] rounded py-1 text-center text-[10px] uppercase font-bold cursor-pointer transition border border-[#cfc8b8]"
                >
                  Deselect
                </button>
                <button
                  onClick={() => deleteSelectedPost()}
                  disabled={posts.length <= 2}
                  className="bg-[#fff1e9]/60 hover:bg-[#ffe3d3] border border-[#ffd4bd]/35 text-[#ff6a1f] disabled:opacity-40 disabled:cursor-not-allowed rounded py-1 px-1.5 text-center text-[10px] uppercase font-bold cursor-pointer transition flex items-center justify-center gap-1"
                  title="Remove selected post"
                >
                  <Trash2 className="w-3 h-3 shrink-0" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )
        )}

        {/* Segment context floating popup menu */}
        {selectedSegmentId && !segments.find(s => s.id === selectedSegmentId)?.isStandaloneGate && (
          isSegmentCustomizerMinimized ? (
            <button
              onPointerDown={(e) => handlePanelDragStart(e, 'segment')}
              onPointerMove={(e) => handlePanelDragMove(e, 'segment')}
              onPointerUp={(e) => handlePanelDragEnd(e, 'segment')}
              onClick={() => setIsSegmentCustomizerMinimized(false)}
              className={`absolute top-4 right-4 bg-white/95 border border-[#ff6a1f]/20 px-2.5 py-1.5 rounded-lg shadow-xl z-30 transition flex items-center justify-between w-48 text-[10px] text-[#1a1c1e] cursor-grab active:cursor-grabbing select-none`}
              style={{
                transform: `translate(${segmentCustomizerOffset.x}px, ${segmentCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
              title="Expand segment customizer"
            >
              <span className="font-bold text-[#ff6a1f]">Segment Settings</span>
              <span className="text-[9px] text-[#5f6266] uppercase font-semibold">[+]</span>
            </button>
          ) : (
            <div
              onPointerDown={(e) => handlePanelDragStart(e, 'segment')}
              onPointerMove={(e) => handlePanelDragMove(e, 'segment')}
              onPointerUp={(e) => handlePanelDragEnd(e, 'segment')}
              className={`absolute top-4 right-4 bg-white/95 border border-[#ff6a1f]/20 px-2.5 py-2 rounded-lg shadow-xl z-30 w-52 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-white transition-all duration-150 ${
                dragPanel === 'segment' ? 'ring-1 ring-[#ff6a1f]/50' : ''
              }`}
              style={{
                transform: `translate(${segmentCustomizerOffset.x}px, ${segmentCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#ff6a1f] uppercase tracking-wider">Segment Settings</span>
                <button
                  onClick={() => setIsSegmentCustomizerMinimized(true)}
                  className="text-[9px] text-[#5f6266] hover:text-[#1a1c1e] transition cursor-pointer font-bold uppercase shrink-0"
                  title="Minimize"
                >
                  Hide
                </button>
              </div>
              
              {/* Split segment to add new intermediate post */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] text-[#5f6266] uppercase tracking-widest leading-none mb-0.5">Node:</span>
                <button
                  onClick={() => {
                    const seg = segments.find(s => s.id === selectedSegmentId);
                    if (seg) handleSegmentClick(seg, 0.5);
                  }}
                  className="w-full text-left bg-[#ece7db] hover:bg-[#e2ddd0] text-[#1a1c1e] text-[10px] px-1.5 py-1 rounded border border-[#cfc8b8] transition flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1"><Plus className="w-2.5 h-2.5 text-[#ff6a1f]" /> Split Center</span>
                  <span className="text-[8px] font-mono text-[#5f6266] uppercase leading-none">Add</span>
                </button>
              </div>

              {/* Toggle Gate inside this specific segment */}
              <div className="flex flex-col gap-1 mt-0.5 border-t border-[#d9d3c5] pt-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-[#1a1c1e] leading-none">Gate Overlay</span>
                  <input
                    type="checkbox"
                    id="segment_gate_check"
                    checked={segments.find(s => s.id === selectedSegmentId)?.hasGate || false}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setSegments(prev => prev.map(s => s.id === selectedSegmentId ? { 
                        ...s, 
                        hasGate: isChecked, 
                        gateType: isChecked ? 'single' : undefined,
                        gateWidthPercent: isChecked ? 25 : undefined,
                        gatePositionPercent: isChecked ? 38 : undefined 
                      } : s));
                    }}
                    className="w-3.5 h-3.5 cursor-pointer text-[#ff6a1f] accent-emerald-500"
                  />
                </div>

                {segments.find(s => s.id === selectedSegmentId)?.hasGate && (
                  <div className="flex flex-col gap-1.5 mt-0.5 pt-1 pb-0.5 bg-[#f3efe6] px-1.5 rounded border border-[#d9d3c5]">
                    {/* Gate Type Selector */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] text-[#5f6266] uppercase tracking-wider mb-0.5">Gate Type:</span>
                      <div className="grid grid-cols-2 gap-1 bg-[#f3efe6] p-0.5 rounded border border-[#d9d3c5]">
                        <button
                          type="button"
                          onClick={() => {
                            setSegments(prev => prev.map(s => s.id === selectedSegmentId ? { ...s, gateType: 'single' } : s));
                          }}
                          className={`py-0.5 rounded text-[8.5px] font-medium transition cursor-pointer text-center ${
                            (segments.find(s => s.id === selectedSegmentId)?.gateType !== 'double')
                              ? 'bg-[#ff6a1f]/40 text-[#ff6a1f] border border-[#ffd4bd]/30'
                              : 'text-[#5f6266] hover:text-[#1a1c1e] border border-transparent'
                          }`}
                        >
                          Single (1.2m)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSegments(prev => prev.map(s => s.id === selectedSegmentId ? { ...s, gateType: 'double' } : s));
                          }}
                          className={`py-0.5 rounded text-[8.5px] font-medium transition cursor-pointer text-center ${
                            (segments.find(s => s.id === selectedSegmentId)?.gateType === 'double')
                              ? 'bg-[#ff6a1f]/40 text-[#ff6a1f] border border-[#ffd4bd]/30'
                              : 'text-[#5f6266] hover:text-[#1a1c1e] border border-transparent'
                          }`}
                        >
                          Double (4.0m)
                        </button>
                      </div>
                    </div>

                    {/* Gate Width Display */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center text-[8px] text-[#5f6266] leading-none">
                        <span>Width:</span>
                        <span className="font-mono text-[#ff6a1f] text-[9px] font-bold">
                          {segments.find(s => s.id === selectedSegmentId)?.gateType === 'double' ? '4.0m' : '1.2m'} (Locked)
                        </span>
                      </div>
                    </div>

                    {/* Gate Positioning along segment line */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center text-[8px] text-[#5f6266] leading-none">
                        <span>Pos:</span>
                        <span className="font-mono text-[#1a1c1e] text-[9px] font-bold">{(segments.find(s => s.id === selectedSegmentId)?.gatePositionPercent || 40)}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="65"
                        value={segments.find(s => s.id === selectedSegmentId)?.gatePositionPercent || 40}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setSegments(prev => prev.map(s => s.id === selectedSegmentId ? { ...s, gatePositionPercent: val } : s));
                        }}
                        className="w-full h-0.5 accent-teal-500 bg-[#e2ddd0] rounded cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 mt-1.5 border-t border-[#d9d3c5] pt-1.5">
                <button
                  onClick={() => setSelectedSegmentId(null)}
                  className="bg-[#ece7db] hover:bg-[#e2ddd0] text-[#1a1c1e] rounded py-1 text-center text-[10px] uppercase font-bold cursor-pointer transition border border-[#d9d3c5]"
                >
                  Deselect
                </button>
                <button
                  onClick={() => deleteSelectedSegment()}
                  className="bg-[#fff1e9]/60 hover:bg-[#ffe3d3] border border-[#ffd4bd]/40 text-[#ff6a1f] rounded py-1 px-1.5 text-center text-[10px] uppercase font-bold cursor-pointer transition flex items-center justify-center gap-1"
                  title="Delete this fence panel"
                >
                  <Trash2 className="w-3 h-3 shrink-0" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )
        )}

        {/* Standalone Gate Floating Settings Panel */}
        {selectedSegmentId && segments.find(s => s.id === selectedSegmentId)?.isStandaloneGate && (
          <div
            onPointerDown={(e) => handlePanelDragStart(e, 'segment')}
            onPointerMove={(e) => handlePanelDragMove(e, 'segment')}
            onPointerUp={(e) => handlePanelDragEnd(e, 'segment')}
            className={`absolute top-4 right-4 bg-white/95 border border-[#ff6a1f]/20 px-2.5 py-2.5 rounded-lg shadow-xl z-30 w-48 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-white transition-all duration-150 ${
              dragPanel === 'segment' ? 'ring-1 ring-[#ff6a1f]/50' : ''
            }`}
            style={{
              transform: `translate(${segmentCustomizerOffset.x}px, ${segmentCustomizerOffset.y}px)`,
              touchAction: 'none'
            }}
          >
            <div className="flex items-center justify-between font-sans">
              <span className="text-[10px] font-bold text-[#ff6a1f] uppercase tracking-wider">Gate Settings</span>
            </div>
            <div className="text-[10px] text-[#3c4045] flex flex-col gap-1 leading-normal">
              <div>
                Type: <b className="text-[#1a1c1e]">{segments.find(s => s.id === selectedSegmentId)?.gateType === 'double' ? 'Double Gate' : 'Single Gate'}</b>
              </div>
              <div>
                Width: <b className="text-[#1a1c1e]">{segments.find(s => s.id === selectedSegmentId)?.gateType === 'double' ? '4.0m' : '1.2m'}</b>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5 border-t border-[#d9d3c5] pt-1.5">
              <button
                onClick={() => setSelectedSegmentId(null)}
                className="bg-[#ece7db] hover:bg-[#e2ddd0] text-[#1a1c1e] rounded py-1 text-center text-[10px] uppercase font-bold cursor-pointer transition border border-[#d9d3c5]"
              >
                Deselect
              </button>
              <button
                onClick={() => deleteSelectedSegment()}
                className="bg-[#fff1e9]/60 hover:bg-[#ffe3d3] border border-[#ffd4bd]/40 text-[#ff6a1f] rounded py-1 px-1.5 text-center text-[10px] uppercase font-bold cursor-pointer transition flex items-center justify-center gap-1"
                title="Remove selected gate"
              >
                <Trash2 className="w-3 h-3 shrink-0" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}

        {/* Tip banner for first load - dismissible */}
        {showTipBanner && (
          <div className="absolute top-4 left-4 bg-[#1a1c1e]/60 backdrop-blur-md px-3.5 py-2.5 rounded-xl text-[#5f6266] text-xs border border-[#d9d3c5] max-w-sm z-30 shadow-2xl flex gap-2.5 items-start">
            <Info className="w-4.5 h-4.5 text-[#ff6a1f] shrink-0 mt-0.5 animate-bounce" />
            <div className="flex-1">
              <p className="font-sans leading-relaxed">
                Drag the <b className="text-[#1a1c1e]">circular handles</b> to drape the fence perfectly along the garden path. Switch to <b className="text-[#ff6a1f]">Pan Tool</b> to drag the camera view or zoom!
              </p>
            </div>
            <button
              onClick={dismissTipBanner}
              className="text-[#5f6266] hover:text-[#1a1c1e] transition font-mono text-[9px] uppercase font-bold pl-1.5 cursor-pointer"
              title="Dismiss instruction"
            >
              [X]
            </button>
          </div>
        )}

        <SatelliteModal
          isOpen={showSatelliteModal}
          onClose={() => setShowSatelliteModal(false)}
          onSelectDistance={(meters) => {
            if (setPropertyFrontage) {
              setPropertyFrontage(meters);
            }
          }}
        />

      </div>

    </div>
  );
}
