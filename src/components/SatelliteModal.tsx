import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  MapPin, 
  Search, 
  Satellite, 
  Info, 
  Check, 
  Layers, 
  RefreshCw, 
  HelpCircle,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { APIProvider, Map, useMap, useMapsLibrary, Marker } from '@vis.gl/react-google-maps';

interface SatelliteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDistance: (meters: number) => void;
}

// Earth radius in meters for Haversine calculation
const EARTH_RADIUS_METERS = 6371000;

function calculateHaversineDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((EARTH_RADIUS_METERS * c).toFixed(1));
}

export default function SatelliteModal({ isOpen, onClose, onSelectDistance }: SatelliteModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pins, setPins] = useState<{ lat: number; lng: number; screenX?: number; screenY?: number }[]>([]);
  const [isClosedLoop, setIsClosedLoop] = useState(false);
  const [selectedSegmentIdx, setSelectedSegmentIdx] = useState<number | null>(null);
  
  // Custom API Key reading from import.meta.env
  const API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
  const hasValidKey = Boolean(API_KEY) && 
                      typeof API_KEY === 'string' && 
                      API_KEY.startsWith('AIzaSy') && 
                      API_KEY !== 'YOUR_API_KEY' && 
                      API_KEY.trim() !== '';

  // Mock Yard selection index & presets for sandbox fallback
  const [mockYardIndex, setMockYardIndex] = useState(0);
  const [mockMapZoom, setMockMapZoom] = useState(1.0);
  const mockContainerRef = useRef<HTMLDivElement>(null);

  // Calculate segments
  const segments = React.useMemo(() => {
    const list = [];
    if (pins.length < 2) return list;
    for (let i = 0; i < pins.length - 1; i++) {
      const p1 = pins[i];
      const p2 = pins[i + 1];
      const length = calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      list.push({ index: i, p1, p2, length, isClosing: false });
    }
    if (isClosedLoop && pins.length >= 3) {
      const p1 = pins[pins.length - 1];
      const p2 = pins[0];
      const length = calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      list.push({ index: pins.length - 1, p1, p2, length, isClosing: true });
    }
    return list;
  }, [pins, isClosedLoop]);

  const totalBoundaryDistance = React.useMemo(() => {
    return segments.reduce((sum, seg) => sum + seg.length, 0);
  }, [segments]);

  // Selected distance to apply or show in output panel
  const distance = React.useMemo(() => {
    if (selectedSegmentIdx !== null && segments[selectedSegmentIdx]) {
      return parseFloat(segments[selectedSegmentIdx].length.toFixed(1));
    }
    return parseFloat(totalBoundaryDistance.toFixed(1));
  }, [selectedSegmentIdx, segments, totalBoundaryDistance]);

  const handleReset = () => {
    setPins([]);
    setSelectedSegmentIdx(null);
  };

  const handleUndo = () => {
    setPins(prev => prev.slice(0, -1));
    setSelectedSegmentIdx(null);
  };

  if (!isOpen) return null;

  // Real Google Maps logic wrapper
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1f2125] border border-zinc-700 w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header bar */}
        <div className="px-6 py-4 bg-[#141517] border-b border-[#2f3136] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-rose-500 animate-pulse" />
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                Satellite Boundary Estimator
              </h3>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">
                {hasValidKey ? "Connected to Google Maps Live API" : "Simulated Local sandbox active"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition rounded-full hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inner layout split */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Main Visualizer Area */}
          <div className="flex-1 bg-black relative flex flex-col min-h-0">
            {hasValidKey ? (
              <APIProvider apiKey={API_KEY} version="weekly">
                <GoogleMapContainer 
                  pins={pins}
                  setPins={setPins}
                  isClosedLoop={isClosedLoop}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  segments={segments}
                />
              </APIProvider>
            ) : (
              <MockMapContainer 
                pins={pins}
                setPins={setPins}
                isClosedLoop={isClosedLoop}
                setIsClosedLoop={setIsClosedLoop}
                mockYardIndex={mockYardIndex}
                setMockYardIndex={setMockYardIndex}
                mockMapZoom={mockMapZoom}
                setMockMapZoom={setMockMapZoom}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                segments={segments}
              />
            )}
          </div>

          {/* Right Control Dashboard */}
          <div className="w-full md:w-80 bg-[#141517] border-t md:border-t-0 md:border-l border-[#2f3136] p-5 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="flex flex-col gap-4">
              
              <div className="space-y-1.5">
                <span className="text-[10px] text-rose-400 font-extrabold uppercase tracking-widest block font-mono">
                  Instructions
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Click on the yard map to drop multiple boundary points/corners of your fence. Select any single segment or apply the entire perimeter.
                </p>
              </div>

              {/* API Key Warning block if offline */}
              {!hasValidKey && (
                <div className="bg-amber-500/10 border border-amber-500/15 p-3 rounded-xl space-y-1 shadow">
                  <div className="flex items-center gap-1.5 text-amber-400 text-[9.5px] font-extrabold uppercase tracking-widest font-mono">
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    Offline Sandbox Mode
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                    Real satellite search is offline. You can still customize properties & draw boundary vertices dynamically in our local simulator!
                  </p>
                </div>
              )}

              {/* Path Controls (Closed Loop Toggle & Undo) */}
              <div className="bg-[#18191c] border border-zinc-800/60 p-3 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="closeLoop"
                    checked={isClosedLoop}
                    disabled={pins.length < 3}
                    onChange={(e) => setIsClosedLoop(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-800 text-rose-500 focus:ring-rose-500 w-3.5 h-3.5 accent-rose-600 disabled:opacity-40"
                  />
                  <label htmlFor="closeLoop" className="text-[10.5px] font-bold text-zinc-300 select-none cursor-pointer disabled:opacity-40">
                    Close Boundary Loop
                  </label>
                </div>
                {pins.length > 0 && (
                  <button
                    onClick={handleUndo}
                    className="text-[10px] font-extrabold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-md transition"
                  >
                    Undo Pt
                  </button>
                )}
              </div>

              {/* Active Segments Interactive list */}
              <div className="space-y-2">
                <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-widest block font-mono">
                  Calculated Segments ({segments.length})
                </span>
                {segments.length === 0 ? (
                  <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-4 text-center text-zinc-500 text-[11px] italic">
                    Tap 2+ coordinates on map to produce segment dimension lines...
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5 divide-y divide-zinc-900/20">
                    <button
                      onClick={() => setSelectedSegmentIdx(null)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center justify-between border ${
                        selectedSegmentIdx === null
                          ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
                          : "bg-zinc-900 border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      }`}
                    >
                      <span className="font-semibold">🏠 Entire Perimeter (Total)</span>
                      <span className={`font-mono font-bold ${selectedSegmentIdx === null ? "text-rose-400" : "text-zinc-300"}`}>
                        {totalBoundaryDistance.toFixed(1)} m
                      </span>
                    </button>

                    {segments.map((seg, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedSegmentIdx(idx)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center justify-between border ${
                          selectedSegmentIdx === idx
                            ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
                            : "bg-zinc-900/60 border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        }`}
                      >
                        <span className="font-sans flex items-center gap-1.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-white opacity-40" />
                          Segment #{idx + 1} {seg.isClosing && <span className="text-[8px] bg-rose-955 text-rose-400 px-1 py-0.2 rounded font-extrabold uppercase font-mono tracking-widest">Closed</span>}
                        </span>
                        <span className={`font-mono font-black ${selectedSegmentIdx === idx ? "text-rose-400" : "text-zinc-300"}`}>
                          {seg.length.toFixed(1)} m
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Premium Distance Output Panel */}
              <div className="bg-rose-950/20 border border-rose-900/30 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                <span className="text-[9px] text-rose-400 font-extrabold uppercase tracking-widest mb-1 font-mono">
                  {selectedSegmentIdx !== null ? `Segment #${selectedSegmentIdx + 1} Dimension` : "Total Perimeter"}
                </span>
                <span className="text-3xl font-black text-white font-sans tracking-tight">
                  {distance > 0 ? `${distance} m` : '---'}
                </span>
                {distance > 0 && (
                  <span className="text-[9px] text-emerald-400 font-bold font-mono mt-1.5 uppercase tracking-wider flex items-center gap-1 bg-emerald-950/30 px-2 py-0.5 border border-emerald-900/20 rounded">
                    <Sparkles className="w-3.5 h-3.5" /> High-Intensity Vector Yard
                  </span>
                )}
              </div>

            </div>

            {/* Actions portion */}
            <div className="space-y-2.5 mt-4">
              {pins.length > 0 && (
                <button
                  onClick={handleReset}
                  className="w-full flex items-center justify-center gap-1.5 font-bold py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-lg text-[10.5px] uppercase tracking-wider transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Clear All Points
                </button>
              )}

              <button
                disabled={distance <= 0}
                onClick={() => {
                  if (distance > 0) {
                    onSelectDistance(distance);
                    onClose();
                  }
                }}
                className={`w-full flex items-center justify-center gap-2 font-extrabold py-3 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-lg border ${
                  distance > 0
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-rose-900/20'
                    : 'bg-[#18191c] border-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <Check className="w-4 h-4" /> Use {selectedSegmentIdx !== null ? `Segment (${distance}m)` : `Perimeter (${distance}m)`}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

// -------------------------------------------------------------
// GOOGLE MAP PORTION (LIVE IMPLEMENTATION)
// -------------------------------------------------------------
interface GoogleMapContainerProps {
  pins: { lat: number; lng: number }[];
  setPins: React.Dispatch<React.SetStateAction<{ lat: number; lng: number; screenX?: number; screenY?: number }[]>>;
  isClosedLoop: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  segments: any[];
}

function GoogleMapContainer({
  pins,
  setPins,
  isClosedLoop,
  searchQuery,
  setSearchQuery,
  segments
}: GoogleMapContainerProps) {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoWindowsRef = useRef<google.maps.InfoWindow[]>([]);
  const placesLib = useMapsLibrary('places');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Draw real google maps polyline between pins
  useEffect(() => {
    if (!map) return;
    if (typeof google === 'undefined' || !google.maps) return;
    
    // Clear previous lines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    // Clear previous labels
    infoWindowsRef.current.forEach(iw => iw.close());
    infoWindowsRef.current = [];

    if (pins.length < 2) return;

    const pathCoordinates = pins.map(p => ({ lat: p.lat, lng: p.lng }));
    if (isClosedLoop && pins.length >= 3) {
      pathCoordinates.push({ lat: pins[0].lat, lng: pins[0].lng });
    }

    const poly = new google.maps.Polyline({
      path: pathCoordinates,
      geodesic: true,
      strokeColor: '#ffffff',
      strokeOpacity: 0.95,
      strokeWeight: 4,
    });
    poly.setMap(map);
    polylinesRef.current.push(poly);

    // Create distance labels at midpoints of each segment
    segments.forEach((seg, idx) => {
      const midLat = (seg.p1.lat + seg.p2.lat) / 2;
      const midLng = (seg.p1.lng + seg.p2.lng) / 2;

      const infoContent = `
        <div style="background-color: #141517; color: #ffffff; font-family: monospace; font-size: 10px; font-weight: bold; padding: 3px 7px; border-radius: 5px; border: 1.5px solid #2f3136; box-shadow: 0 2px 8px rgba(0,0,0,0.4); text-align: center; pointer-events: none;">
          ${seg.length.toFixed(1)} m
        </div>
      `;

      const infowindow = new google.maps.InfoWindow({
        position: { lat: midLat, lng: midLng },
        content: infoContent,
        disableAutoPan: true,
      });

      infowindow.open(map);
      infoWindowsRef.current.push(infowindow);
    });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
      infoWindowsRef.current.forEach(iw => iw.close());
    };
  }, [map, pins, isClosedLoop, segments]);

  // Initialize autocomplete service
  useEffect(() => {
    if (!placesLib || !searchQuery || searchQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        return;
      }
      const service = new google.maps.places.AutocompleteService();
      const timer = setTimeout(() => {
        service.getPlacePredictions({ input: searchQuery }, (predictions, status) => {
          if (status === 'OK' && predictions) {
            setSuggestions(predictions);
            setApiError(null);
          } else {
            console.warn("Autocomplete status:", status);
            if (status === 'REQUEST_DENIED' || status === 'NOT_FOUND') {
              setApiError("Places API or Geocoding API is not activated on this Google Cloud project. Address autocomplete has been disabled.");
            }
            setSuggestions([]);
          }
        });
      }, 250);

      return () => clearTimeout(timer);
    } catch (err: any) {
      console.error("Autocomplete service error:", err);
      setApiError("Places/Geocoding service failed to load. Please configure 'Places API' and 'Geocoding API' in your Google Cloud Developer Console.");
    }
  }, [placesLib, searchQuery]);

  // Handle suggestion select
  const handleSelectSuggestion = (placeId: string, description: string) => {
    setSearchQuery(description);
    setShowSuggestions(false);

    if (!map) return;
    try {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ placeId }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          map.setCenter(results[0].geometry.location);
          map.setZoom(19); // Zoom in close for satellite measure
          setApiError(null);
        } else {
          console.warn("Geocoding failed for selection:", status);
          if (status === 'REQUEST_DENIED') {
            setApiError("Geocoding API is not activated on this Google Cloud project. Search address lookup is disabled.");
          } else {
            setApiError(`Geocoding failed with status: ${status}`);
          }
        }
      });
    } catch (err: any) {
      console.error("Geocoder error:", err);
      setApiError("Geocoder failed to initialize. Make sure 'Geocoding API' is activated on your Google Cloud project.");
    }
  };

  // Handle plain-text form submit search geocoding
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || !map) return;
    
    setShowSuggestions(false);
    try {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: searchQuery }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          map.setCenter(results[0].geometry.location);
          map.setZoom(19); // Zoom in close for satellite measure
          setApiError(null);
        } else {
          console.warn("Geocoding failed for plain text query:", status);
          if (status === 'REQUEST_DENIED') {
            setApiError("Geocoding API is not activated on this Google Cloud project. Search address lookup is disabled.");
          } else {
            setApiError(`Geocoding failed with status: ${status}`);
          }
        }
      });
    } catch (err: any) {
      console.error("Geocoder error:", err);
      setApiError("Geocoder failed to initialize. Make sure 'Geocoding API' is activated on your Google Cloud project.");
    }
  };

  // Click on map to add custom marker vertices/points
  const handleMapClick = (e: any) => {
    const latLng = e.detail?.latLng || e.latLng;
    if (!latLng) return;
    
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
    const coord = { lat, lng };
    setPins(prev => [...prev, coord]);
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Dynamic Floating Search bar Form */}
      <form 
        onSubmit={handleSearchSubmit}
        className="absolute top-4 left-4 right-4 z-40 max-w-md bg-[#141517] border border-[#2f3136] rounded-xl shadow-2xl overflow-visible"
      >
        <div className="flex items-center px-3.5 py-1.5">
          <Search className="w-4 h-4 text-zinc-500 mr-2.5 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            placeholder="Search address & press Enter to locate..."
            className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder-zinc-500 py-1"
          />
          {searchQuery && (
            <button 
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSuggestions([]);
              }}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Suggestion Dropdown Panel */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c1d22] border border-[#2f3136] rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-zinc-800 z-50">
            {suggestions.map((item) => (
              <button
                key={item.place_id}
                type="button"
                onClick={() => handleSelectSuggestion(item.place_id, item.description)}
                className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition block font-sans truncate"
              >
                {item.description}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* API Warning Overlay Banner */}
      {apiError && (
        <div className="absolute top-18 left-4 right-4 z-40 max-w-md bg-rose-950/95 border border-rose-500/50 rounded-xl p-3.5 shadow-2xl flex items-start gap-2.5 backdrop-blur-md font-sans">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-xs font-bold text-rose-200">Google Maps Integration Alert</div>
            <div className="text-[11px] text-rose-300 mt-1 leading-relaxed">
              {apiError}
              <span className="block mt-1 font-bold text-teal-400">
                💡 Tip: You can still select points and estimate distances perfectly by clicking directly anywhere on the hybrid satellite map!
              </span>
            </div>
            <button 
              type="button" 
              onClick={() => setApiError(null)}
              className="mt-2 text-[10px] text-rose-400 hover:text-rose-200 underline font-semibold cursor-pointer"
            >
              Dismiss warning
            </button>
          </div>
        </div>
      )}

      {/* Actual Live Google Map View */}
      <div className="flex-1 w-full h-full relative">
        <Map
          defaultCenter={{ lat: -33.8688, lng: 151.2093 }} // Default Sydney
          defaultZoom={18}
          mapTypeId="hybrid"
          mapId="SATELLITE_MEASURER"
          onClick={handleMapClick}
          disableDefaultUI={false}
          gestureHandling="cooperative"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          {pins.map((pin, idx) => (
            <Marker 
              key={idx}
              position={pin} 
              label={{
                text: `${idx + 1}`,
                color: '#000000',
                fontWeight: '900',
                fontSize: '10px'
              }}
              icon={{
                path: 0, // google.maps.SymbolPath.CIRCLE is 0
                fillColor: '#ffffff',
                fillOpacity: 1.0,
                strokeColor: '#000000',
                strokeWeight: 2.5,
                scale: 8,
              } as any}
            />
          ))}
        </Map>
        
      </div>
    </div>
  );
}


// -------------------------------------------------------------
// SANDBOX FALLBACK CONTAINER (No API Key Case)
// -------------------------------------------------------------
interface MockMapContainerProps {
  pins: any[];
  setPins: React.Dispatch<React.SetStateAction<any[]>>;
  isClosedLoop: boolean;
  setIsClosedLoop: (val: boolean) => void;
  mockYardIndex: number;
  setMockYardIndex: (idx: number) => void;
  mockMapZoom: number;
  setMockMapZoom: (val: number) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  segments: any[];
}

const MOCK_YARDS = [
  {
    name: "Suburban Residence #14",
    address: "742 Evergreen Terrace, Springfield",
    lat: 37.7749,
    lng: -122.4194,
    scale: 0.12, // meters per pixel
    bgColor: "bg-emerald-950",
    layout: (
      <svg className="w-full h-full opacity-70" viewBox="0 0 500 500">
        <defs>
          <radialGradient id="lawnGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e3f20" />
            <stop offset="100%" stopColor="#112713" />
          </radialGradient>
        </defs>
        {/* Lawn Grid background */}
        <rect width="100%" height="100%" fill="url(#lawnGrad)" />
        {/* Suburban roadway */}
        <rect x="0" y="420" width="500" height="80" fill="#2d3035" />
        <line x1="0" y1="460" x2="500" y2="460" stroke="#f1c40f" strokeDasharray="10 10" strokeWidth="2" opacity="0.6" />
        {/* Sidewalk */}
        <rect x="0" y="405" width="500" height="15" fill="#585e66" />
        {/* Driveway */}
        <path d="M 320,220 L 370,405 L 430,405 L 380,220 Z" fill="#3D4148" />
        {/* Main Residence Roof with shadow */}
        <rect x="80" y="90" width="220" height="160" fill="#222" opacity="0.4" transform="translate(10, 10)" />
        <rect x="80" y="90" width="220" height="160" fill="#4a5568" rx="4" />
        <path d="M 80,90 L 190,40 L 300,90 Z" fill="#2d3748" />
        <path d="M 80,250 L 190,200 L 300,250 Z" fill="#222831" />
        {/* Pool / Water structure */}
        <rect x="100" y="300" width="120" height="80" fill="#141517" opacity="0.3" transform="translate(4,4)" />
        <rect x="100" y="300" width="120" height="80" fill="#00adb5" rx="16" opacity="0.8" />
        <rect x="108" y="308" width="104" height="64" fill="#66fcf1" rx="8" opacity="0.2" />
        {/* Trees / Foliage */}
        <circle cx="440" cy="80" r="28" fill="#1b4d3e" />
        <circle cx="434" cy="74" r="20" fill="#2d5a27" />
        <circle cx="60" cy="350" r="22" fill="#228b22" />
        {/* Property fencing boundary guide outline */}
        <rect x="25" y="30" width="450" height="375" fill="none" stroke="#f20c32" strokeWidth="1.5" strokeDasharray="6,6" opacity="0.4" />
      </svg>
    )
  },
  {
    name: "Corner Estate Block 4B",
    address: "120 Whispering Pines Lane, Austin, TX",
    lat: 30.2672,
    lng: -97.7431,
    scale: 0.16,
    bgColor: "bg-slate-900",
    layout: (
      <svg className="w-full h-full opacity-70" viewBox="0 0 500 500">
        <rect width="100%" height="100%" fill="#1a2e26" />
        {/* Highway corner roads */}
        <rect x="400" y="0" width="100" height="500" fill="#333" />
        <rect x="0" y="400" width="500" height="100" fill="#333" />
        <rect x="400" y="400" width="100" height="100" fill="#2a2a2a" />
        {/* Sidewalk */}
        <rect x="385" y="0" width="15" height="400" fill="#718096" />
        <rect x="0" y="385" width="400" height="15" fill="#718096" />
        {/* Corner Lot Residence */}
        <polygon points="100,80 280,80 280,240 180,240 180,180 100,180" fill="#1a202c" opacity="0.5" transform="translate(8,8)" />
        <polygon points="100,80 280,80 280,240 180,240 180,180 100,180" fill="#718096" />
        {/* Large back lawn / trees */}
        <circle cx="100" cy="300" r="40" fill="#11331d" />
        <circle cx="280" cy="320" r="25" fill="#143d23" />
        <circle cx="330" cy="140" r="30" fill="#0f4523" />
        {/* Boundary outline */}
        <rect x="30" y="20" width="350" height="360" fill="none" stroke="#f20c32" strokeWidth="1.5" strokeDasharray="6,6" opacity="0.4" />
      </svg>
    )
  }
];

// Procedural generator to create a custom high-fidelity vector yard layout dynamically based on searched address string
function generateCustomYard(address: string, indexOffset: number = 0) {
  // Simple hash of address to drive layout pseudo-randomness
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash + indexOffset);

  const scale = 0.10 + (hash % 8) * 0.01; // Scaled scale between 0.10 and 0.18

  const poolType = hash % 3; // 0 = none, 1 = rect, 2 = oval
  const poolX = 110 + (hash % 120);
  const poolY = 270 + (hash % 60);
  const poolW = 95 + (hash % 40);
  const poolH = 65 + (hash % 30);

  const roofColor = ["#334155", "#0f172a", "#881337", "#1e3a8a", "#4c1d95"][hash % 5];
  const roofStyle = hash % 2; // Hip / Gable vs Bento blocks

  const driveAngle = (hash % 36) - 18; // Diagonal driveway deviation

  const numTrees = 3 + (hash % 5);
  const trees = Array.from({ length: numTrees }).map((_, i) => ({
    cx: 40 + ((hash * (i + 13)) % 410),
    cy: 40 + ((hash * (i + 7)) % 320),
    r: 16 + ((hash + i) % 12)
  }));

  const layout = (
    <svg className="w-full h-full opacity-75" viewBox="0 0 500 500">
      <defs>
        <radialGradient id="yardGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#143419" />
          <stop offset="100%" stopColor="#081c0f" />
        </radialGradient>
      </defs>

      {/* Grass base */}
      <rect width="100%" height="100%" fill="url(#yardGrad)" />

      {/* Subtle coordinate overlay grid */}
      <g opacity="0.1" stroke="#22c55e" strokeWidth="0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`v-${i}`} x1={i * 50} y1={0} x2={i * 50} y2={500} />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h-${i}`} x1={0} y1={i * 50} x2={500} y2={i * 50} />
        ))}
      </g>

      {/* Slanted driveway */}
      <path 
        d={`M 250,180 L ${280 + driveAngle},395 L ${340 + driveAngle},395 L 310,180 Z`} 
        fill="#27272a" 
        opacity="0.9"
      />

      {/* Concrete roadway */}
      <rect x="0" y="395" width="500" height="105" fill="#18181b" />
      <line x1="0" y1="440" x2="500" y2="440" stroke="#f59e0b" strokeDasharray="12 12" strokeWidth="2.5" opacity="0.6" />

      {/* Sidewalk border path */}
      <rect x="0" y="380" width="500" height="15" fill="#3f3f46" />

      {/* Main estate roof drop shadow */}
      <rect x="75" y="70" width="230" height="150" fill="#020617" opacity="0.6" transform="translate(10, 10)" rx="8" />

      {/* Procedural roofs */}
      {roofStyle === 0 ? (
        <g>
          <rect x="75" y="70" width="230" height="150" fill={roofColor} rx="6" />
          <path d="M 75,70 L 190,145 L 305,70 Z" fill="#000000" opacity="0.18" />
          <path d="M 75,220 L 190,145 L 305,220 Z" fill="#ffffff" opacity="0.08" />
          <line x1="75" y1="145" x2="305" y2="145" stroke="#4b5563" strokeWidth="2.5" opacity="0.5" />
        </g>
      ) : (
        <g>
          <rect x="75" y="70" width="150" height="150" fill={roofColor} rx="4" />
          <rect x="205" y="90" width="100" height="110" fill="#1e293b" rx="4" />
          <rect x="105" y="95" width="90" height="75" fill="#475569" rx="2" opacity="0.8" />
          <rect x="220" y="110" width="70" height="70" fill="#78350f" opacity="0.4" />
        </g>
      )}

      {/* Backyard Pool structures */}
      {poolType !== 0 && (
        <g>
          {poolType === 1 ? (
            <>
              <rect x={poolX - 3} y={poolY - 3} width={poolW + 6} height={poolH + 6} fill="#4b5563" rx="10" />
              <rect x={poolX} y={poolY} width={poolW} height={poolH} fill="#0284c7" rx="8" />
              <rect x={poolX + 6} y={poolY + 6} width={poolW - 12} height={poolH - 12} fill="#38bdf8" rx="4" opacity="0.5" />
            </>
          ) : (
            <>
              <ellipse cx={poolX + poolW/2} cy={poolY + poolH/2} rx={poolW/2 + 3} ry={poolH/2 + 3} fill="#4b5563" />
              <ellipse cx={poolX + poolW/2} cy={poolY + poolH/2} rx={poolW/2} ry={poolH/2} fill="#0284c7" />
              <ellipse cx={poolX + poolW/2} cy={poolY + poolH/2} rx={poolW/2 - 6} ry={poolH/2 - 6} fill="#38bdf8" opacity="0.4" />
            </>
          )}
        </g>
      )}

      {/* Dense Trees canopy */}
      {trees.map((t, idx) => (
        <g key={`tree-${idx}`}>
          <circle cx={t.cx} cy={t.cy} r={t.r} fill="#14532d" opacity="0.9" />
          <circle cx={t.cx - 2} cy={t.cy - 2} r={t.r * 0.75} fill="#15803d" opacity="0.95" />
          <circle cx={t.cx - 4} cy={t.cy - 4} r={t.r * 0.45} fill="#4ade80" opacity="0.35" />
        </g>
      ))}

      {/* Lot Property boundaries indicator box */}
      <rect x="20" y="20" width="460" height="350" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="8 6" opacity="0.5" />
    </svg>
  );

  return {
    name: address.split(',')[0].length > 25 ? `${address.split(',')[0].slice(0, 22)}...` : address.split(',')[0],
    address: address,
    lat: 34.0522 + (hash % 100) * 0.001,
    lng: -118.2437 + (hash % 100) * 0.001,
    scale: scale,
    bgColor: "bg-slate-950",
    layout: layout
  };
}

function MockMapContainer({
  pins,
  setPins,
  isClosedLoop,
  setIsClosedLoop,
  mockYardIndex,
  setMockYardIndex,
  mockMapZoom,
  setMockMapZoom,
  searchQuery,
  setSearchQuery,
  segments
}: MockMapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeYard, setActiveYard] = useState<any>(MOCK_YARDS[mockYardIndex]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStepText, setSearchStepText] = useState('');

  // Sync back to presets if index changes via parent selectors
  useEffect(() => {
    setActiveYard(MOCK_YARDS[mockYardIndex]);
  }, [mockYardIndex]);

  // Handle mock geocoding submit with high-fidelity loading stages (prevents "frozen map" feel)
  const handleMockSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || !searchQuery.trim()) return;

    setShowDropdown(false);
    setIsSearching(true);
    setSearchStepText("Contacting Geocoding API...");

    // Clear points to allow fresh measurements on new yard
    setPins([]);

    setTimeout(() => {
      setSearchStepText("Acquiring Orbital SATELLITE link...");
    }, 400);

    setTimeout(() => {
      setSearchStepText("Rendering Vector Boundary parcel...");
    }, 800);

    setTimeout(() => {
      const query = searchQuery.trim();
      const predefinedIndex = MOCK_YARDS.findIndex(y => 
        y.name.toLowerCase().includes(query.toLowerCase()) || 
        y.address.toLowerCase().includes(query.toLowerCase())
      );

      if (predefinedIndex !== -1) {
        setMockYardIndex(predefinedIndex);
        setActiveYard(MOCK_YARDS[predefinedIndex]);
      } else {
        const generated = generateCustomYard(query);
        setActiveYard(generated);
      }
      setIsSearching(false);
    }, 1200);
  };

  const currentYard = activeYard;

  // Tap on container to position virtual pins
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isSearching) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel offset to GPS degrees based on current scale
    const metersPerDegree = 111320;
    const scaleDegreesLat = currentYard.scale / metersPerDegree;
    const scaleDegreesLng = currentYard.scale / (metersPerDegree * Math.cos(currentYard.lat * Math.PI / 185));

    const virtualLat = currentYard.lat + (250 - y) * scaleDegreesLat;
    const virtualLng = currentYard.lng + (x - 250) * scaleDegreesLng;
    const coord = { lat: virtualLat, lng: virtualLng, screenX: x, screenY: y };

    setPins(prev => [...prev, coord]);
  };

  // Convert GPS coordinates back to screen pixels (stable conversion scaling)
  const getScreenCoordinates = (pt: { lat: number; lng: number } | null) => {
    if (!pt) return null;
    const anyPt = pt as any;
    if (anyPt.screenX !== undefined && anyPt.screenY !== undefined) {
      return { x: anyPt.screenX, y: anyPt.screenY };
    }

    const metersPerDegree = 111320;
    const scaleDegreesLat = currentYard.scale / metersPerDegree;
    const scaleDegreesLng = currentYard.scale / (metersPerDegree * Math.cos(currentYard.lat * Math.PI / 185));

    const dy = (pt.lat - currentYard.lat) / scaleDegreesLat;
    const dx = (pt.lng - currentYard.lng) / scaleDegreesLng;
    return {
      x: 250 + dx,
      y: 250 - dy
    };
  };

  return (
    <div className="absolute inset-0 flex flex-col select-none">
      
      {/* Top Search simulation combo form */}
      <div className="absolute top-4 left-4 right-4 z-40 max-w-md bg-[#141517] border border-[#2f3136] rounded-xl shadow-2xl">
        <form onSubmit={handleMockSearchSubmit} className="flex items-center px-3.5 py-1.5 justify-between">
          <Search className="w-4 h-4 text-zinc-500 mr-2.5 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            placeholder="Search address (e.g., Beverly Hills, CA)..."
            className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder-zinc-500 py-1"
          />
          <button 
            type="submit"
            className="text-[10px] bg-rose-600 hover:bg-rose-500 text-white font-extrabold px-3.5 py-1.5 rounded-lg uppercase tracking-wider transition cursor-pointer"
          >
            Locate
          </button>
        </form>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c1d22] border border-[#2f3136] rounded-lg shadow-2xl overflow-hidden divide-y divide-zinc-850 z-50">
            {MOCK_YARDS.map((yard, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setMockYardIndex(index);
                  setSearchQuery(yard.address);
                  setShowDropdown(false);
                  setPins([]);
                }}
                className="w-full text-left px-4 py-2 hover:bg-zinc-800 text-xs text-zinc-300 hover:text-white transition block"
              >
                <div className="font-bold text-rose-400">{yard.name}</div>
                <div className="opacity-70 font-mono text-[9px] mt-0.5">{yard.address}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selector pills for quick navigation */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2">
        <div className="bg-[#141517]/95 border border-zinc-805 p-1 rounded-xl flex items-center shadow-lg">
          {MOCK_YARDS.map((y, idx) => (
            <button
              key={idx}
              onClick={() => {
                setMockYardIndex(idx);
                setPins([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition cursor-pointer ${
                mockYardIndex === idx 
                  ? 'bg-rose-600 text-white' 
                  : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              Yard #{idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Coordinates Scale Info banner */}
      <div className="absolute top-18 right-4 z-30 bg-[#141517]/95 border border-zinc-808 px-3 py-2 rounded-xl text-[10px] text-zinc-400 font-mono shadow-md flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>GPS Scale: 1px = {currentYard.scale}m</span>
      </div>

      {/* Main Sandbox Interactive Playground Frame */}
      <div 
        ref={containerRef}
        onClick={handleCanvasClick}
        className="flex-1 w-full h-full relative overflow-hidden bg-emerald-990 flex items-center justify-center cursor-crosshair bg-[#0b1c11]"
      >
        <div className="absolute inset-0 w-full h-full transition-all duration-300" style={{ transform: `scale(${mockMapZoom})` }}>
          {currentYard.layout}
        </div>

        {/* Dynamic Satellite Scanning Scanner Effect Loader */}
        {isSearching && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
              <Search className="w-6 h-6 text-rose-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="text-center">
              <div className="text-xs text-white font-extrabold uppercase tracking-widest font-mono animate-pulse">
                {searchStepText}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono mt-1">
                Simulating Space Link Authorization...
              </div>
            </div>
          </div>
        )}

        {/* Vector SVG connectable lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {segments.map((seg, idx) => {
            const pt1 = getScreenCoordinates(seg.p1);
            const pt2 = getScreenCoordinates(seg.p2);
            if (!pt1 || !pt2) return null;
            return (
              <g key={`seg-${idx}`}>
                {/* White core connector line with subtle black outer drop glow */}
                <line 
                  x1={pt1.x} 
                  y1={pt1.y} 
                  x2={pt2.x} 
                  y2={pt2.y} 
                  stroke="#ffffff"
                  strokeWidth="3.5" 
                  style={{ filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.85))" }}
                />
                
                {/* Segment midpoint measurement text badge overlay */}
                <foreignObject
                  x={(pt1.x + pt2.x) / 2 - 45}
                  y={(pt1.y + pt2.y) / 2 - 13}
                  width="90"
                  height="26"
                  className="overflow-visible"
                >
                  <div className="bg-zinc-950/95 border border-zinc-800 rounded px-1.5 py-0.5 text-center text-[10px] font-bold text-white font-mono shadow-2xl">
                    {seg.length.toFixed(2)} m
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {/* White core cursor handles for each vertex */}
        {pins.map((pin, idx) => {
          const pt = getScreenCoordinates(pin);
          if (!pt) return null;
          return (
            <div 
              key={`pin-${idx}`}
              className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-20"
              style={{ left: `${pt.x}px`, top: `${pt.y}px` }}
            >
              <div className="w-5.5 h-5.5 rounded-full bg-white border-[3px] border-zinc-950 shadow-[0_2px_8px_rgba(0,0,0,0.7)] flex items-center justify-center text-[10px] font-black text-black">
                {idx + 1}
              </div>
            </div>
          );
        })}

        {/* Floating help notification info banner */}
        {pins.length === 0 && !isSearching && (
          <div className="absolute inset-x-0 mx-auto w-fit bottom-16 bg-[#141517]/90 border border-zinc-700 px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-2xl z-30 text-xs text-white max-w-sm font-sans animate-bounce">
            <Info className="w-4 h-4 text-teal-400" />
            <span>Tap multiple times on map to form a custom fence boundary outline.</span>
          </div>
        )}

        {pins.length === 1 && !isSearching && (
          <div className="absolute inset-x-0 mx-auto w-fit bottom-16 bg-[#141517]/95 border border-zinc-700 px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-2xl z-30 text-xs text-white max-w-sm font-sans">
            <Check className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Tap another spot to measure the first fence line segment!</span>
          </div>
        )}

      </div>
    </div>
  );
}
