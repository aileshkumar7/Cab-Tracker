import React, { useState } from 'react';
import {
  collection,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { FleetCabStatus, DEFAULT_SITES } from '../types';
import {
  Car,
  X,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Compass,
  FileSpreadsheet,
  Plus,
  LocateFixed,
  Building2,
} from 'lucide-react';

interface AddCabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (cabNumber: string) => void;
  existingCabNumbers?: string[];
}

const VEHICLE_TYPES = [
  'Sedan (Dzire / Etios)',
  'SUV (Innova Crysta / Ertiga)',
  'Hatchback (WagonR / Tiago)',
  'EV Taxi (Tata Tigor / BYD)',
  'Van / Tempo Traveler',
];

const BASE_HUBS = [
  'Airport Terminal Hub',
  'City Center Depot',
  'Central Railway Station Hub',
  'Cyber City IT Park Hub',
  'Electronic City Depot',
];

export const AddCabModal: React.FC<AddCabModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingCabNumbers = [],
}) => {
  const { userProfile } = useAuth();

  // Form State
  const [cabNumber, setCabNumber] = useState('');
  const [site, setSite] = useState(userProfile?.site || 'North Terminal Hub');
  const [customSite, setCustomSite] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('Sedan (Dzire / Etios)');
  const [customVehicleType, setCustomVehicleType] = useState('');
  const [baseHub, setBaseHub] = useState('Airport Terminal Hub');
  const [customBaseHub, setCustomBaseHub] = useState('');
  const [status, setStatus] = useState<FleetCabStatus>('cab_off_duty');
  const [locationText, setLocationText] = useState('');
  const [lat, setLat] = useState<string>('28.5562');
  const [lng, setLng] = useState<string>('77.1000');
  const [logInitialPunch, setLogInitialPunch] = useState(true);

  // Status & Error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDetectingGps, setIsDetectingGps] = useState(false);

  if (!isOpen) return null;

  // Normalized cab number
  const normalizedCab = cabNumber.trim().toUpperCase();
  const isDuplicate = existingCabNumbers.some(
    (c) => c.trim().toUpperCase().replace(/\s+/g, '') === normalizedCab.replace(/\s+/g, '')
  );

  // Handle GPS detection using browser geolocation
  const handleDetectCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        if (!locationText) {
          setLocationText('Current GPS Location');
        }
        setIsDetectingGps(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert('Could not access your location. Please check browser permissions.');
        setIsDetectingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCab = cabNumber.trim().toUpperCase();
    const cleanDriver = driverName.trim();
    const cleanPhone = driverPhone.trim();
    const selectedVehType = vehicleType === 'Other' ? customVehicleType.trim() : vehicleType;
    const selectedHub = baseHub === 'Other' ? customBaseHub.trim() : baseHub;
    const resolvedSite = userProfile?.site || (site === 'Other' ? customSite.trim() : site) || selectedHub || 'North Terminal Hub';

    if (!cleanCab) {
      setErrorMsg('Cab registration number is required (e.g. DL-01-AB-1234).');
      return;
    }
    if (!cleanDriver) {
      setErrorMsg('Driver name is required.');
      return;
    }
    if (!cleanPhone) {
      setErrorMsg('Driver contact phone number is required.');
      return;
    }

    const parsedLat = parseFloat(lat) || 28.5562;
    const parsedLng = parseFloat(lng) || 77.1000;
    const standingLoc = locationText.trim() || `${selectedHub} (Base Depot)`;

    setIsSubmitting(true);

    try {
      // 1. Generate clean doc ID
      const cleanDocId = 'cab_' + cleanCab.replace(/[^A-Z0-9]/g, '_').toLowerCase();
      const cabDocRef = doc(db, 'fleet', cleanDocId);
      const supervisorName = userProfile?.name || 'Operations Supervisor';

      const cabData = {
        cabNumber: cleanCab,
        site: resolvedSite,
        driverName: cleanDriver,
        driverPhone: cleanPhone,
        firstDriverName: cleanDriver,
        firstDriverPhone: cleanPhone,
        secondDriverName: '',
        secondDriverPhone: '',
        vehicleType: selectedVehType,
        baseHub: selectedHub,
        status: status,
        currentLocationText: standingLoc,
        currentLocationLat: parsedLat,
        currentLocationLng: parsedLng,
        lastPunchedLocation: standingLoc,
        lastPunchedLat: parsedLat,
        lastPunchedLng: parsedLng,
        lastPunchedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        assignedSupervisor: supervisorName,
        isMoving: false,
        speed: 0,
      };

      await setDoc(cabDocRef, cabData, { merge: true });

      // 2. Also record in location_logs if enabled
      if (logInitialPunch) {
        await addDoc(collection(db, 'location_logs'), {
          cabNumber: cleanCab,
          site: resolvedSite,
          driverName: cleanDriver,
          driverPhone: cleanPhone,
          vehicleType: selectedVehType,
          eventType: 'location_punch',
          locationText: standingLoc,
          lat: parsedLat,
          lng: parsedLng,
          dutyId: null,
          speed: 0,
          notes: 'Initial cab registration location punch',
          timestamp: serverTimestamp(),
        });
      }

      if (onSuccess) {
        onSuccess(cleanCab);
      }
      onClose();
    } catch (err: any) {
      console.error('Error adding cab:', err);
      setErrorMsg(err.message || 'Failed to save cab to database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 my-8 text-[#1c1917]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl shadow-xs">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#1c1917]">Add New Cab</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300">
                  Live Fleet
                </span>
              </div>
              <p className="text-xs text-[#78716c] mt-0.5">
                Register a commercial vehicle and assign a driver for real-time tracking.
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-add-cab-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cab Number & Driver Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center justify-between">
                <span>Cab Registration Number *</span>
                {isDuplicate && (
                  <span className="text-[10px] text-amber-700 font-normal">
                    Already exists (will update)
                  </span>
                )}
              </label>
              <div className="relative">
                <Car className="w-4 h-4 text-[#78716c] absolute left-3 top-2.5" />
                <input
                  type="text"
                  id="input-new-cab-number"
                  required
                  placeholder="e.g. DL-01-AB-1234"
                  value={cabNumber}
                  onChange={(e) => setCabNumber(e.target.value.toUpperCase())}
                  className="w-full bg-[#faf7f2] border border-[#ded7c8] focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-[#1c1917] font-mono placeholder-[#a8a29e] focus:outline-none transition uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#57534e] mb-1.5">
                Driver Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#78716c] absolute left-3 top-2.5" />
                <input
                  type="text"
                  id="input-new-driver-name"
                  required
                  placeholder="e.g. Rajesh Kumar"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#ded7c8] focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Driver Phone & Initial Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#57534e] mb-1.5">
                Driver Contact Phone *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#78716c] absolute left-3 top-2.5" />
                <input
                  type="tel"
                  id="input-new-driver-phone"
                  required
                  placeholder="e.g. +91 98765 43210"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#ded7c8] focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-[#1c1917] font-mono placeholder-[#a8a29e] focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#57534e] mb-1.5">
                Initial Operational Status
              </label>
              <select
                id="select-new-cab-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as FleetCabStatus)}
                className="w-full bg-[#faf7f2] border border-[#ded7c8] focus:border-amber-500 rounded-xl px-3 py-2 text-xs sm:text-sm text-[#1c1917] focus:outline-none transition"
              >
                <option value="cab_off_duty">Cab Off Duty (Idle / Handover)</option>
                <option value="reported_at_hub">Reported At Hub (Checked-in Depot)</option>
                <option value="on_duty">On Duty (Currently Driving)</option>
              </select>
            </div>
          </div>

          {/* Vehicle Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#57534e] mb-1.5">
              Vehicle Model / Type
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {VEHICLE_TYPES.map((vt) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => {
                    setVehicleType(vt);
                    setCustomVehicleType('');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs transition border cursor-pointer ${
                    vehicleType === vt
                      ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold shadow-xs'
                      : 'bg-[#faf7f2] text-[#78716c] hover:text-[#1c1917] border-[#ded7c8]'
                  }`}
                >
                  {vt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setVehicleType('Other')}
                className={`px-2.5 py-1 rounded-lg text-xs transition border cursor-pointer ${
                  vehicleType === 'Other'
                    ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold shadow-xs'
                    : 'bg-[#faf7f2] text-[#78716c] hover:text-[#1c1917] border-[#ded7c8]'
                }`}
              >
                Other / Custom
              </button>
            </div>
            {vehicleType === 'Other' && (
              <input
                type="text"
                id="input-custom-vehicle-type"
                placeholder="Enter custom vehicle model (e.g. Mercedes E-Class)"
                value={customVehicleType}
                onChange={(e) => setCustomVehicleType(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#ded7c8] focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none transition"
              />
            )}
          </div>

          {/* Site / Location Assignment */}
          <div>
            <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-700" />
                <span>Site / Location *</span>
              </span>
              {userProfile?.role === 'supervisor' && (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  Bound to your Supervisor Site
                </span>
              )}
            </label>
            {userProfile?.role === 'supervisor' && userProfile?.site ? (
              <div className="w-full bg-[#f0ede6] border border-[#ded7c8] rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-[#1c1917] flex items-center justify-between">
                <span>{userProfile.site}</span>
                <span className="text-[11px] text-[#78716c] font-normal">Assigned</span>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {DEFAULT_SITES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSite(s);
                        setCustomSite('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs transition border cursor-pointer ${
                        site === s
                          ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold shadow-xs'
                          : 'bg-[#faf7f2] text-[#78716c] hover:text-[#1c1917] border-[#ded7c8]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSite('Other')}
                    className={`px-2.5 py-1 rounded-lg text-xs transition border cursor-pointer ${
                      site === 'Other'
                        ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold shadow-xs'
                        : 'bg-[#faf7f2] text-[#78716c] hover:text-[#1c1917] border-[#ded7c8]'
                    }`}
                  >
                    Other Site
                  </button>
                </div>
                {site === 'Other' && (
                  <input
                    type="text"
                    id="input-custom-site"
                    placeholder="Enter custom site or location name..."
                    value={customSite}
                    onChange={(e) => setCustomSite(e.target.value)}
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none transition"
                  />
                )}
              </div>
            )}
          </div>

          {/* Base Hub Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#57534e] mb-1.5">
              Base Hub / Depot
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {BASE_HUBS.map((hub) => (
                <button
                  key={hub}
                  type="button"
                  onClick={() => {
                    setBaseHub(hub);
                    setCustomBaseHub('');
                    if (!locationText) {
                      setLocationText(`${hub} (Base Depot)`);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs transition border cursor-pointer ${
                    baseHub === hub
                      ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-semibold shadow-xs'
                      : 'bg-[#faf7f2] text-[#78716c] hover:text-[#1c1917] border-[#ded7c8]'
                  }`}
                >
                  {hub}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBaseHub('Other')}
                className={`px-2.5 py-1 rounded-lg text-xs transition border cursor-pointer ${
                  baseHub === 'Other'
                    ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-semibold shadow-xs'
                    : 'bg-[#faf7f2] text-[#78716c] hover:text-[#1c1917] border-[#ded7c8]'
                }`}
              >
                Other Hub
              </button>
            </div>
            {baseHub === 'Other' && (
              <input
                type="text"
                id="input-custom-base-hub"
                placeholder="Enter depot or base hub name"
                value={customBaseHub}
                onChange={(e) => setCustomBaseHub(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#ded7c8] focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none transition"
              />
            )}
          </div>

          {/* Current / Initial Standing Location */}
          <div className="p-3.5 bg-[#faf7f2] rounded-xl border border-[#ded7c8] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#57534e]">
                <MapPin className="w-3.5 h-3.5 text-amber-700" />
                <span>Initial Standing Location & GPS</span>
              </div>
              <button
                type="button"
                id="btn-detect-location-add-cab"
                onClick={handleDetectCurrentLocation}
                disabled={isDetectingGps}
                className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
              >
                <LocateFixed className={`w-3.5 h-3.5 ${isDetectingGps ? 'animate-spin' : ''}`} />
                <span>{isDetectingGps ? 'Detecting...' : 'Use My Current GPS'}</span>
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-[#78716c] mb-1">
                Standing Location Name / Landmark
              </label>
              <input
                type="text"
                id="input-new-cab-location-text"
                placeholder="e.g. Terminal 3 Arrivals, New Delhi (Leave blank for Hub name)"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                className="w-full bg-white border border-[#ded7c8] focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#78716c] mb-1">Latitude</label>
                <input
                  type="text"
                  id="input-new-cab-lat"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="28.5562"
                  className="w-full bg-white border border-[#ded7c8] focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-[#1c1917] font-mono placeholder-[#a8a29e] focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#78716c] mb-1">Longitude</label>
                <input
                  type="text"
                  id="input-new-cab-lng"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="77.1000"
                  className="w-full bg-white border border-[#ded7c8] focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-[#1c1917] font-mono placeholder-[#a8a29e] focus:outline-none transition"
                />
              </div>
            </div>

            {/* Checkbox for initial location punch */}
            <label className="flex items-center gap-2 pt-1 text-xs text-[#44403c] cursor-pointer select-none">
              <input
                type="checkbox"
                id="checkbox-initial-punch-log"
                checked={logInitialPunch}
                onChange={(e) => setLogInitialPunch(e.target.checked)}
                className="w-4 h-4 rounded border-[#ded7c8] bg-white text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-700" />
                Also record in Date-Wise Location Reports for this month
              </span>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e6e0d4]">
            <button
              type="button"
              id="btn-cancel-add-cab"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-submit-add-cab"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isSubmitting ? (
                <span className="animate-pulse">Saving to Fleet...</span>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Add Cab to Fleet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
