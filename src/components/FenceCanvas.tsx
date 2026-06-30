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
  Paintbrush,
  Undo,
  Download,
  X
} from 'lucide-react';

interface FenceCanvasProps {
  material: FenceMaterial;
  railCount?: 2 | 3;
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
  slatProfile = '65'
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

  // States for Foreground Mask Brush
  const [isBrushMode, setIsBrushMode] = useState<boolean>(false);
  const [brushSize, setBrushSize] = useState<number>(3.5); // default visual brush stroke width
  const [isBrushEraser, setIsBrushEraser] = useState<boolean>(false); // false = paint mask (hide fence / show foreground), true = erase mask (restore fence)
  const [maskStrokes, setMaskStrokes] = useState<{
    id: string;
    points: { x: number; y: number }[];
    radius: number;
    isEraser: boolean;
  }[]>([]);
  const [isPainting, setIsPainting] = useState<boolean>(false);
  const [activeStrokeId, setActiveStrokeId] = useState<string | null>(null);
  const activeMaskPathRef = useRef<SVGPathElement | null>(null);
  const activeHudPathRef = useRef<SVGPathElement | null>(null);
  const currentStrokePointsRef = useRef<{ x: number; y: number }[]>([]);

  // Helper to construct a smooth SVG path from stroke coordinates
  const getStrokeSvgPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  };

  // Perspective scaling mathematical model
  const getPerspectiveScale = (yPct: number) => {
    const baselineY = 75; // Standard camera baseline
    const slope = 0.0125; // 1.25% change in scale for every percent of depth
    const scale = 1.0 + (yPct - baselineY) * slope;
    return Math.min(Math.max(scale, 0.45), 2.5);
  };

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
    if (isBrushMode) {
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      const coords = getPercentageCoords(e.clientX, e.clientY);
      
      currentStrokePointsRef.current = [coords];
      setIsPainting(true);

      const dStr = getStrokeSvgPath([coords]);
      
      if (activeMaskPathRef.current) {
        activeMaskPathRef.current.setAttribute('stroke', isBrushEraser ? '#ffffff' : '#000000');
        activeMaskPathRef.current.setAttribute('stroke-width', brushSize.toString());
        activeMaskPathRef.current.setAttribute('d', dStr);
        activeMaskPathRef.current.style.display = 'block';
      }
      if (activeHudPathRef.current) {
        activeHudPathRef.current.setAttribute('stroke', isBrushEraser ? 'rgba(239, 68, 68, 0.45)' : 'rgba(20, 184, 166, 0.35)');
        activeHudPathRef.current.setAttribute('stroke-width', brushSize.toString());
        activeHudPathRef.current.setAttribute('d', dStr);
        activeHudPathRef.current.style.display = 'block';
      }
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
    if (isBrushMode) {
      handlePointerDownBackground(e);
      return;
    }
    e.stopPropagation();
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
    if (isBrushMode) {
      handlePointerDownBackground(e);
      return;
    }
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
    if (isBrushMode) {
      handlePointerDownBackground(e);
      return;
    }
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
    if (isBrushMode && isPainting) {
      const coords = getPercentageCoords(e.clientX, e.clientY);
      currentStrokePointsRef.current.push(coords);
      const dStr = getStrokeSvgPath(currentStrokePointsRef.current);
      if (activeMaskPathRef.current) {
        activeMaskPathRef.current.setAttribute('d', dStr);
      }
      if (activeHudPathRef.current) {
        activeHudPathRef.current.setAttribute('d', dStr);
      }
      return;
    }

    if (activeDragId) {
      const coords = getPercentageCoords(e.clientX, e.clientY);
      let targetX = coords.x - globalOffset.x;
      let targetY = coords.y - globalOffset.y;

      if (showHelperGrid) {
        targetX = snapToGrid(targetX);
        targetY = snapToGrid(targetY);
      }

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
    if (isBrushMode && isPainting) {
      setIsPainting(false);
      
      if (activeMaskPathRef.current) {
        activeMaskPathRef.current.style.display = 'none';
        activeMaskPathRef.current.setAttribute('d', '');
      }
      if (activeHudPathRef.current) {
        activeHudPathRef.current.style.display = 'none';
        activeHudPathRef.current.setAttribute('d', '');
      }

      if (currentStrokePointsRef.current.length > 0) {
        const newStroke = {
          id: `stroke_${Date.now()}`,
          points: [...currentStrokePointsRef.current],
          radius: brushSize,
          isEraser: isBrushEraser
        };
        setMaskStrokes(prev => [...prev, newStroke]);
      }

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      return;
    }

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

  // Split a segment to add an intermediate post / node
  const handleSegmentClick = (segment: Segment, percent: number) => {
    pushHistory(); // Capture snapshot of layout before splitting
    // Percent along segment: locate start and end posts
    const startPost = posts.find(p => p.id === segment.startPostId);
    const endPost = posts.find(p => p.id === segment.endPostId);
    if (!startPost || !endPost) return;

    // Calc split coord
    const px = startPost.x + (endPost.x - startPost.x) * percent;
    const py = startPost.y + (endPost.y - startPost.y) * percent;
    const newPostId = `post_${Date.now()}`;

    const newPost: Post = {
      id: newPostId,
      x: px,
      y: py,
      type: 'standard'
    };

    const nextPostId = segment.endPostId;

    // Add new post
    setPosts(prev => [...prev, newPost]);

    // Split segment into two
    setSegments(prev => {
      const filtered = prev.filter(s => s.id !== segment.id);
      return [
        ...filtered,
        {
          id: `seg_${Date.now()}_1`,
          startPostId: segment.startPostId,
          endPostId: newPostId,
          hasGate: false
        },
        {
          id: `seg_${Date.now()}_2`,
          startPostId: newPostId,
          endPostId: nextPostId,
          hasGate: false
        }
      ];
    });

    setSelectedPostId(newPostId);
    setSelectedSegmentId(null);
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
      // Connect neighbors across the gap
      const startPostId = segmentsToRem[0].startPostId === selectedPostId ? segmentsToRem[0].endPostId : segmentsToRem[0].startPostId;
      const endPostId = segmentsToRem[1].startPostId === selectedPostId ? segmentsToRem[1].endPostId : segmentsToRem[1].startPostId;
      
      setSegments(prev => [
        ...prev.filter(s => s.startPostId !== selectedPostId && s.endPostId !== selectedPostId),
        {
          id: `seg_${Date.now()}`,
          startPostId,
          endPostId,
          hasGate: false
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
    const basePct = (height / 1800) * 11; // 1800mm is ~11% of the image height visually
    return basePct * fenceScale;
  };

  return (
    <div className="flex flex-col h-full bg-[#18191c] rounded-2xl border border-[#2f3136] overflow-hidden">
      
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 bg-[#1f2125] border-b border-[#2f3136] gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4.5 h-4.5 text-zinc-400" />
          <h3 className="text-sm font-semibold text-white font-sans">Interactive Design Studio</h3>
          <span className="text-[11px] font-mono bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded-full">
            Full Transparency Enabled
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Hand pan mode tool */}
          <button
            onClick={() => setPanMode(!panMode)}
            title={panMode ? "Switch to Draw and Drag state" : "Enable camera swipe and pan"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              panMode ? 'bg-[#14b8a6] text-zinc-950 font-bold border border-teal-300/30' : 'bg-[#2b2d31] text-zinc-400 hover:text-white'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span>{panMode ? "Panning Mode" : "Pan Tool"}</span>
          </button>

          {/* Simulated Full Screen button */}
          {setIsFullScreen && (
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? "Exit Full Screen" : "Fill screen with yard template"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                isFullScreen ? 'bg-amber-500 text-zinc-950 font-bold' : 'bg-zinc-800 text-teal-400 hover:bg-zinc-700'
              }`}
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5 animate-pulse" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isFullScreen ? "Exit Fullscreen" : "Full Screen"}</span>
            </button>
          )}

          {/* Helper Grid */}
          <button
            onClick={() => setShowHelperGrid(!showHelperGrid)}
            title="Toggle assistance alignment points"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              showHelperGrid ? 'bg-zinc-800 text-teal-400 border border-teal-500/20' : 'bg-[#2a2c31] text-zinc-400'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Alignment Points</span>
          </button>

          {/* Satellite Map Measure Tool */}
          <button
            onClick={() => setShowSatelliteModal(true)}
            title="Measure real-world lot boundary using satellite photography"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition border border-rose-900/30 hover:border-rose-800 text-rose-400 hover:text-rose-300 bg-rose-950/10 hover:bg-rose-950/20 font-sans shadow"
          >
            <span>🛰️ Map Measure</span>
          </button>

          {/* Foreground Layering Brush Tool */}
          <button
            onClick={() => {
              setIsBrushMode(!isBrushMode);
              // Deselect other things to prevent distracting helper highlights
              setSelectedPostId(null);
              setSelectedSegmentId(null);
              setPanMode(false); // turn off pan mode if active
            }}
            title="Paint over foreground elements (like mailboxes, trees, or pillars) in the photo to bring them in front of the fence."
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 ${
              isBrushMode 
                ? 'bg-teal-500 text-zinc-950 font-bold border border-teal-300 shadow-md' 
                : 'bg-zinc-800 text-teal-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>Layering Brush</span>
          </button>

          {/* Undo Action */}
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            title={history.length === 0 ? "No actions to undo" : `Undo last change (Step ${history.length})`}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer select-none ${
              history.length > 0 
                ? 'bg-[#2b2d31] text-teal-400 hover:text-white border border-teal-500/20' 
                : 'bg-[#1e1f22] text-zinc-650 cursor-not-allowed border border-transparent'
            }`}
          >
            <Undo className="w-3.5 h-3.5" />
            <span>Undo ({history.length})</span>
          </button>

          {/* Directional Add Post Actions */}
          <div className="flex items-center bg-[#2b2d31] rounded-lg p-0.5 border border-zinc-700/40">
            <button
              onClick={() => addPostDirect('left')}
              title="Add post extending straight on the LEFT side of the fence"
              className="flex items-center gap-1 hover:bg-zinc-800 text-white px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-500 font-bold" />
              <span>Add Left</span>
            </button>
            <div className="w-[1px] h-4 bg-zinc-750" />
            <button
              onClick={() => addPostDirect('right')}
              title="Add post extending straight on the RIGHT side of the fence"
              className="flex items-center gap-1 hover:bg-zinc-800 text-white px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400 font-bold" />
              <span>Add Right</span>
            </button>
          </div>

          {/* Download/Export Design Button */}
          <button
            onClick={handleExportDesign}
            title="Export full visual layout design copy to image/specification sheet"
            className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-md select-none"
          >
            <Download className="w-3.5 h-3.5 text-amber-100" />
            <span>Export Design</span>
          </button>

          {selectedPostId && (
            <button
              onClick={deleteSelectedPost}
              disabled={posts.length <= 2}
              className="flex items-center gap-1 bg-[#251515] hover:bg-[#3d1a1a] text-red-300 border border-red-900/30 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:brightness-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Selected Post</span>
            </button>
          )}

          {selectedSegmentId && segments.find(s => s.id === selectedSegmentId)?.isStandaloneGate && (
            <button
              onClick={deleteSelectedSegment}
              className="flex items-center gap-1 bg-[#251515] hover:bg-[#3d1a1a] text-red-300 border border-red-900/30 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
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
            className="bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Upload Photo
          </button>
          
          {backgroundUrl && (
            <button
              onClick={handleResetDesign}
              title="Clear only drawn fences, posts, and nodes"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-2.5 py-1.5 rounded-lg transition border border-zinc-700 cursor-pointer"
            >
              Reset Design
            </button>
          )}
          
          {backgroundUrl && (
            <button
              onClick={handleClearCanvas}
              title="Clear entire canvas (remove background image and fence design)"
              className="flex items-center gap-1 bg-[#251515] hover:bg-[#3d1a1a] text-red-305 border border-red-900/30 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-red-400" />
              <span>Clear Canvas</span>
            </button>
          )}
        </div>
      </div>

      {/* Main visualizer container canvas */}
      <div className="relative flex-1 bg-[#101113] overflow-hidden select-none" ref={containerRef}>
        
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
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl m-4 select-none transition-colors duration-200 bg-zinc-950/40 border-zinc-700 text-zinc-100 shadow-2xl">
                <div className="max-w-md text-center flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border transition-colors bg-rose-500/10 border-rose-500/20 text-rose-500">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-black mb-2 leading-tight uppercase tracking-wider text-white">
                    Initialize Property Backdrop
                  </h3>
                  <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
                    Upload a high-resolution snapshot of your property boundary to position posts and trace custom framing lines.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-md">
                    <button 
                      onClick={triggerFileUpload}
                      className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 px-3 rounded-lg text-xs uppercase tracking-wider transition cursor-pointer shadow"
                    >
                      Upload Photo
                    </button>
                    <button 
                      type="button"
                      onClick={loadDefaultImage}
                      className="flex-1 font-bold py-2.5 px-3 rounded-lg text-xs uppercase tracking-wider transition border cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700"
                    >
                      Use Demo Yard
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowSatelliteModal(true)}
                      className="flex-1 font-bold py-2.5 px-3 rounded-lg text-xs uppercase tracking-wider transition border cursor-pointer bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-450 hover:text-emerald-400 border-emerald-900/40 flex items-center justify-center gap-1.5 shadow"
                    >
                      <span>🛰️ Map Measure</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* Grid helper overlay */}
          {showHelperGrid && (
            <div className="absolute inset-0 border border-teal-500/10 pointer-events-none grid grid-cols-6 grid-rows-6">
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

              {/* Foreground auto-layering mask to dynamically hide parts of the fence behind mailboxes, trees, or pillars */}
              <mask id="fence-foreground-mask">
                {/* Default to white so the entire fence is visible */}
                <rect x="-100" y="-100" width="300" height="300" fill="#ffffff" />
                
                {/* Paint/Erase strokes on the mask */}
                {maskStrokes.map((stroke) => (
                  <path
                    key={stroke.id}
                    d={getStrokeSvgPath(stroke.points)}
                    fill="none"
                    stroke={stroke.isEraser ? "#ffffff" : "#000000"}
                    strokeWidth={stroke.radius}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}

                {/* Direct DOM active stroke representation during drag */}
                <path
                  ref={activeMaskPathRef}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ display: 'none' }}
                />
              </mask>
            </defs>

            {/* DRAG-AND-DROP DISPLACEMENT LAYER (Translates whole fence globally with the layering mask applied) */}
            <g transform={`translate(${globalOffset.x}, ${globalOffset.y})`} mask="url(#fence-foreground-mask)">
              
              {/* 1. SECTIONS / FENCE PANELS IN-FILLS LAYER */}
              {segments.map((seg, sIdx) => {
                const pStart = posts.find(p => p.id === seg.startPostId);
                const pEnd = posts.find(p => p.id === seg.endPostId);
                if (!pStart || !pEnd) return null;
                if (seg.isStandaloneGate) return null;

                const isSelected = selectedSegmentId === seg.id;

                const segmentWidth = pEnd.x - pStart.x;
                const segmentHeight = pEnd.y - pStart.y;
                const segmentLength = Math.sqrt(segmentWidth ** 2 + segmentHeight ** 2);

                // Structural line post count for this segment — pre-allocated so the total across
                // all segments exactly matches the billed intermediatePostCount in estimateFencingCosts
                const intermediateCount = intermediatePostCounts.get(seg.id) || 0;
                const spanCount = intermediateCount + 1;

                // Perspective scaling factors for the start and end posts
                const scaleStart = getPerspectiveScale(pStart.y);
                const scaleEnd = getPerspectiveScale(pEnd.y);

                const vhStart = getVisualFenceHeight() * scaleStart;
                const vhEnd = getVisualFenceHeight() * scaleEnd;

                // Rendering materials procedurally inside SVG
                if (material === 'slat_fencing') {
                  // DRAW HORIZONTAL SLATS (Modern colorbond or metal slat layout)
                  const isChunky = slatProfile === '90';
                  const slatHeight = isChunky ? 0.85 : 0.55;
                  const slatGap = isChunky ? 0.15 : 0.18;
                  const slatRatio = isChunky ? 0.85 : 0.80;
                  // Base slat total calculated off structural fence height
                  const baseVh = getVisualFenceHeight();
                  const slatTotal = Math.max(Math.floor(baseVh / (slatHeight + slatGap)), 6);

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
                      {spanCount > 1 && Array.from({ length: spanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / spanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;

                        // Skip drawing intermediate pillar if it drops exactly within a gate span
                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }

                        const scale = getPerspectiveScale(py);
                        const vh = getVisualFenceHeight() * scale;

                        let postWidth = 0.5 * scale;
                        let postColorHex = postColor.hex;
                        let capHeight = 0.22 * scale;

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

                            {/* Cap */}
                            <path
                              d={`
                                M ${px - postWidth/2 - 0.06} ${py - vh}
                                L ${px - postWidth/2 - 0.06} ${py - vh - capHeight}
                                L ${px + postWidth/2 + 0.06} ${py - vh - capHeight}
                                L ${px + postWidth/2 + 0.06} ${py - vh}
                                Z
                              `}
                              fill={postColorHex}
                              stroke="#000"
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
                  const rails = railCount === 2 ? [0.35, 0.78] : [0.22, 0.52, 0.82];
                  const railThickness = 0.58; // thick structural rail
                  const woodColorHex = '#C19A6B'; // Raw natural timber warm hue

                  return (
                    <g key={seg.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => handlePointerDownSegment(e, seg.id)}>
                      
                      {/* Back wire mesh backing details for authentic rural/client look */}
                      <polygon
                        points={`
                          ${pStart.x},${pStart.y}
                          ${pEnd.x},${pEnd.y}
                          ${pEnd.x},${pEnd.y - vhEnd}
                          ${pStart.x},${pStart.y - vhStart}
                        `}
                        fill="url(#black-chainwire-pattern)"
                        stroke="none"
                        opacity="0.85"
                      />

                      {/* Horizontal stout timber rails */}
                      {rails.map((heightPct, rIdx) => {
                        const offsetStart = vhStart * heightPct;
                        const offsetEnd = vhEnd * heightPct;
                        const railThickStart = railThickness * scaleStart;
                        const railThickEnd = railThickness * scaleEnd;

                        const x1 = pStart.x;
                        const y1 = pStart.y - offsetStart;
                        const x2 = pEnd.x;
                        const y2 = pEnd.y - offsetEnd;

                        // Support skipping rail parts for gates
                        if (seg.hasGate) {
                          const { startPct: pt1, endPct: pt2 } = getGateSpanPcts(seg, segmentLength);

                          const gX1_val = x1 + pt1 * segmentWidth;
                          const gY1_val = y1 + pt1 * segmentHeight;
                          const gX2_val = x1 + pt2 * segmentWidth;
                          const gY2_val = y1 + pt2 * segmentHeight;

                          const gTopY1_y = gStopYPercent(gY1_val, railThickStart, pt1, railThickEnd - railThickStart);
                          const gTopY2_y = gStopYPercent(gY2_val, railThickStart, pt2, railThickEnd - railThickStart);

                          function gStopYPercent(iy: number, baseThick: number, p: number, dThick: number) {
                            return iy - (baseThick + p * dThick);
                          }

                          return (
                            <g key={rIdx}>
                              {/* Left of gate rail part */}
                              <path
                                d={`
                                  M ${x1} ${y1} 
                                  L ${gX1_val} ${gY1_val} 
                                  L ${gX1_val} ${gTopY1_y} 
                                  L ${x1} ${y1 - railThickStart} 
                                  Z
                                `}
                                fill={woodColorHex}
                                stroke="#4a3116"
                                strokeWidth="0.08"
                              />
                              {/* Timber textures */}
                              <path
                                d={`M ${x1} ${y1 - 0.05} L ${gX1_val} ${gY1_val - 0.05}`}
                                fill="none"
                                stroke="url(#timber-grain)"
                                strokeWidth={railThickStart}
                                opacity="0.45"
                              />
                              {/* Right of gate rail part */}
                              <path
                                d={`
                                  M ${gX2_val} ${gY2_val} 
                                  L ${x2} ${y2} 
                                  L ${x2} ${y2 - railThickEnd} 
                                  L ${gX2_val} ${gTopY2_y} 
                                  Z
                                `}
                                fill={woodColorHex}
                                stroke="#4a3116"
                                strokeWidth="0.08"
                              />
                              <path
                                d={`M ${gX2_val} ${gY2_val - 0.05} L ${x2} ${y2 - 0.05}`}
                                fill="none"
                                stroke="url(#timber-grain)"
                                strokeWidth={railThickEnd}
                                opacity="0.45"
                              />
                            </g>
                          );
                        }

                        return (
                          <g key={rIdx}>
                            <path
                              d={`
                                M ${x1} ${y1} 
                                L ${x2} ${y2} 
                                L ${x2} ${y2 - railThickEnd} 
                                L ${x1} ${y1 - railThickStart} 
                                Z
                              `}
                              fill={woodColorHex}
                              stroke="#4a3116"
                              strokeWidth="0.08"
                            />
                            {/* Accent grain overlay texture */}
                            <path
                              d={`M ${x1} ${y1 - 0.05} L ${x2} ${y2 - 0.05}`}
                              fill="none"
                              stroke="url(#timber-grain)"
                              strokeWidth={railThickStart + 0.5 * (railThickEnd - railThickStart)}
                              opacity="0.45"
                            />
                          </g>
                        );
                      })}

                      {/* Mandatory structural line posts (2.4m max span) — billed in the quote, not decorative */}
                      {spanCount > 1 && Array.from({ length: spanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / spanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;

                        // Skip drawing intermediate pillar if it drops exactly within a gate span
                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }

                        const scale = getPerspectiveScale(py);
                        const vh = getVisualFenceHeight() * scale;

                        const postWidth = 1.1 * scale; // stout representation of 80mm post
                        const postColorHex = '#C19A6B'; // raw timber warm look

                        return (
                          <g key={`mid-post-wood-${j}`} className="pointer-events-none">
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

                            {/* Cap beveling */}
                            <path
                              d={`
                                M ${px - postWidth/2 - 0.04} ${py - vh}
                                L ${px} ${py - vh - 0.15 * scale}
                                L ${px + postWidth/2 + 0.04} ${py - vh}
                                Z
                              `}
                              fill="#7A5A35"
                              stroke="#4a3116"
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
                      {spanCount > 1 && Array.from({ length: spanCount - 1 }).map((_, jIndex) => {
                        const j = jIndex + 1;
                        const t = j / spanCount;
                        const px = pStart.x + t * segmentWidth;
                        const py = pStart.y + t * segmentHeight;

                        if (seg.hasGate) {
                          const { startPct, endPct } = getGateSpanPcts(seg, segmentLength);
                          if (t >= startPct && t <= endPct) return null;
                        }

                        const scale = getPerspectiveScale(py);
                        const vh = getVisualFenceHeight() * scale;
                        const postWidth = 0.55 * scale;
                        const capHeight = 0.24 * scale;

                        return (
                          <g key={`blade-post-${j}`} className="pointer-events-none">
                            <ellipse cx={px} cy={py + 0.2} rx={postWidth * 0.85} ry="0.16" fill="#000" opacity="0.28" />
                            <path
                              d={`M ${px - postWidth/2} ${py + 0.3} L ${px - postWidth/2} ${py - vh} L ${px + postWidth/2} ${py - vh} L ${px + postWidth/2} ${py + 0.3} Z`}
                              fill={postColor.hex}
                              stroke="#00000088"
                              strokeWidth="0.04"
                            />
                            <path
                              d={`M ${px - postWidth/2 - 0.06} ${py - vh} L ${px - postWidth/2 - 0.06} ${py - vh - capHeight} L ${px + postWidth/2 + 0.06} ${py - vh - capHeight} L ${px + postWidth/2 + 0.06} ${py - vh} Z`}
                              fill={postColor.hex}
                              stroke="#000"
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
                }
                return null;
              })}

              {/* 2. GATES OVERLAY LAYER (Placed precisely on top of linked fence sections) */}
              {segments.map((seg) => {
                if (!seg.hasGate) return null;
                const pStart = posts.find(p => p.id === seg.startPostId);
                const pEnd = posts.find(p => p.id === seg.endPostId);
                if (!pStart || !pEnd) return null;

                const isSelected = selectedSegmentId === seg.id;

                // Perspective scales for gate corners
                const segmentWidth = pEnd.x - pStart.x;
                const segmentHeight = pEnd.y - pStart.y;
                const segmentLength = Math.sqrt(segmentWidth ** 2 + segmentHeight ** 2) || 1;

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
              })}

              {/* 3. STRUCTURAL VERTICAL POSTS & ANCHOR PILLARS WITH PERSPECTIVE */}
              {posts.map((post, pIdx) => {
                const isSelected = selectedPostId === post.id;

                // Perspective values
                const scale = getPerspectiveScale(post.y);
                const vh = getVisualFenceHeight() * scale;

                // Determine post thickness & details based on selection type
                let postWidth = 0.5 * scale; // standard 50mm * perspective
                let postColorHex = postColor.hex;
                let strokeWidth = 0.05;
                let capHeight = 0.22 * scale;

                if (material === 'post_and_rail') {
                  // Stout representation representing the sturdy 80mm post request
                  postWidth = 1.1 * scale; 
                  postColorHex = '#C19A6B'; // Raw natural wood finish
                  capHeight = 0.04 * scale;
                } else if (post.type === 'corner') {
                  postWidth = 0.85 * scale; // Heavier 80-100mm corner post
                } else if (post.type === 'H-post') {
                  postWidth = 0.95 * scale; // Distinct slide gate column
                } else if (post.type === 'decorative') {
                  postWidth = 1.35 * scale; // Sandstone/concrete pillar
                  postColorHex = '#d1c7bd'; // Cream sandstone visual
                  capHeight = 0.45 * scale;
                } else if (post.type === 'gate') {
                  postWidth = 0.8 * scale;
                }

                // Visual bounds
                const x = post.x;
                const y = post.y;

                return (
                  <g key={post.id} className="pointer-events-none">
                    
                    {/* Post ground shadow anchor */}
                    <ellipse cx={x} cy={y + 0.2} rx={postWidth * 0.9} ry="0.18" fill="#000" opacity="0.32" />

                    {/* Main vertical post column */}
                    <path
                      d={`
                        M ${x - postWidth/2} ${y + 0.3} 
                        L ${x - postWidth/2} ${y - vh} 
                        L ${x + postWidth/2} ${y - vh} 
                        L ${x + postWidth/2} ${y + 0.3} 
                        Z
                      `}
                      fill={postColorHex}
                      stroke="#000000"
                      strokeWidth={strokeWidth}
                    />

                    {/* Accent wood texture for post and rail posts */}
                    {material === 'post_and_rail' && (
                      <path
                        d={`M ${x} ${y + 0.3} L ${x} ${y - vh}`}
                        fill="none"
                        stroke="url(#timber-grain)"
                        strokeWidth={postWidth * 0.8}
                        opacity="0.35"
                      />
                    )}

                    {/* High gloss visual depth highlight */}
                    {material !== 'post_and_rail' && (
                      <line
                        x1={x - postWidth/3}
                        y1={y + 0.2}
                        x2={x - postWidth/3}
                        y2={y - vh}
                        stroke="#ffffff"
                        strokeWidth={postWidth * 0.16}
                        opacity={post.type === 'decorative' ? 0.1 : 0.28}
                      />
                    )}

                    {/* Highlight capping ornament / metal bracket on top */}
                    {material === 'post_and_rail' ? (
                      // Authentic raw beveled flat top wood finish
                      <path
                        d={`
                          M ${x - postWidth/2 - 0.04} ${y - vh}
                          L ${x} ${y - vh - 0.15 * scale}
                          L ${x + postWidth/2 + 0.04} ${y - vh}
                          Z
                        `}
                        fill="#7A5A35"
                        stroke="#4a3116"
                        strokeWidth="0.04"
                      />
                    ) : (
                      <path
                        d={`
                          M ${x - postWidth/2 - 0.06} ${y - vh}
                          L ${x - postWidth/2 - 0.06} ${y - vh - capHeight}
                          L ${x + postWidth/2 + 0.06} ${y - vh - capHeight}
                          L ${x + postWidth/2 + 0.06} ${y - vh}
                          Z
                        `}
                        fill={postColorHex}
                        stroke="#000"
                        strokeWidth="0.04"
                      />
                    )}

                    {/* Decorative cap peak ornament */}
                    {post.type === 'decorative' && material !== 'post_and_rail' && (
                      <polygon
                        points={`
                          ${x - postWidth/2 - 0.06},${y - vh - capHeight}
                          ${x + postWidth/2 + 0.06},${y - vh - capHeight}
                          ${x},${y - vh - capHeight - 0.25 * scale}
                        `}
                        fill="#b0a59a"
                        stroke="#000"
                        strokeWidth="0.04"
                      />
                    )}

                    {/* Selected state overlay halo */}
                    {isSelected && (
                      <rect
                        x={x - postWidth/2 - 0.4}
                        y={y - vh - capHeight - 0.4}
                        width={postWidth + 0.8}
                        height={vh + capHeight + 1.1}
                        fill="none"
                        stroke="#14b8a6"
                        strokeWidth="0.25"
                        strokeDasharray="0.8 0.8"
                      />
                    )}
                  </g>
                );
              })}

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
                      ? 'bg-teal-500 border border-white ring-2 ring-teal-300 scale-110 shadow-lg' 
                      : activeDragId === post.id 
                        ? 'bg-emerald-400 scale-125 shadow-lg border border-white'
                        : 'bg-zinc-800 border bg-zinc-900 border-white/60 hover:bg-zinc-700 hover:scale-115'
                  }`}
                  style={{
                    width: `${handleSize}px`,
                    height: `${handleSize}px`
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-slate-950/60" />
                </div>
                
                {/* Floating Tooltip Label */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-zinc-950 text-white text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-sans flex items-center gap-1 shadow-md">
                  <span className="font-semibold text-teal-300 uppercase">{post.type} post</span>
                  <span className="text-zinc-400 font-mono">({Math.round(post.x)}%, {Math.round(post.y)}%)</span>
                </div>
              </div>
            );
          })}

          {/* Semi-transparent Mask Overlay for visual help while painting */}
          {isBrushMode && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
              {maskStrokes.map(stroke => (
                <path
                  key={stroke.id}
                  d={getStrokeSvgPath(stroke.points)}
                  fill="none"
                  stroke={stroke.isEraser ? "rgba(239, 68, 68, 0.45)" : "rgba(20, 184, 166, 0.35)"}
                  strokeWidth={stroke.radius}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Direct DOM active visual stroke help HUD */}
              <path
                ref={activeHudPathRef}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: 'none' }}
              />
            </svg>
          )}

          </div>
        </div>

        {/* 6. Foreground Masking Brush HUD Panel */}
        {isBrushMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1f2125]/95 border border-teal-500/20 p-4 rounded-xl shadow-2xl flex flex-col gap-3 z-40 select-none w-72 backdrop-blur-md">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
              <Paintbrush className="w-4.5 h-4.5 text-teal-400 shrink-0" />
              <div className="flex-1">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider block">Foreground Masking</span>
                <span className="text-[9px] text-zinc-400 block leading-tight">Paint over mailboxes, bushes, pillars to bring them forward</span>
              </div>
            </div>

            {/* Brush Size selector slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 font-medium">Brush Size</span>
                <span className="font-mono font-bold text-teal-400">{Math.round(brushSize * 4)}px</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="8.0"
                step="0.25"
                value={brushSize}
                onChange={(e) => setBrushSize(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-805 rounded appearance-none cursor-pointer accent-teal-500"
              />
            </div>

            {/* Paint / Erase select buttons */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setIsBrushEraser(false)}
                className={`py-1.5 rounded text-center text-[10px] font-bold cursor-pointer transition ${
                  !isBrushEraser 
                    ? 'bg-teal-950/80 border border-teal-500/40 text-teal-400 font-bold shadow-sm' 
                    : 'bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                ● Brush Mask
              </button>
              <button
                onClick={() => setIsBrushEraser(true)}
                className={`py-1.5 rounded text-center text-[10px] font-bold cursor-pointer transition ${
                  isBrushEraser 
                    ? 'bg-rose-950/80 border border-rose-500/40 text-rose-400 font-bold shadow-sm' 
                    : 'bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                ○ Erase Mask
              </button>
            </div>

            {/* Mask actions row */}
            <div className="flex items-center gap-1.5 border-t border-zinc-800 pt-2 text-[10px]">
              <button
                onClick={() => setMaskStrokes(prev => prev.slice(0, -1))}
                disabled={maskStrokes.length === 0}
                className="flex-1 bg-zinc-850 py-1 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 cursor-pointer text-center font-bold disabled:opacity-30 disabled:pointer-events-none transition"
              >
                Undo
              </button>
              <button
                onClick={() => setMaskStrokes([])}
                disabled={maskStrokes.length === 0}
                className="flex-1 bg-rose-950/20 border border-rose-950/10 py-1 hover:bg-rose-950/40 text-rose-300 rounded cursor-pointer text-center font-bold disabled:opacity-30 disabled:pointer-events-none transition"
              >
                Clear All
              </button>
              <button
                onClick={() => setIsBrushMode(false)}
                className="flex-1 bg-teal-500 hover:bg-teal-400 py-1 text-slate-950 rounded cursor-pointer text-center font-bold tracking-wider uppercase transition text-[9px]"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* 5. CANVAS VIEW NAVIGATOR HUD (Digital Zoom & Pan Controls) */}
        <div
          onPointerDown={(e) => handlePanelDragStart(e, 'viewEngine')}
          onPointerMove={(e) => handlePanelDragMove(e, 'viewEngine')}
          onPointerUp={(e) => handlePanelDragEnd(e, 'viewEngine')}
          className={`absolute bottom-4 right-4 bg-[#1f2125]/95 border border-[#2f3136] px-2.5 py-1.5 rounded-lg shadow-xl flex items-center gap-2 z-30 select-none cursor-grab active:cursor-grabbing ${
            dragPanel === 'viewEngine' ? 'ring-1 ring-teal-500/50' : ''
          }`}
          style={{
            transform: `translate(${viewEngineOffset.x}px, ${viewEngineOffset.y}px)`,
            touchAction: 'none'
          }}
        >
          <div className="flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-teal-400 rotate-12" />
            <span className="text-[10px] font-bold text-zinc-300 font-sans uppercase tracking-wider">HUD</span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-2">
            <button
              onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
              className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 hover:text-white rounded text-[10px] hover:bg-zinc-700 transition cursor-pointer font-bold"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-[10px] font-mono font-bold text-teal-400 bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-900/25">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(3.0, prev + 0.25))}
              className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 hover:text-white rounded text-[10px] hover:bg-zinc-700 transition cursor-pointer font-bold"
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
              className="px-1.5 py-0.5 bg-teal-950/60 hover:bg-teal-900 text-teal-400 rounded text-[9px] transition cursor-pointer font-semibold"
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
            className={`absolute bottom-4 left-4 bg-[#1f2125]/95 hover:bg-zinc-800 border border-[#2f3136] px-2.5 py-1.5 rounded-lg shadow-xl z-30 flex items-center gap-1 text-[10px] font-bold text-teal-400 cursor-grab active:cursor-grabbing select-none`}
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
            className={`absolute bottom-4 left-4 bg-[#1f2125]/95 border border-[#2f3136] px-2.5 py-2 rounded-lg shadow-xl flex flex-col gap-1.5 z-30 select-none max-w-[170px] cursor-grab active:cursor-grabbing ${
              dragPanel === 'reposition' ? 'ring-1 ring-teal-500/50' : ''
            }`}
            style={{
              transform: `translate(${repositionOffset.x}px, ${repositionOffset.y}px)`,
              touchAction: 'none'
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-300">
                <Sliders className="w-3 h-3 text-teal-400" />
                <span>Move Fence</span>
              </div>
              <button
                onClick={() => setIsShiftResizeMinimized(true)}
                className="text-[9px] text-zinc-500 hover:text-teal-400 transition cursor-pointer font-bold shrink-0 uppercase"
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
                className="w-5.5 h-5.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded flex items-center justify-center transition border border-zinc-750 cursor-pointer"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <div />

              <button
                onClick={() => nudgeFenceFile(-1, 0)}
                title="Shift Fence Left"
                className="w-5.5 h-5.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded flex items-center justify-center transition border border-zinc-750 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setGlobalOffset({ x: 0, y: 0 })}
                title="Recenter Fence"
                className="w-5.5 h-5.5 bg-zinc-900 hover:bg-zinc-800 text-teal-400 rounded flex items-center justify-center transition font-mono text-[8px] border border-zinc-800 cursor-pointer uppercase font-bold"
              >
                RST
              </button>
              <button
                onClick={() => nudgeFenceFile(1, 0)}
                title="Shift Fence Right"
                className="w-5.5 h-5.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded flex items-center justify-center transition border border-zinc-750 cursor-pointer"
              >
                <ChevronRight className="w-3 h-3" />
              </button>

              <div />
              <button
                onClick={() => nudgeFenceFile(0, 1)}
                title="Shift Fence Down"
                className="w-5.5 h-5.5 bg-zinc-805 hover:bg-zinc-700 text-white rounded flex items-center justify-center transition border border-zinc-750 cursor-pointer"
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
              className={`absolute top-4 right-4 bg-[#1f2125]/95 border border-teal-500/20 px-2.5 py-1.5 rounded-lg shadow-xl z-30 flex items-center justify-between w-44 text-[10px] text-white cursor-grab active:cursor-grabbing select-none`}
              style={{
                transform: `translate(${postCustomizerOffset.x}px, ${postCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
              title="Expand selected post customizer"
            >
              <span className="font-bold text-teal-400">Post Upgrade</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">[+]</span>
            </button>
          ) : (
            <div
              onPointerDown={(e) => handlePanelDragStart(e, 'post')}
              onPointerMove={(e) => handlePanelDragMove(e, 'post')}
              onPointerUp={(e) => handlePanelDragEnd(e, 'post')}
              className={`absolute top-4 right-4 bg-[#1f2125]/95 border border-teal-500/20 px-2.5 py-2 rounded-lg shadow-xl z-30 w-48 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-[#1f2125] transition-all duration-150 ${
                dragPanel === 'post' ? 'ring-1 ring-teal-500/50' : ''
              }`}
              style={{
                transform: `translate(${postCustomizerOffset.x}px, ${postCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
            >
              <div className="flex items-center justify-between font-sans">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Post Upgrade</span>
                <button
                  onClick={() => setIsPostCustomizerMinimized(true)}
                  className="text-[9px] text-zinc-500 hover:text-teal-400 transition cursor-pointer font-bold uppercase shrink-0"
                  title="Minimize"
                >
                  Hide
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] text-zinc-400 uppercase tracking-widest leading-none mb-0.5">Style:</label>
                <select
                  value={posts.find(p => p.id === selectedPostId)?.type || 'standard'}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setPosts(prev => prev.map(p => p.id === selectedPostId ? { ...p, type: val } : p));
                  }}
                  className="w-full text-[10px] font-medium bg-zinc-800 text-white rounded px-1.5 py-0.5 border border-zinc-700 focus:outline-none focus:border-teal-500"
                >
                  <option value="standard">Standard (50mm)</option>
                  <option value="corner">Heavy Corner (100mm)</option>
                  <option value="gate">Gate Post (80mm)</option>
                  <option value="H-post">H-Post guide</option>
                  <option value="decorative">Sandstone Pillar</option>
                </select>
              </div>

              {/* Micro Nudges inside popup */}
              <div className="flex flex-col gap-1 mt-0.5 border-t border-zinc-800 pt-1">
                <span className="text-[8px] text-zinc-555 text-center uppercase tracking-wider font-bold">Nudge Node</span>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => nudgePost(0, -0.25)} className="px-1 py-0.5 bg-zinc-800 text-white rounded text-[9px] hover:bg-zinc-750 cursor-pointer uppercase">▲ Up</button>
                  <button onClick={() => nudgePost(0, 0.25)} className="px-1 py-0.5 bg-zinc-800 text-white rounded text-[9px] hover:bg-zinc-750 cursor-pointer uppercase">▼ Down</button>
                  <button onClick={() => nudgePost(-0.25, 0)} className="px-1 py-0.5 bg-zinc-800 text-white rounded text-[9px] hover:bg-zinc-750 cursor-pointer uppercase">◀ L</button>
                  <button onClick={() => nudgePost(0.25, 0)} className="px-1 py-0.5 bg-zinc-800 text-white rounded text-[9px] hover:bg-zinc-750 cursor-pointer uppercase">▶ R</button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-1.5 mt-1.5 border-t border-zinc-800 pt-1.5">
                <button
                  onClick={() => setSelectedPostId(null)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white rounded py-1 text-center text-[10px] uppercase font-bold cursor-pointer transition border border-zinc-700"
                >
                  Deselect
                </button>
                <button
                  onClick={() => deleteSelectedPost()}
                  disabled={posts.length <= 2}
                  className="bg-rose-950/60 hover:bg-rose-900 border border-rose-900/35 text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed rounded py-1 px-1.5 text-center text-[10px] uppercase font-bold cursor-pointer transition flex items-center justify-center gap-1"
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
              className={`absolute top-4 right-4 bg-[#1f2125]/95 border border-teal-500/20 px-2.5 py-1.5 rounded-lg shadow-xl z-30 transition flex items-center justify-between w-48 text-[10px] text-white cursor-grab active:cursor-grabbing select-none`}
              style={{
                transform: `translate(${segmentCustomizerOffset.x}px, ${segmentCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
              title="Expand segment customizer"
            >
              <span className="font-bold text-teal-400">Segment Settings</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">[+]</span>
            </button>
          ) : (
            <div
              onPointerDown={(e) => handlePanelDragStart(e, 'segment')}
              onPointerMove={(e) => handlePanelDragMove(e, 'segment')}
              onPointerUp={(e) => handlePanelDragEnd(e, 'segment')}
              className={`absolute top-4 right-4 bg-[#1f2125]/95 border border-teal-500/20 px-2.5 py-2 rounded-lg shadow-xl z-30 w-52 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-[#1f2125] transition-all duration-150 ${
                dragPanel === 'segment' ? 'ring-1 ring-teal-500/50' : ''
              }`}
              style={{
                transform: `translate(${segmentCustomizerOffset.x}px, ${segmentCustomizerOffset.y}px)`,
                touchAction: 'none'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Segment Settings</span>
                <button
                  onClick={() => setIsSegmentCustomizerMinimized(true)}
                  className="text-[9px] text-[#8e9297] hover:text-white transition cursor-pointer font-bold uppercase shrink-0"
                  title="Minimize"
                >
                  Hide
                </button>
              </div>
              
              {/* Split segment to add new intermediate post */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] text-zinc-400 uppercase tracking-widest leading-none mb-0.5">Node:</span>
                <button
                  onClick={() => {
                    const seg = segments.find(s => s.id === selectedSegmentId);
                    if (seg) handleSegmentClick(seg, 0.5);
                  }}
                  className="w-full text-left bg-zinc-800 hover:bg-zinc-750 text-white text-[10px] px-1.5 py-1 rounded border border-zinc-700 transition flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1"><Plus className="w-2.5 h-2.5 text-emerald-405" /> Split Center</span>
                  <span className="text-[8px] font-mono text-zinc-500 uppercase leading-none">Add</span>
                </button>
              </div>

              {/* Toggle Gate inside this specific segment */}
              <div className="flex flex-col gap-1 mt-0.5 border-t border-zinc-800 pt-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-white leading-none">Gate Overlay</span>
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
                    className="w-3.5 h-3.5 cursor-pointer text-emerald-500 accent-emerald-500"
                  />
                </div>

                {segments.find(s => s.id === selectedSegmentId)?.hasGate && (
                  <div className="flex flex-col gap-1.5 mt-0.5 pt-1 pb-0.5 bg-[#18191c] px-1.5 rounded border border-zinc-800">
                    {/* Gate Type Selector */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] text-zinc-400 uppercase tracking-wider mb-0.5">Gate Type:</span>
                      <div className="grid grid-cols-2 gap-1 bg-zinc-900 p-0.5 rounded border border-zinc-750">
                        <button
                          type="button"
                          onClick={() => {
                            setSegments(prev => prev.map(s => s.id === selectedSegmentId ? { ...s, gateType: 'single' } : s));
                          }}
                          className={`py-0.5 rounded text-[8.5px] font-medium transition cursor-pointer text-center ${
                            (segments.find(s => s.id === selectedSegmentId)?.gateType !== 'double')
                              ? 'bg-emerald-600/40 text-emerald-300 border border-emerald-500/30'
                              : 'text-zinc-400 hover:text-white border border-transparent'
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
                              ? 'bg-emerald-600/40 text-emerald-300 border border-emerald-500/30'
                              : 'text-zinc-400 hover:text-white border border-transparent'
                          }`}
                        >
                          Double (4.0m)
                        </button>
                      </div>
                    </div>

                    {/* Gate Width Display */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center text-[8px] text-zinc-400 leading-none">
                        <span>Width:</span>
                        <span className="font-mono text-emerald-400 text-[9px] font-bold">
                          {segments.find(s => s.id === selectedSegmentId)?.gateType === 'double' ? '4.0m' : '1.2m'} (Locked)
                        </span>
                      </div>
                    </div>

                    {/* Gate Positioning along segment line */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center text-[8px] text-zinc-400 leading-none">
                        <span>Pos:</span>
                        <span className="font-mono text-white text-[9px] font-bold">{(segments.find(s => s.id === selectedSegmentId)?.gatePositionPercent || 40)}%</span>
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
                        className="w-full h-0.5 accent-teal-500 bg-zinc-700 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 mt-1.5 border-t border-zinc-800 pt-1.5">
                <button
                  onClick={() => setSelectedSegmentId(null)}
                  className="bg-zinc-805 hover:bg-zinc-750 text-white rounded py-1 text-center text-[10px] uppercase font-bold cursor-pointer transition border border-zinc-750"
                >
                  Deselect
                </button>
                <button
                  onClick={() => deleteSelectedSegment()}
                  className="bg-rose-950/60 hover:bg-rose-900 border border-rose-900/40 text-rose-300 rounded py-1 px-1.5 text-center text-[10px] uppercase font-bold cursor-pointer transition flex items-center justify-center gap-1"
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
            className={`absolute top-4 right-4 bg-[#1f2125]/95 border border-teal-500/20 px-2.5 py-2.5 rounded-lg shadow-xl z-30 w-48 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-[#1f2125] transition-all duration-150 ${
              dragPanel === 'segment' ? 'ring-1 ring-teal-500/50' : ''
            }`}
            style={{
              transform: `translate(${segmentCustomizerOffset.x}px, ${segmentCustomizerOffset.y}px)`,
              touchAction: 'none'
            }}
          >
            <div className="flex items-center justify-between font-sans">
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Gate Settings</span>
            </div>
            <div className="text-[10px] text-zinc-300 flex flex-col gap-1 leading-normal">
              <div>
                Type: <b className="text-white">{segments.find(s => s.id === selectedSegmentId)?.gateType === 'double' ? 'Double Gate' : 'Single Gate'}</b>
              </div>
              <div>
                Width: <b className="text-white">{segments.find(s => s.id === selectedSegmentId)?.gateType === 'double' ? '4.0m' : '1.2m'}</b>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5 border-t border-zinc-800 pt-1.5">
              <button
                onClick={() => setSelectedSegmentId(null)}
                className="bg-zinc-805 hover:bg-zinc-750 text-white rounded py-1 text-center text-[10px] uppercase font-bold cursor-pointer transition border border-zinc-750"
              >
                Deselect
              </button>
              <button
                onClick={() => deleteSelectedSegment()}
                className="bg-rose-950/60 hover:bg-rose-900 border border-rose-900/40 text-rose-300 rounded py-1 px-1.5 text-center text-[10px] uppercase font-bold cursor-pointer transition flex items-center justify-center gap-1"
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
          <div className="absolute top-4 left-4 bg-zinc-950/85 backdrop-blur-md px-3.5 py-2.5 rounded-xl text-neutral-300 text-xs border border-zinc-800 max-w-sm z-30 shadow-2xl flex gap-2.5 items-start">
            <Info className="w-4.5 h-4.5 text-teal-400 shrink-0 mt-0.5 animate-bounce" />
            <div className="flex-1">
              <p className="font-sans leading-relaxed">
                Drag the <b className="text-white">circular handles</b> to drape the fence perfectly along the garden path. Switch to <b className="text-teal-400">Pan Tool</b> to drag the camera view or zoom!
              </p>
            </div>
            <button
              onClick={dismissTipBanner}
              className="text-zinc-500 hover:text-white transition font-mono text-[9px] uppercase font-bold pl-1.5 cursor-pointer"
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
