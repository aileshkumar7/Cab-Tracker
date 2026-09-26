import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FleetCab, FleetCabStatus } from '../types';
import { formatTimeAgo } from '../lib/timeAgo';
import { getGoogleMapsUrl, copyToClipboard } from '../lib/geolocation';
import {
  Car,
  Radio,
  MapPin,
  CheckCircle2,
  Phone,
  Layers,
  LocateFixed,
  Eye,
  Clock,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Crosshair,
} from 'lucide-react';

interface FleetLiveMapViewProps {
  fleetList?: FleetCab[];
  onAssignDuty?: (cab: FleetCab) => void;
  focusedCabNumber?: string | null;
}

// Custom Leaflet DivIcon generator matching requested colors:
// - Blue for "on_duty"
// - Yellow for "reported_at_hub"
// - Green for "free"
function createCabMarkerIcon(cab: FleetCab, isSelected: boolean = false) {
  let colorClass = 'bg-emerald-500 text-stone-950 shadow-emerald-500/40';
  let pulseRing = '';
  let badgeColor = 'bg-emerald-400';

  if (cab.status === 'on_duty') {
    colorClass = 'bg-blue-500 text-white shadow-blue-500/50';
    pulseRing = '<span class="absolute -inset-2 rounded-full bg-blue-400 animate-ping opacity-75"></span><span class="absolute -inset-1 rounded-full bg-blue-500/50 animate-pulse"></span>';
    badgeColor = 'bg-blue-400';
  } else if (cab.lastPunchedLocation || cab.lastPunchedAt) {
    colorClass = 'bg-amber-400 text-stone-950 shadow-amber-400/50';
    pulseRing = '<span class="absolute -inset-2 rounded-full bg-amber-400 animate-ping opacity-80"></span><span class="absolute -inset-1 rounded-full bg-amber-400/50 animate-pulse"></span>';
    badgeColor = 'bg-amber-400';
  } else if (cab.status === 'reported_at_hub') {
    colorClass = 'bg-amber-400 text-stone-950 shadow-amber-400/40';
    badgeColor = 'bg-amber-400';
  }

  const selectedRing = isSelected
    ? 'ring-4 ring-amber-500 ring-offset-2 ring-offset-white scale-110'
    : 'border-2 border-white';

  const html = `
    <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110">
      ${pulseRing}
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full ${colorClass} ${selectedRing} shadow-md font-black text-xs">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
      <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-white/95 border border-[#ded7c8] text-[10px] font-black text-[#1c1917] font-mono shadow-xs pointer-events-none">
        ${cab.cabNumber.split(' ').pop() || cab.cabNumber}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-fleet-cab-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

// Component to dynamically fit map bounds when cabs load or filters change
function MapBoundsManager({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } catch {
        // ignore
      }
    }
  }, [map, bounds]);
  return null;
}

// Component to smoothly fly/pan and focus on a specific tracked cab
function MapFocusManager({ focusedCab }: { focusedCab: FleetCab | null }) {
  const map = useMap();
  useEffect(() => {
    if (
      focusedCab &&
      typeof focusedCab.currentLocationLat === 'number' &&
      typeof focusedCab.currentLocationLng === 'number' &&
      !isNaN(focusedCab.currentLocationLat) &&
      !isNaN(focusedCab.currentLocationLng)
    ) {
      try {
        map.flyTo([focusedCab.currentLocationLat, focusedCab.currentLocationLng], 16, {
          duration: 1.2,
        });
      } catch {
        // ignore
      }
    }
  }, [map, focusedCab]);
  return null;
}

export const FleetLiveMapView: React.FC<FleetLiveMapViewProps> = ({
  fleetList = [],
  onAssignDuty,
  focusedCabNumber,
}) => {
  // Checkbox filters for show/hide each status group
  const [showOnDuty, setShowOnDuty] = useState(true);
  const [showReportedAtHub, setShowReportedAtHub] = useState(true);
  const [showFree, setShowFree] = useState(true);

  // Selected cab on map
  const [selectedCabId, setSelectedCabId] = useState<string | null>(null);
  const [copiedCabNumber, setCopiedCabNumber] = useState<string | null>(null);

  const handleCopyCoords = async (cab: FleetCab) => {
    const lat = cab.currentLocationLat;
    const lng = cab.currentLocationLng;
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedCabNumber(cab.cabNumber);
      setTimeout(() => setCopiedCabNumber(null), 2500);
    }
  };

  // Find focused cab if passed
  const focusedCab = useMemo(() => {
    if (!focusedCabNumber) return null;
    return fleetList.find((c) => c.cabNumber === focusedCabNumber) || null;
  }, [fleetList, focusedCabNumber]);

  useEffect(() => {
    if (focusedCab?.id) {
      setSelectedCabId(focusedCab.id);
    }
  }, [focusedCab]);

  // Filter plotted cabs based on checkboxes & valid coordinates
  const plottedCabs = useMemo(() => {
    return fleetList.filter((cab) => {
      // Check coordinates validity
      const hasCoords =
        typeof cab.currentLocationLat === 'number' &&
        !isNaN(cab.currentLocationLat) &&
        typeof cab.currentLocationLng === 'number' &&
        !isNaN(cab.currentLocationLng) &&
        cab.currentLocationLat !== 0 &&
        cab.currentLocationLng !== 0;

      if (!hasCoords) return false;

      // Status checkboxes
      if (cab.status === 'on_duty' && !showOnDuty) return false;
      if (cab.status === 'reported_at_hub' && !showReportedAtHub) return false;
      if ((cab.status === 'free' || cab.status === 'cab_off_duty') && !showFree) return false;

      return true;
    });
  }, [fleetList, showOnDuty, showReportedAtHub, showFree]);

  // Counts for checkboxes
  const counts = useMemo(() => {
    let onDuty = 0;
    let reported = 0;
    let free = 0;
    fleetList.forEach((c) => {
      if (c.status === 'on_duty') onDuty++;
      else if (c.status === 'reported_at_hub') reported++;
      else if (c.status === 'free' || c.status === 'cab_off_duty') free++;
    });
    return { onDuty, reported, free };
  }, [fleetList]);

  // Calculate default center or bounds
  const { defaultCenter, mapBounds } = useMemo(() => {
    if (plottedCabs.length === 0) {
      // Default to central India/Bangalore coordinates if no coordinates available
      return {
        defaultCenter: [12.9716, 77.5946] as [number, number],
        mapBounds: null,
      };
    }

    const bounds = L.latLngBounds(
      plottedCabs.map((c) => [c.currentLocationLat, c.currentLocationLng])
    );
    const center = bounds.getCenter();
    return {
      defaultCenter: [center.lat, center.lng] as [number, number],
      mapBounds: bounds,
    };
  }, [plottedCabs]);

  return (
    <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl overflow-hidden shadow-sm flex flex-col text-[#1c1917]">
      {/* Map Control Bar & Status Checkbox Toggles */}
      <div className="p-4 border-b border-[#e6e0d4] bg-[#fbf9f5] flex flex-wrap items-center justify-between gap-3 z-10">
        {/* Status Group Checkboxes */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="text-[#57534e] font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Layers className="w-3.5 h-3.5 text-amber-700" /> Filter Fleet:
          </span>

          {/* On Duty (Blue) */}
          <label
            id="checkbox-filter-on-duty"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold text-xs cursor-pointer select-none transition-all ${
              showOnDuty
                ? 'bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-400/40'
                : 'bg-[#faf7f2] border-[#ded7c8] text-[#78716c] hover:text-[#1c1917]'
            }`}
          >
            <input
              type="checkbox"
              checked={showOnDuty}
              onChange={(e) => setShowOnDuty(e.target.checked)}
              className="rounded accent-blue-600 w-3.5 h-3.5"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <span>On Duty</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 border border-blue-200">
              {counts.onDuty}
            </span>
          </label>

          {/* Reported at Hub (Yellow) */}
          <label
            id="checkbox-filter-reported-hub"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold text-xs cursor-pointer select-none transition-all ${
              showReportedAtHub
                ? 'bg-amber-50 border-amber-400 text-amber-950 ring-1 ring-amber-400/40'
                : 'bg-[#faf7f2] border-[#ded7c8] text-[#78716c] hover:text-[#1c1917]'
            }`}
          >
            <input
              type="checkbox"
              checked={showReportedAtHub}
              onChange={(e) => setShowReportedAtHub(e.target.checked)}
              className="rounded accent-amber-600 w-3.5 h-3.5"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Reported at Hub</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-950 border border-amber-200">
              {counts.reported}
            </span>
          </label>

          {/* Free (Green) */}
          <label
            id="checkbox-filter-free"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold text-xs cursor-pointer select-none transition-all ${
              showFree
                ? 'bg-emerald-50 border-emerald-400 text-emerald-950 ring-1 ring-emerald-400/40'
                : 'bg-[#faf7f2] border-[#ded7c8] text-[#78716c] hover:text-[#1c1917]'
            }`}
          >
            <input
              type="checkbox"
              checked={showFree}
              onChange={(e) => setShowFree(e.target.checked)}
              className="rounded accent-emerald-600 w-3.5 h-3.5"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-stone-500" />
            <span>Cab Off Duty</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-100 text-stone-950 border border-stone-200">
              {counts.free}
            </span>
          </label>
        </div>

        {/* Quick Focus Controls */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => {
              setShowOnDuty(true);
              setShowReportedAtHub(false);
              setShowFree(false);
            }}
            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
          >
            <Radio className="w-3 h-3 text-blue-700" />
            <span>Focus Moving Only</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowOnDuty(true);
              setShowReportedAtHub(true);
              setShowFree(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] text-[11px] font-semibold transition cursor-pointer"
          >
            Show All
          </button>
          <div className="text-[11px] font-mono text-[#57534e] bg-[#faf7f2] px-2.5 py-1 rounded-lg border border-[#ded7c8]">
            {plottedCabs.length} / {fleetList.length} plotted
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative w-full h-[580px] bg-[#f5f0e6]">
        <MapContainer
          center={defaultCenter}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', backgroundColor: '#f5f0e6' }}
        >
          {/* OpenStreetMap Tile Layer (no API key required) */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <MapBoundsManager bounds={mapBounds} />
          <MapFocusManager focusedCab={focusedCab} />

          {/* Plot every cab from fleet collection */}
          {plottedCabs.map((cab) => {
            const isSelected = selectedCabId === cab.id;
            const timeAgo = formatTimeAgo(cab.lastUpdated);

            let statusLabel = 'Cab Off Duty';
            let statusBadge = 'bg-stone-100 text-stone-800 border-stone-300';
            if (cab.status === 'on_duty') {
              statusLabel = cab.isMoving ? `Cabs on Duty (${cab.speed ? Math.round(cab.speed) + ' km/h' : 'Moving'})` : 'Cabs on Duty';
              statusBadge = 'bg-blue-50 text-blue-800 border-blue-300';
            } else if (cab.status === 'reported_at_hub') {
              statusLabel = 'Reported at Hub';
              statusBadge = 'bg-amber-50 text-amber-800 border-amber-300';
            }

            return (
              <Marker
                key={cab.id || cab.cabNumber}
                position={[cab.currentLocationLat, cab.currentLocationLng]}
                icon={createCabMarkerIcon(cab, isSelected)}
                eventHandlers={{
                  click: () => {
                    if (cab.id) setSelectedCabId(cab.id);
                  },
                }}
              >
                {/* Popup with cab number, driver name, status, GPS coords, and last updated */}
                <Popup className="custom-fleet-popup">
                  <div className="p-1 min-w-[240px] text-[#1c1917] space-y-2">
                    <div className="flex items-center justify-between border-b pb-1.5 border-[#e6e0d4]">
                      <div>
                        <div className="font-black text-sm font-mono tracking-tight text-[#1c1917]">
                          {cab.cabNumber}
                        </div>
                        <div className="text-[11px] text-[#78716c] font-semibold">
                          {cab.vehicleType || 'Sedan'} • {cab.baseHub || 'Hub'}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge}`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-[#1c1917]">
                        <Car className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                        <span className="font-bold">{cab.driverName}</span>
                      </div>

                      {cab.driverPhone && (
                        <div className="flex items-center gap-1.5 text-[#57534e]">
                          <Phone className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                          <span className="font-mono text-[11px]">{cab.driverPhone}</span>
                        </div>
                      )}

                      {/* Standing Location Card */}
                      <div className="bg-[#faf7f2] p-2.5 rounded-xl border border-[#ded7c8] space-y-1.5 shadow-xs">
                        <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-amber-700 shrink-0" />
                            <span>Standing Location:</span>
                          </span>
                          {cab.status === 'on_duty' && cab.isMoving ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-bold border border-blue-300">
                              On Route (Duty)
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-950 font-black border border-emerald-400">
                              Free (Standing)
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-bold text-[#1c1917] leading-snug">
                          {cab.currentLocationText || cab.lastPunchedLocation || cab.baseHub || 'Standing Location Pending'}
                        </div>

                        {/* Maps Link */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <a
                            href={getGoogleMapsUrl(cab.currentLocationLat, cab.currentLocationLng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-1.5 px-2.5 rounded-lg text-xs font-bold bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#1c1917] border border-[#ded7c8] transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                            title="Open standing point in Google Maps"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
                            <span>View in Google Maps</span>
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-[#78716c] font-medium pt-1 border-t border-[#ded7c8]">
                        <Clock className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                        <span>GPS Live Updated: {timeAgo}</span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating Map Legend - White & Beige Theme */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-xs border border-[#ded7c8] rounded-xl p-3 shadow-lg text-xs space-y-2 pointer-events-auto text-[#1c1917]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#57534e]">
            Status Legend
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600 border border-white shadow-xs" />
            <span className="text-blue-900 font-semibold text-[11px]">Cabs on Duty</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 border border-white shadow-xs" />
            <span className="text-amber-950 font-semibold text-[11px]">Reported at Hub / Punched</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-stone-500 border border-white shadow-xs" />
            <span className="text-stone-900 font-semibold text-[11px]">Cab Off Duty</span>
          </div>
        </div>
      </div>
    </div>
  );
};
