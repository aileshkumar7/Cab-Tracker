import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FleetCab, Duty, cleanCabForCompare, FleetCabStatus, DriverShiftType, DriverSlotType } from '../types';
import { getCurrentGPSPosition, reverseGeocode, GeolocationResult } from '../lib/geolocation';
import { formatTimeAgo } from '../lib/timeAgo';
import {
  getPendingOfflineActions,
  savePendingOfflineAction,
  syncPendingOfflineActions,
  PendingOfflineAction,
} from '../lib/offlineSync';
import { AnimatedCheckmark } from './AnimatedCheckmark';
import {
  Car,
  UserCheck,
  LogOut,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Navigation,
  Check,
  Building2,
  Compass,
  Download,
  WifiOff,
  CloudUpload,
  Radio,
  MapPinOff,
  ShieldAlert,
  Edit3,
  PlayCircle,
  Sun,
  Moon,
  Timer,
  AlertTriangle,
  RotateCcw,
  Users,
} from 'lucide-react';

// Shift and Duty Duration Constants: 12h Standard Shift + 2h Grace Buffer = 14h Hard Max Limit
const STANDARD_SHIFT_MS = 12 * 60 * 60 * 1000; // 12 hours (43,200,000 ms)
const BUFFER_PERIOD_MS = 2 * 60 * 60 * 1000;   // 2 hours buffer (7,200,000 ms)
const MAX_DUTY_MS = STANDARD_SHIFT_MS + BUFFER_PERIOD_MS; // 14 hours total (50,400,000 ms)

const getDutyElapsedMs = (duty: Duty | null, simulatedOffsetMs: number = 0): number => {
  if (!duty?.startTime) return 0;
  let startMs = 0;
  if (typeof (duty.startTime as any)?.toMillis === 'function') {
    startMs = (duty.startTime as any).toMillis();
  } else if (duty.startTime instanceof Date) {
    startMs = duty.startTime.getTime();
  } else if (typeof duty.startTime === 'string' || typeof duty.startTime === 'number') {
    startMs = new Date(duty.startTime).getTime();
  }
  if (!startMs || isNaN(startMs)) return 0;
  return Math.max(0, (Date.now() - startMs) + simulatedOffsetMs);
};

const normalizePhone = (p?: string): string => {
  if (!p) return '';
  return p.replace(/\D/g, '').slice(-10);
};

const normalizeCab = (c?: string): string => {
  if (!c) return '';
  return c.trim().toUpperCase().replace(/\s+/g, '');
};

// Calculate geodesic distance between two GPS coordinates in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const DriverDutyScreen: React.FC = () => {
  const { userProfile, updateProfile, signOut } = useAuth();

  // Selected or Entered Cab Number
  const [cabNumberInput, setCabNumberInput] = useState<string>(() => {
    return (
      userProfile?.cabNumber ||
      localStorage.getItem('driver_assigned_cab') ||
      'HR55BD0168'
    );
  });
  const [isEditingCab, setIsEditingCab] = useState(false);
  const [tempCabInput, setTempCabInput] = useState('');

  // Firestore live state
  const [assignedCab, setAssignedCab] = useState<FleetCab | null>(null);
  const [activeDuty, setActiveDuty] = useState<Duty | null>(null);
  const [fleetDocId, setFleetDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Manual GPS Location Punch State (Location is strictly captured ONLY when driver taps "Punch Current Location")
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [lastPunchedTime, setLastPunchedTime] = useState<Date | null>(null);
  const [lastTrackedLocationText, setLastTrackedLocationText] = useState<string | null>(null);
  const currentSpeedKmh = 0;

  // Online / Offline Status & Sync State
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Action / Confirmation flow states
  const [isCapturingGPS, setIsCapturingGPS] = useState(false);
  const [capturedLocation, setCapturedLocation] = useState<GeolocationResult | null>(null);
  const [pendingAction, setPendingAction] = useState<'start_duty' | 'end_duty' | 'report_hub' | 'punch_location' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const punchingRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPunchingLocation, setIsPunchingLocation] = useState(false);
  const [showCustomLocationModal, setShowCustomLocationModal] = useState(false);
  const [customLocationText, setCustomLocationText] = useState('');

  // Success Checkmark Animation Modal State
  const [showCheckmarkModal, setShowCheckmarkModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isQueuedOffline, setIsQueuedOffline] = useState(false);

  // 14-Hour Duty Duration Limit (12h Shift + 2h Grace Buffer) States
  const [elapsedDutyMs, setElapsedDutyMs] = useState<number>(0);
  const [show14hExpiredModal, setShow14hExpiredModal] = useState(false);
  const [simulatedOffsetMs, setSimulatedOffsetMs] = useState<number>(0);
  const [showDevSimulator, setShowDevSimulator] = useState(false);
  const autoConcludedProcessedRef = useRef(false);

  // Shift & Induction Switcher Modal State
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [isSwitchingShift, setIsSwitchingShift] = useState(false);

  // PWA Install Prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Update pending queue count
  const refreshPendingCount = useCallback(() => {
    const list = getPendingOfflineActions();
    setPendingSyncCount(list.length);
  }, []);

  // Sync runner when network restores
  const triggerOfflineSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncPendingOfflineActions();
      if (res.syncedCount > 0) {
        console.log(`Synced ${res.syncedCount} queued offline actions.`);
      }
    } catch (e) {
      console.error('Error executing offline sync:', e);
    } finally {
      setIsSyncing(false);
      refreshPendingCount();
    }
  }, [isSyncing, refreshPendingCount]);

  // Network status listeners
  useEffect(() => {
    refreshPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      triggerOfflineSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check for un-synced items
    if (navigator.onLine) {
      triggerOfflineSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingCount, triggerOfflineSync]);

  // Catch PWA beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  // Sync cabNumber from userProfile if available
  useEffect(() => {
    if (userProfile?.cabNumber && userProfile.cabNumber !== cabNumberInput) {
      setCabNumberInput(userProfile.cabNumber);
      localStorage.setItem('driver_assigned_cab', userProfile.cabNumber);
    }
  }, [userProfile?.cabNumber, cabNumberInput]);

  // Real-time listener for fleet collection to match assigned cab
  useEffect(() => {
    const normUserPhone = normalizePhone(userProfile?.phoneNumber);
    const normUserName = userProfile?.name?.trim().toLowerCase();
    const targetCab = normalizeCab(cabNumberInput);

    setIsLoading(true);

    // Listen to fleet collection
    const qFleet = query(collection(db, 'fleet'));
    const unsubFleet = onSnapshot(
      qFleet,
      (snapshot) => {
        let matchedDoc: { id: string; data: FleetCab } | null = null;

        snapshot.forEach((d) => {
          const data = d.data() as FleetCab;
          const cabNorm = normalizeCab(data.cabNumber);
          const phoneNorm = normalizePhone(data.driverPhone);
          const nameNorm = data.driverName?.trim().toLowerCase();

          // Match by cabNumber (normalized or clean alphanumeric), or phone, or driverName
          const targetClean = cleanCabForCompare(targetCab);
          const cabClean = cleanCabForCompare(data.cabNumber);
          if (targetCab && (cabNorm === targetCab || (targetClean && cabClean === targetClean))) {
            matchedDoc = { id: d.id, data };
          } else if (normUserPhone && phoneNorm && phoneNorm === normUserPhone) {
            matchedDoc = { id: d.id, data };
          } else if (normUserName && nameNorm && nameNorm === normUserName) {
            matchedDoc = { id: d.id, data };
          }
        });

        if (matchedDoc) {
          setAssignedCab({ id: (matchedDoc as any).id, ...(matchedDoc as any).data });
          setFleetDocId((matchedDoc as any).id);
          if ((matchedDoc as any).data?.cabNumber && (matchedDoc as any).data.cabNumber !== cabNumberInput) {
            setCabNumberInput((matchedDoc as any).data.cabNumber);
          }
        } else {
          setAssignedCab(null);
          setFleetDocId(null);
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('Driver cab listener error:', err);
        setIsLoading(false);
      }
    );

    // Listen to duties collection for active duties
    const qDuties = query(
      collection(db, 'duties'),
      where('status', '==', 'active')
    );
    const unsubDuties = onSnapshot(
      qDuties,
      (snapshot) => {
        let matchedDuty: { id: string; data: Duty } | null = null;
        snapshot.forEach((d) => {
          const data = d.data() as Duty;
          const cabNorm = normalizeCab(data.cabNumber);
          const nameNorm = data.driverName?.trim().toLowerCase();

          if (targetCab && cabNorm === targetCab) {
            matchedDuty = { id: d.id, data };
          } else if (normUserName && nameNorm && nameNorm === normUserName) {
            matchedDuty = { id: d.id, data };
          }
        });

        if (matchedDuty) {
          setActiveDuty({ id: (matchedDuty as any).id, ...(matchedDuty as any).data });
        } else {
          setActiveDuty(null);
        }
      },
      (err) => console.error('Driver duty listener error:', err)
    );

    return () => {
      unsubFleet();
      unsubDuties();
    };
  }, [userProfile?.name, userProfile?.phoneNumber, cabNumberInput]);

  // 14-Hour Continuous Duty Duration Limit (12h standard + 2h buffer) Auto-Conclusion Handler
  const handleAutoConclude14h = useCallback(async () => {
    if (autoConcludedProcessedRef.current) return;
    autoConcludedProcessedRef.current = true;

    const cabNumber = normalizeCab(assignedCab?.cabNumber || cabNumberInput || userProfile?.cabNumber || 'HR55BD0168');
    const driverName = userProfile?.name?.trim() || 'Driver';
    const driverPhone = userProfile?.phoneNumber?.trim() || '';
    const now = serverTimestamp();

    try {
      // 1. Conclude duty in Firestore
      if (activeDuty?.id) {
        await updateDoc(doc(db, 'duties', activeDuty.id), {
          status: 'completed',
          endTime: now,
          concludedReason: 'shift_limit_exceeded',
          endLocationText: (lastTrackedLocationText || 'Current GPS Location') + ' [Auto-concluded: 14h shift limit exceeded]',
        });

        // Conclude Attendance Punch Record
        try {
          const attQ = query(collection(db, 'attendance'), where('dutyId', '==', activeDuty.id));
          const attSnap = await getDocs(attQ);
          if (!attSnap.empty) {
            await updateDoc(doc(db, 'attendance', attSnap.docs[0].id), {
              punchOutTime: now,
              punchOutLocation: (lastTrackedLocationText || 'Current GPS Location') + ' [Auto-concluded: 14h shift limit]',
              status: 'completed',
              totalHoursWorked: 14,
            });
          }
        } catch (attErr) {
          console.warn('Auto-conclude attendance update notice:', attErr);
        }
      }

      // 2. Set cab off duty in fleet
      const targetFleetDocId = fleetDocId || assignedCab?.id;
      if (targetFleetDocId) {
        await updateDoc(doc(db, 'fleet', targetFleetDocId), {
          status: 'cab_off_duty',
          dutyEndLocation: (lastTrackedLocationText || 'Current GPS Location') + ' (14h Shift Concluded)',
          dutyEndedAt: now,
          lastUpdated: now,
        });
      }

      // 3. Supervisor Notification
      await addDoc(collection(db, 'notifications'), {
        type: 'shift_concluded_14h',
        cabNumber,
        driverName,
        locationText: lastTrackedLocationText || 'On Route',
        lat: assignedCab?.currentLocationLat || 28.5355,
        lng: assignedCab?.currentLocationLng || 77.391,
        timestamp: now,
        read: false,
        notes: `Duty auto-concluded after 12h + 2h buffer (14 hours total). Driver re-login required to continue.`,
      });

      // 4. Audit Location Log
      await addDoc(collection(db, 'location_logs'), {
        cabNumber,
        driverName,
        driverPhone,
        vehicleType: assignedCab?.vehicleType || 'Commercial Sedan',
        eventType: 'shift_concluded_14h',
        locationText: lastTrackedLocationText || 'On Route',
        lat: assignedCab?.currentLocationLat || 28.5355,
        lng: assignedCab?.currentLocationLng || 77.391,
        dutyId: activeDuty?.id || null,
        speed: 0,
        notes: 'Duty concluded: 14-Hour maximum shift limit reached (12h standard + 2h buffer). Re-login required.',
        timestamp: now,
      });
    } catch (concludeErr) {
      console.error('Auto-conclude 14h error:', concludeErr);
    } finally {
      setActiveDuty(null);
      setShow14hExpiredModal(true);
    }
  }, [assignedCab, cabNumberInput, userProfile, activeDuty, fleetDocId, lastTrackedLocationText]);

  // Continuous timer to monitor shift elapsed time and trigger 14h conclusion
  useEffect(() => {
    if (!activeDuty) {
      setElapsedDutyMs(0);
      autoConcludedProcessedRef.current = false;
      return;
    }

    const checkDutyElapsed = () => {
      const elapsed = getDutyElapsedMs(activeDuty, simulatedOffsetMs);
      setElapsedDutyMs(elapsed);

      // 14-Hour Hard Max Limit Check (12h standard + 2h buffer = 14h total)
      if (elapsed >= MAX_DUTY_MS && !autoConcludedProcessedRef.current) {
        handleAutoConclude14h();
      }
    };

    checkDutyElapsed();
    const interval = setInterval(checkDutyElapsed, 4000);
    return () => clearInterval(interval);
  }, [activeDuty, simulatedOffsetMs, handleAutoConclude14h]);

  // Handle Driver Shift Switch (1st Driver Morning <-> 2nd Driver Night)
  const handleUpdateShift = async (newShift: DriverShiftType, newSlot: DriverSlotType) => {
    setIsSwitchingShift(true);
    try {
      if (updateProfile) {
        await updateProfile({ shift: newShift, driverSlot: newSlot });
      }

      // If assigned to a cab in fleet, update fleet doc with the driver's roster
      const targetDocId = fleetDocId || assignedCab?.id;
      if (targetDocId) {
        const updatePayload: any = {
          currentShift: newShift,
          activeDriverSlot: newSlot,
        };
        if (newSlot === 'second') {
          updatePayload.secondDriverName = userProfile?.name?.trim() || 'Driver';
          updatePayload.secondDriverPhone = userProfile?.phoneNumber?.trim() || '';
          updatePayload.secondDriverShift = 'night_12h';
        } else {
          updatePayload.firstDriverName = userProfile?.name?.trim() || 'Driver';
          updatePayload.firstDriverPhone = userProfile?.phoneNumber?.trim() || '';
          updatePayload.firstDriverShift = 'morning_12h';
        }
        await updateDoc(doc(db, 'fleet', targetDocId), updatePayload);
      }

      setShowShiftModal(false);
      setSuccessMessage(
        `Shift updated to ${newSlot === 'first' ? '1st Driver (12 hrs Shift)' : '2nd Driver (12 hrs Shift)'}`
      );
      setShowCheckmarkModal(true);
      setTimeout(() => setShowCheckmarkModal(false), 2400);
    } catch (err: any) {
      console.error('Error updating shift:', err);
      setActionError(err.message || 'Could not update shift.');
    } finally {
      setIsSwitchingShift(false);
    }
  };

  // Monitor location permission state in browser
  useEffect(() => {
    if (typeof navigator !== 'undefined' && (navigator as any).permissions?.query) {
      (navigator as any).permissions
        .query({ name: 'geolocation' })
        .then((permissionStatus: any) => {
          if (permissionStatus.state === 'denied') {
            setLocationPermissionDenied(true);
          } else if (permissionStatus.state === 'granted') {
            setLocationPermissionDenied(false);
          }
          permissionStatus.onchange = () => {
            if (permissionStatus.state === 'denied') {
              setLocationPermissionDenied(true);
            } else if (permissionStatus.state === 'granted') {
              setLocationPermissionDenied(false);
            }
          };
        })
        .catch(() => {});
    }
  }, []);

  // Retry or test location permission
  const handleRetryLocationPermission = async () => {
    setActionError(null);
    try {
      const loc = await getCurrentGPSPosition();
      setLocationPermissionDenied(false);
      setCapturedLocation(loc);
    } catch (err: any) {
      if (err?.code === 1 || err?.message?.includes('denied')) {
        setLocationPermissionDenied(true);
      }
      setActionError(err.message || 'Location permission not granted.');
    }
  };

  // Step 1: Trigger GPS Capture for START DUTY / PUNCH IN (Explicit Driver Action)
  const handleInitiateStartDuty = async () => {
    setActionError(null);
    setIsCapturingGPS(true);
    setPendingAction('start_duty');

    try {
      const location = await getCurrentGPSPosition();
      setCapturedLocation(location);
    } catch (err: any) {
      console.error('GPS Capture error:', err);
      if (err?.code === 1 || err?.message?.includes('denied')) {
        setLocationPermissionDenied(true);
      }
      setActionError(err.message || 'Could not retrieve GPS location.');
      setPendingAction(null);
    } finally {
      setIsCapturingGPS(false);
    }
  };

  // Step 1: Trigger GPS Capture for END DUTY (Explicit Driver Action)
  const handleInitiateEndDuty = async () => {
    setActionError(null);
    setIsCapturingGPS(true);
    setPendingAction('end_duty');

    try {
      const location = await getCurrentGPSPosition();
      setCapturedLocation(location);
    } catch (err: any) {
      console.error('GPS Capture error:', err);
      if (err?.code === 1 || err?.message?.includes('denied')) {
        setLocationPermissionDenied(true);
      }
      setActionError(err.message || 'Could not retrieve GPS location.');
      setPendingAction(null);
    } finally {
      setIsCapturingGPS(false);
    }
  };

  // Dedicated Direct Punch Location Method (1-Click Instant Execution)
  const executePunchLocation = async (location: GeolocationResult) => {
    setIsSubmitting(true);
    setActionError(null);

    const activeCabNumber = assignedCab?.cabNumber || cabNumberInput || userProfile?.cabNumber || 'KA-01-AB-1024';
    const driverName = userProfile?.name?.trim() || assignedCab?.driverName || 'Driver';
    const driverPhone = userProfile?.phoneNumber?.trim() || assignedCab?.driverPhone || '';
    const now = serverTimestamp();

    if (!navigator.onLine) {
      // Offline fallback
      const offlineAction: PendingOfflineAction = {
        id: `offline-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: 'punch_location',
        timestamp: Date.now(),
        cabNumber: activeCabNumber,
        driverName,
        driverPhone,
        dutyId: activeDuty?.id || null,
        fleetDocId: fleetDocId || null,
        latitude: location.latitude,
        longitude: location.longitude,
        locationText: location.locationText,
      };

      savePendingOfflineAction(offlineAction);
      refreshPendingCount();

      if (assignedCab) {
        setAssignedCab({
          ...assignedCab,
          currentLocationLat: location.latitude,
          currentLocationLng: location.longitude,
          currentLocationText: location.locationText,
          lastPunchedLocation: location.locationText,
          lastPunchedLat: location.latitude,
          lastPunchedLng: location.longitude,
        });
      }
      setLastTrackedLocationText(location.locationText);
      setIsQueuedOffline(true);
      setShowCheckmarkModal(true);
      setSuccessMessage(`Location punched offline: "${location.locationText}". Will sync automatically.`);
      setTimeout(() => setShowCheckmarkModal(false), 2600);
      setIsSubmitting(false);
      return;
    }

    try {
      // Find fleet document: by fleetDocId, assignedCab.id, or query
      let docId = fleetDocId || assignedCab?.id;
      const cleanTarget = cleanCabForCompare(activeCabNumber);
      const cleanUserPhone = normalizePhone(driverPhone);
      const cleanUserName = driverName.toLowerCase().trim();

      if (!docId) {
        const fleetSnap = await getDocs(collection(db, 'fleet'));
        fleetSnap.forEach((d) => {
          const fData = d.data() as FleetCab;
          if (
            cleanCabForCompare(fData.cabNumber) === cleanTarget ||
            (cleanUserPhone && normalizePhone(fData.driverPhone) === cleanUserPhone) ||
            (cleanUserName && fData.driverName?.toLowerCase().trim() === cleanUserName)
          ) {
            docId = d.id;
          }
        });
      }

      // When driver punches location, cab standing status and vehicle status is Free at this punched location
      const updatedStatus: FleetCabStatus = 'free';

      if (docId) {
        setFleetDocId(docId);
        await updateDoc(doc(db, 'fleet', docId), {
          cabNumber: activeCabNumber,
          driverName,
          driverPhone,
          status: 'free',
          standingStatus: 'free',
          currentLocationLat: location.latitude,
          currentLocationLng: location.longitude,
          currentLocationText: location.locationText,
          lastPunchedLocation: location.locationText,
          lastPunchedLat: location.latitude,
          lastPunchedLng: location.longitude,
          lastPunchedAt: now,
          lastUpdated: now,
        });
      } else {
        const newRef = await addDoc(collection(db, 'fleet'), {
          cabNumber: activeCabNumber,
          driverName,
          driverPhone,
          vehicleType: 'Commercial Sedan',
          baseHub: 'Main Hub',
          status: 'free',
          standingStatus: 'free',
          currentLocationLat: location.latitude,
          currentLocationLng: location.longitude,
          currentLocationText: location.locationText,
          lastPunchedLocation: location.locationText,
          lastPunchedLat: location.latitude,
          lastPunchedLng: location.longitude,
          lastPunchedAt: now,
          lastUpdated: now,
          assignedSupervisor: 'Operations',
        });
        docId = newRef.id;
        setFleetDocId(newRef.id);
      }

      // Add real-time notification
      await addDoc(collection(db, 'notifications'), {
        type: 'location_punch',
        cabNumber: activeCabNumber,
        driverName,
        locationText: location.locationText,
        lat: location.latitude,
        lng: location.longitude,
        timestamp: now,
        read: false,
      });

      // Add audit location log for billing & date-wise reports
      try {
        await addDoc(collection(db, 'location_logs'), {
          cabNumber: activeCabNumber,
          driverName,
          driverPhone,
          vehicleType: assignedCab?.vehicleType || 'Commercial Sedan',
          eventType: 'location_punch',
          locationText: location.locationText,
          lat: location.latitude,
          lng: location.longitude,
          dutyId: activeDuty?.id || null,
          speed: currentSpeedKmh || 0,
          notes: 'Driver location punch',
          timestamp: now,
        });
      } catch (logErr) {
        console.debug('Audit log write notice:', logErr);
      }

      setLastPunchedTime(new Date());
      setLastTrackedLocationText(location.locationText);
      if (assignedCab) {
        setAssignedCab({
          ...assignedCab,
          currentLocationLat: location.latitude,
          currentLocationLng: location.longitude,
          currentLocationText: location.locationText,
          lastPunchedLocation: location.locationText,
          lastPunchedLat: location.latitude,
          lastPunchedLng: location.longitude,
          status: updatedStatus,
        });
      }

      setShowCheckmarkModal(true);
      setSuccessMessage(`Location Punched: "${location.locationText}". Updated live on Admin Dashboard!`);
      setTimeout(() => setShowCheckmarkModal(false), 2600);
    } catch (err: any) {
      console.error('Error saving punch to database:', err);
      setActionError('Error saving punch to dashboard: ' + (err.message || 'Network error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 1: Trigger GPS Capture for 1-Click PUNCH CURRENT LOCATION
  const handleInitiatePunchLocation = async () => {
    if (punchingRef.current || isSubmitting) return;
    punchingRef.current = true;
    setActionError(null);
    setIsCapturingGPS(true);
    setIsPunchingLocation(true);

    try {
      const location = await getCurrentGPSPosition();
      setCapturedLocation(location);
      await executePunchLocation(location);
    } catch (err: any) {
      console.error('GPS Capture error:', err);
      if (err?.code === 1 || err?.message?.includes('denied')) {
        setLocationPermissionDenied(true);
      }
      setActionError(err.message || 'Could not retrieve GPS location.');
    } finally {
      setIsCapturingGPS(false);
      setIsPunchingLocation(false);
      punchingRef.current = false;
    }
  };

  // Manual Custom Location Punch
  const handlePunchCustomLocation = async () => {
    const text = customLocationText.trim();
    if (!text) return;
    setShowCustomLocationModal(false);
    setCustomLocationText('');
    const manualLocation: GeolocationResult = {
      latitude: assignedCab?.currentLocationLat || 12.9716,
      longitude: assignedCab?.currentLocationLng || 77.5946,
      accuracy: 5,
      locationText: text,
    };
    await executePunchLocation(manualLocation);
  };

  // Step 1: Trigger GPS Capture for REPORTED AT HUB (fallback compatibility)
  const handleInitiateReportHub = async () => {
    return handleInitiatePunchLocation();
  };

  // Cancel confirmation
  const handleCancelConfirmation = () => {
    setPendingAction(null);
    setCapturedLocation(null);
    setActionError(null);
  };

  // Save updated Cab Number manually
  const handleSaveCabNumber = async () => {
    const clean = normalizeCab(tempCabInput);
    if (!clean) return;
    setCabNumberInput(clean);
    localStorage.setItem('driver_assigned_cab', clean);
    setIsEditingCab(false);
    if (updateProfile) {
      await updateProfile({ cabNumber: clean });
    }
  };

  // Step 2 & 3: Confirm action (writes to Firestore and updates live GPS)
  const handleConfirmAction = async () => {
    if (submittingRef.current || !capturedLocation || !pendingAction) return;
    submittingRef.current = true;

    setIsSubmitting(true);
    setActionError(null);

    const cabNumber = normalizeCab(assignedCab?.cabNumber || cabNumberInput || 'HR55BD0168');
    const driverName = userProfile?.name?.trim() || 'Saurabh';
    const driverPhone = userProfile?.phoneNumber?.trim() || '9555907001';
    const now = serverTimestamp();

    const currentlyOffline = !navigator.onLine;

    if (currentlyOffline) {
      // Offline fallback: Save action locally to phone's localStorage
      const offlineAction: PendingOfflineAction = {
        id: `offline-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: pendingAction,
        timestamp: Date.now(),
        cabNumber,
        driverName,
        driverPhone,
        dutyId: activeDuty?.id || null,
        fleetDocId: fleetDocId || null,
        latitude: capturedLocation.latitude,
        longitude: capturedLocation.longitude,
        locationText: capturedLocation.locationText,
        driverSlot: userProfile?.driverSlot || 'first',
      };

      savePendingOfflineAction(offlineAction);
      refreshPendingCount();

      // Optimistically update local view states
      if (pendingAction === 'start_duty') {
        setActiveDuty({
          cabNumber,
          driverName,
          startLocationText: capturedLocation.locationText,
          startTime: new Date().toISOString(),
          endLocationText: '',
          endTime: null,
          status: 'active',
          assignedBy: 'Driver Self-Punch',
        });
        if (assignedCab) {
          setAssignedCab({ ...assignedCab, status: 'on_duty', cabNumber, driverName, driverPhone });
        }
        setSuccessMessage('Duty started! Saved offline on phone.');
      } else if (pendingAction === 'end_duty') {
        setActiveDuty(null);
        if (assignedCab) {
          setAssignedCab({ ...assignedCab, status: 'cab_off_duty' });
        }
        setSuccessMessage('Duty ended. Cab is now Off Duty.');
      } else if (pendingAction === 'punch_location') {
        if (assignedCab) {
          setAssignedCab({
            ...assignedCab,
            currentLocationLat: capturedLocation.latitude,
            currentLocationLng: capturedLocation.longitude,
            currentLocationText: capturedLocation.locationText,
          });
        }
        setLastTrackedLocationText(capturedLocation.locationText);
        setSuccessMessage('Current location punched! Saved offline on phone.');
      } else {
        if (assignedCab) {
          setAssignedCab({ ...assignedCab, status: 'reported_at_hub' });
        }
        setSuccessMessage('Reported at Hub recorded.');
      }

      setIsQueuedOffline(true);
      setShowCheckmarkModal(true);
      setIsSubmitting(false);
      submittingRef.current = false;
      setPendingAction(null);
      setCapturedLocation(null);

      setTimeout(() => {
        setShowCheckmarkModal(false);
      }, 3200);
      return;
    }

    // Standard Online Flow: Write straight to Firestore
    try {
      if (pendingAction === 'start_duty') {
        const userShift = userProfile?.shift || 'morning_12h';
        const userSlot = userProfile?.driverSlot || 'first';

        const startDutyPayload: any = {
          cabNumber,
          driverName,
          driverPhone,
          activeDriverSlot: userSlot,
          activeDriverName: driverName,
          activeDriverPhone: driverPhone,
          dutyStartedAt: now,
          dutyStartLocation: capturedLocation.locationText,
          status: 'on_duty',
          currentLocationLat: capturedLocation.latitude,
          currentLocationLng: capturedLocation.longitude,
          currentLocationText: capturedLocation.locationText,
          lastUpdated: now,
        };
        if (userSlot === 'second') {
          startDutyPayload.secondDriverName = driverName;
          startDutyPayload.secondDriverPhone = driverPhone;
        } else {
          startDutyPayload.firstDriverName = driverName;
          startDutyPayload.firstDriverPhone = driverPhone;
        }

        // 1. Check or Upsert fleet document
        let docId = fleetDocId;
        if (docId) {
          await updateDoc(doc(db, 'fleet', docId), startDutyPayload);
        } else {
          // Look up if doc with this cab exists
          const qCab = await getDocs(query(collection(db, 'fleet'), where('cabNumber', '==', cabNumber)));
          if (!qCab.empty) {
            docId = qCab.docs[0].id;
            setFleetDocId(docId);
            await updateDoc(doc(db, 'fleet', docId), startDutyPayload);
          } else {
            const newRef = await addDoc(collection(db, 'fleet'), {
              ...startDutyPayload,
              vehicleType: 'Commercial Sedan',
              baseHub: 'Main Hub',
              assignedSupervisor: 'Operations',
            });
            docId = newRef.id;
            setFleetDocId(docId);
          }
        }

        // 2. Create active duty in "duties"
        const dutyRef = await addDoc(collection(db, 'duties'), {
          cabNumber,
          driverName,
          driverPhone,
          shift: userShift,
          driverSlot: userSlot,
          startLocationText: capturedLocation.locationText,
          startTime: now,
          endLocationText: '',
          endTime: null,
          status: 'active',
          assignedBy: 'Driver Self-Punch',
        });

        setActiveDuty({
          id: dutyRef.id,
          cabNumber,
          driverName,
          driverPhone,
          shift: userShift,
          driverSlot: userSlot,
          startLocationText: capturedLocation.locationText,
          startTime: new Date(),
          endLocationText: '',
          endTime: null,
          status: 'active',
          assignedBy: 'Driver Self-Punch',
        });

        autoConcludedProcessedRef.current = false;
        setSimulatedOffsetMs(0);

        // 3. Record Driver Attendance Punch
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          await addDoc(collection(db, 'attendance'), {
            driverName,
            driverPhone,
            cabNumber,
            driverSlot: userSlot,
            driverSlotLabel: userSlot === 'second' ? '2nd Driver' : '1st Driver',
            date: todayStr,
            punchInTime: now,
            punchInLocation: capturedLocation.locationText,
            punchOutTime: null,
            punchOutLocation: null,
            status: 'present',
            dutyId: dutyRef.id,
            createdAt: now,
          });
        } catch (attErr) {
          console.debug('Attendance punch creation notice:', attErr);
        }

        // 4. Create notification for supervisor
        await addDoc(collection(db, 'notifications'), {
          type: 'duty_started',
          cabNumber,
          driverName,
          locationText: capturedLocation.locationText,
          lat: capturedLocation.latitude,
          lng: capturedLocation.longitude,
          timestamp: now,
          read: false,
        });

        // 5. Create location audit log for billing
        try {
          await addDoc(collection(db, 'location_logs'), {
            cabNumber,
            driverName,
            driverPhone,
            vehicleType: assignedCab?.vehicleType || 'Commercial Sedan',
            eventType: 'duty_started',
            locationText: capturedLocation.locationText,
            lat: capturedLocation.latitude,
            lng: capturedLocation.longitude,
            dutyId: dutyRef.id,
            speed: currentSpeedKmh || 0,
            notes: 'Duty commenced',
            timestamp: now,
          });
        } catch (logErr) {
          console.debug('Duty start log notice:', logErr);
        }

        setSuccessMessage('Duty Started! Attendance punched in successfully.');
        setLastPunchedTime(new Date());
        setLastTrackedLocationText(capturedLocation.locationText);
      } else if (pendingAction === 'end_duty') {
        // 1. Update the matching "duties" document
        if (activeDuty?.id) {
          await updateDoc(doc(db, 'duties', activeDuty.id), {
            status: 'completed',
            endTime: now,
            endLocationText: capturedLocation.locationText,
          });

          // Conclude attendance punch-out
          try {
            const attQ = query(collection(db, 'attendance'), where('dutyId', '==', activeDuty.id));
            const attSnap = await getDocs(attQ);
            if (!attSnap.empty) {
              const elapsedDutyMs = getDutyElapsedMs(activeDuty, simulatedOffsetMs);
              const hoursWorked = Math.round((elapsedDutyMs / (1000 * 60 * 60)) * 10) / 10;
              await updateDoc(doc(db, 'attendance', attSnap.docs[0].id), {
                punchOutTime: now,
                punchOutLocation: capturedLocation.locationText,
                status: 'completed',
                totalHoursWorked: hoursWorked,
              });
            }
          } catch (attErr) {
            console.debug('Attendance punch out notice:', attErr);
          }
        }

        // 2. Update the "fleet" document for that cab
        if (fleetDocId) {
          await updateDoc(doc(db, 'fleet', fleetDocId), {
            status: 'cab_off_duty',
            dutyEndLocation: capturedLocation.locationText,
            dutyEndedAt: now,
            currentLocationLat: capturedLocation.latitude,
            currentLocationLng: capturedLocation.longitude,
            currentLocationText: capturedLocation.locationText,
            lastUpdated: now,
          });
        }
        if (assignedCab) {
          setAssignedCab({
            ...assignedCab,
            status: 'cab_off_duty',
            dutyEndLocation: capturedLocation.locationText,
            dutyEndedAt: now,
          });
        }

        // 3. Create notification for supervisor
        await addDoc(collection(db, 'notifications'), {
          type: 'duty_completed',
          cabNumber,
          locationText: capturedLocation.locationText,
          lat: capturedLocation.latitude,
          lng: capturedLocation.longitude,
          timestamp: now,
          read: false,
        });

        // 4. Create location audit log for billing
        try {
          await addDoc(collection(db, 'location_logs'), {
            cabNumber,
            driverName,
            driverPhone,
            vehicleType: assignedCab?.vehicleType || 'Commercial Sedan',
            eventType: 'duty_completed',
            locationText: capturedLocation.locationText,
            lat: capturedLocation.latitude,
            lng: capturedLocation.longitude,
            dutyId: activeDuty?.id || null,
            speed: 0,
            notes: 'Duty trip completed',
            timestamp: now,
          });
        } catch (logErr) {
          console.debug('Duty completion log notice:', logErr);
        }

        setActiveDuty(null);
        setSuccessMessage('Duty ended. Cab is now Off Duty.');
      } else if (pendingAction === 'punch_location') {
        // 1. Update "fleet" document for that cab with new GPS coordinates, address, and punched location (Free standing status)
        let targetDocId = fleetDocId || assignedCab?.id;
        if (targetDocId) {
          await updateDoc(doc(db, 'fleet', targetDocId), {
            cabNumber,
            driverName,
            driverPhone,
            status: 'free',
            standingStatus: 'free',
            currentLocationLat: capturedLocation.latitude,
            currentLocationLng: capturedLocation.longitude,
            currentLocationText: capturedLocation.locationText,
            lastPunchedLocation: capturedLocation.locationText,
            lastPunchedLat: capturedLocation.latitude,
            lastPunchedLng: capturedLocation.longitude,
            lastPunchedAt: now,
            lastUpdated: now,
          });
        } else {
          // Look up if doc with this cab exists
          const qCab = await getDocs(query(collection(db, 'fleet'), where('cabNumber', '==', cabNumber)));
          if (!qCab.empty) {
            const docId = qCab.docs[0].id;
            setFleetDocId(docId);
            await updateDoc(doc(db, 'fleet', docId), {
              driverName,
              driverPhone,
              status: 'free',
              standingStatus: 'free',
              currentLocationLat: capturedLocation.latitude,
              currentLocationLng: capturedLocation.longitude,
              currentLocationText: capturedLocation.locationText,
              lastPunchedLocation: capturedLocation.locationText,
              lastPunchedLat: capturedLocation.latitude,
              lastPunchedLng: capturedLocation.longitude,
              lastPunchedAt: now,
              lastUpdated: now,
            });
          } else {
            const newRef = await addDoc(collection(db, 'fleet'), {
              cabNumber,
              driverName,
              driverPhone,
              vehicleType: 'Commercial Sedan',
              baseHub: 'Main Hub',
              status: 'free',
              standingStatus: 'free',
              currentLocationLat: capturedLocation.latitude,
              currentLocationLng: capturedLocation.longitude,
              currentLocationText: capturedLocation.locationText,
              lastPunchedLocation: capturedLocation.locationText,
              lastPunchedLat: capturedLocation.latitude,
              lastPunchedLng: capturedLocation.longitude,
              lastPunchedAt: now,
              lastUpdated: now,
              assignedSupervisor: 'Operations',
            });
            setFleetDocId(newRef.id);
          }
        }

        // 2. Create location punch notification
        await addDoc(collection(db, 'notifications'), {
          type: 'location_punch',
          cabNumber,
          driverName,
          locationText: capturedLocation.locationText,
          lat: capturedLocation.latitude,
          lng: capturedLocation.longitude,
          timestamp: now,
          read: false,
        });

        // 3. Create audit location log for billing
        try {
          await addDoc(collection(db, 'location_logs'), {
            cabNumber,
            driverName,
            driverPhone,
            vehicleType: assignedCab?.vehicleType || 'Commercial Sedan',
            eventType: 'location_punch',
            locationText: capturedLocation.locationText,
            lat: capturedLocation.latitude,
            lng: capturedLocation.longitude,
            dutyId: activeDuty?.id || null,
            speed: currentSpeedKmh || 0,
            notes: 'Location punch confirmed',
            timestamp: now,
          });
        } catch (logErr) {
          console.debug('Location punch log notice:', logErr);
        }

        if (assignedCab) {
          setAssignedCab({
            ...assignedCab,
            currentLocationLat: capturedLocation.latitude,
            currentLocationLng: capturedLocation.longitude,
            currentLocationText: capturedLocation.locationText,
            lastPunchedLocation: capturedLocation.locationText,
            lastPunchedLat: capturedLocation.latitude,
            lastPunchedLng: capturedLocation.longitude,
          });
        }

        setLastPunchedTime(new Date());
        setLastTrackedLocationText(capturedLocation.locationText);
        setSuccessMessage('Current location punched successfully! Live location updated on dashboard.');
      } else if (pendingAction === 'report_hub') {
        // 1. Update "fleet" document for that cab
        if (fleetDocId) {
          await updateDoc(doc(db, 'fleet', fleetDocId), {
            cabNumber,
            driverName,
            driverPhone,
            status: 'reported_at_hub',
            currentLocationLat: capturedLocation.latitude,
            currentLocationLng: capturedLocation.longitude,
            currentLocationText: capturedLocation.locationText,
            lastUpdated: now,
          });
        } else {
          const newRef = await addDoc(collection(db, 'fleet'), {
            cabNumber,
            driverName,
            driverPhone,
            vehicleType: 'Commercial Sedan',
            baseHub: 'Main Hub',
            status: 'reported_at_hub',
            currentLocationLat: capturedLocation.latitude,
            currentLocationLng: capturedLocation.longitude,
            currentLocationText: capturedLocation.locationText,
            lastUpdated: now,
            assignedSupervisor: 'Operations',
          });
          setFleetDocId(newRef.id);
        }

        // 2. Create notification
        await addDoc(collection(db, 'notifications'), {
          type: 'reported_at_hub',
          cabNumber,
          locationText: capturedLocation.locationText,
          lat: capturedLocation.latitude,
          lng: capturedLocation.longitude,
          timestamp: now,
          read: false,
        });

        // 3. Create audit location log for billing
        try {
          await addDoc(collection(db, 'location_logs'), {
            cabNumber,
            driverName,
            driverPhone,
            vehicleType: assignedCab?.vehicleType || 'Commercial Sedan',
            eventType: 'reported_at_hub',
            locationText: capturedLocation.locationText,
            lat: capturedLocation.latitude,
            lng: capturedLocation.longitude,
            dutyId: null,
            speed: 0,
            notes: 'Reported at hub for duty standby',
            timestamp: now,
          });
        } catch (logErr) {
          console.debug('Hub report log notice:', logErr);
        }

        setLastTrackedLocationText(capturedLocation.locationText);
        setSuccessMessage('Current location punched successfully.');
      }

      setIsQueuedOffline(false);
      setShowCheckmarkModal(true);

      setTimeout(() => {
        setShowCheckmarkModal(false);
      }, 2800);

      setPendingAction(null);
      setCapturedLocation(null);
    } catch (err: any) {
      console.warn('Network write failed, saving to offline sync buffer:', err);
      const fallbackOfflineAction: PendingOfflineAction = {
        id: `offline-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: pendingAction,
        timestamp: Date.now(),
        cabNumber,
        driverName,
        driverPhone,
        dutyId: activeDuty?.id || null,
        fleetDocId: fleetDocId || null,
        latitude: capturedLocation.latitude,
        longitude: capturedLocation.longitude,
        locationText: capturedLocation.locationText,
      };

      savePendingOfflineAction(fallbackOfflineAction);
      refreshPendingCount();

      setIsQueuedOffline(true);
      setSuccessMessage(
        pendingAction === 'start_duty'
          ? 'Duty started! Saved offline.'
          : pendingAction === 'end_duty'
          ? 'Duty ended. Cab is now Off Duty.'
          : 'Reported at Hub recorded.'
      );
      setShowCheckmarkModal(true);

      setTimeout(() => {
        setShowCheckmarkModal(false);
      }, 3200);

      setPendingAction(null);
      setCapturedLocation(null);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const currentCabNumber = assignedCab?.cabNumber || cabNumberInput || 'HR55BD0168';
  const currentStatus = assignedCab?.status || (activeDuty ? 'on_duty' : 'cab_off_duty');
  const hasActiveDuty = !!activeDuty || currentStatus === 'on_duty';
  const canReportHub = currentStatus !== 'reported_at_hub';

  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#1c1917] flex flex-col items-center justify-between p-3 sm:p-5 select-none font-sans">
      {/* Centered Mobile Container */}
      <div className="w-full max-w-md flex-1 flex flex-col justify-between space-y-4">
        
        {/* Top Header Bar */}
        <header className="bg-white border-2 border-[#e6e0d4] rounded-3xl p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3.5">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-md shadow-amber-500/20 shrink-0 border-2 border-amber-400/40 bg-white flex items-center justify-center p-1">
              <img
                src="/icon-192.png"
                alt="Cab Driver Logo"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-xl text-[#1c1917] tracking-tight">Driver Duty</h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <UserCheck className="w-3.5 h-3.5" /> DRIVER
                </span>
              </div>
              <p className="text-xs text-[#78716c] font-medium">Fleet Operations Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sign Out Target (Minimum 48px touch target) */}
            <button
              id="btn-driver-signout"
              onClick={() => signOut()}
              className="min-w-[48px] min-h-[48px] rounded-2xl bg-[#f5f0e6] hover:bg-[#eae3d2] active:bg-[#ded7c8] text-[#44403c] border border-[#ded7c8] transition flex items-center justify-center shadow-xs cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </header>

        {/* Offline & Waiting to Sync Badges */}
        <div className="space-y-2">
          {!isOnline && (
            <div className="bg-amber-100 border-2 border-amber-500 rounded-2xl p-3.5 flex items-center justify-between shadow-xs text-amber-950">
              <div className="flex items-center gap-2.5">
                <WifiOff className="w-5 h-5 text-amber-700 shrink-0 animate-pulse" />
                <div>
                  <div className="text-sm font-black text-amber-950">Offline Mode Active</div>
                  <div className="text-xs text-amber-800">Punches will be saved locally on phone</div>
                </div>
              </div>
              <span className="text-[11px] font-black uppercase px-2 py-1 rounded bg-amber-500 text-[#1c1917]">
                OFFLINE
              </span>
            </div>
          )}

          {pendingSyncCount > 0 && (
            <div
              id="badge-waiting-to-sync"
              className="bg-indigo-50 border-2 border-indigo-400 rounded-2xl p-3 flex items-center justify-between shadow-xs text-indigo-950"
            >
              <div className="flex items-center gap-2.5">
                <CloudUpload
                  className={`w-5 h-5 text-indigo-600 shrink-0 ${
                    isSyncing ? 'animate-bounce' : ''
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <span>Waiting to sync ({pendingSyncCount})</span>
                    {isSyncing && (
                      <span className="text-[10px] text-indigo-600 animate-pulse">
                        • Syncing now...
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-indigo-700">
                    Will auto-sync to Firestore upon network connection.
                  </div>
                </div>
              </div>

              {isOnline && (
                <button
                  type="button"
                  id="btn-manual-sync"
                  onClick={triggerOfflineSync}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* PWA Install Banner if supported */}
        {isInstallable && (
          <div className="bg-white border-2 border-amber-300 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden shadow-xs shrink-0 border-2 border-amber-400/40 bg-white flex items-center justify-center p-0.5">
                <img
                  src="/icon-192.png"
                  alt="Taxi Driver Badge Icon"
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <div className="text-sm font-bold text-[#1c1917] flex items-center gap-1.5">
                  <span>Add Cab Driver to Home Screen</span>
                </div>
                <div className="text-xs text-[#78716c]">Install app with official taxi badge logo</div>
              </div>
            </div>
            <button
              type="button"
              id="btn-pwa-install"
              onClick={handleInstallPWA}
              className="min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-black text-xs shadow-xs transition shrink-0 flex items-center cursor-pointer"
            >
              Install
            </button>
          </div>
        )}

        {/* Location Permission Denied Alert Banner */}
        {locationPermissionDenied && (
          <div
            id="banner-location-permission-denied"
            className="bg-rose-50 border-2 border-rose-400 rounded-3xl p-5 space-y-3.5 shadow-xs text-rose-950 animate-in fade-in"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-200 border border-rose-400 flex items-center justify-center shrink-0 shadow-xs">
                <MapPinOff className="w-6 h-6 text-rose-800 stroke-[2.5]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base sm:text-lg font-black text-rose-950 tracking-tight">
                  Location Access Is Disabled
                </h3>
                <p className="text-xs sm:text-sm text-rose-800 font-medium mt-1 leading-relaxed">
                  Please enable location access in your phone&apos;s browser settings. Duty tracking and live telemetry cannot work without it.
                </p>
              </div>
            </div>

            <div className="bg-rose-100/70 rounded-2xl p-3 text-xs text-rose-900 space-y-1.5 border border-rose-300 font-medium">
              <div className="font-bold text-rose-950 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                How to enable in phone browser:
              </div>
              <div>• Tap the padlock / site settings icon (🔒) next to the website URL.</div>
              <div>• Set <strong>Location</strong> permission to <strong>Allow</strong>.</div>
              <div>• Or go to phone <em>Settings &gt; Apps &gt; Browser &gt; Permissions &gt; Location</em>.</div>
            </div>

            <button
              type="button"
              id="btn-retry-location-permission"
              onClick={handleRetryLocationPermission}
              className="w-full min-h-[48px] rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-sm transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Enable / Retry Location Access</span>
            </button>
          </div>
        )}

        {/* On Duty Status Banner */}
        {hasActiveDuty && pendingAction !== 'end_duty' && !locationPermissionDenied && (
          <div
            id="banner-live-tracking-active"
            className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-3.5 flex items-center justify-between shadow-xs text-emerald-950 animate-in fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-4 w-4 shrink-0">
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 items-center justify-center">
                  <MapPin className="w-2.5 h-2.5 text-white" />
                </span>
              </div>
              <div>
                <div className="text-xs sm:text-sm font-black text-emerald-950 tracking-tight">
                  On Duty — Dynamic 12h Shift Active
                </div>
                <div className="text-[11px] text-emerald-800 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Attendance punched in • Location updates on punch</span>
                  {lastPunchedTime && (
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-400 font-mono font-bold">
                      Last punch: {lastPunchedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {actionError && (
          <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 text-xs sm:text-sm flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-bold">{actionError}</div>
          </div>
        )}

        {/* Top Driver Status Info Card */}
        <div className="bg-white border-2 border-[#e6e0d4] rounded-3xl p-5 space-y-4 shadow-sm">
          {/* Driver Name & Assigned Cab Number */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs uppercase tracking-wider text-[#78716c] font-bold block">
                Driver Name
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-[#1c1917] mt-0.5 tracking-tight">
                {userProfile?.name || 'Saurabh'}
              </h2>
              <div className="text-sm text-[#57534e] font-mono mt-1 font-bold">
                {userProfile?.phoneNumber || '9555907001'}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-xs uppercase text-[#78716c] block font-bold">
                  Assigned Cab
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTempCabInput(currentCabNumber);
                    setIsEditingCab(true);
                  }}
                  className="p-1 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] transition text-xs flex items-center gap-1 cursor-pointer"
                  title="Change Cab Number"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>

              <span className="font-mono font-black text-[#1c1917] text-xl sm:text-2xl bg-amber-100 px-3.5 py-1.5 rounded-2xl border-2 border-amber-300 inline-block mt-0.5 shadow-xs">
                {currentCabNumber}
              </span>
            </div>
          </div>

          {/* Edit Cab Modal / Inline Form */}
          {isEditingCab && (
            <div className="bg-[#faf7f2] border-2 border-amber-400 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in">
              <label className="text-xs font-bold text-amber-900 block">
                Enter / Update Vehicle Number (e.g. HR55BD0168):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempCabInput}
                  onChange={(e) => setTempCabInput(e.target.value.toUpperCase())}
                  placeholder="e.g. HR55BD0168"
                  className="flex-1 bg-white border border-[#ded7c8] rounded-xl px-3 py-2 text-sm text-[#1c1917] font-mono uppercase focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSaveCabNumber}
                  className="px-4 py-2 rounded-xl bg-amber-400 text-[#1c1917] font-bold text-xs hover:bg-amber-300 cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingCab(false)}
                  className="px-3 py-2 rounded-xl bg-[#e6e0d4] text-[#44403c] text-xs hover:bg-[#ded7c8] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Live Status Indicator Bar */}
          <div className="p-4 bg-[#faf7f2] rounded-2xl border-2 border-[#ded7c8] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    hasActiveDuty
                      ? 'bg-emerald-400'
                      : currentStatus === 'reported_at_hub'
                      ? 'bg-cyan-400'
                      : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                    hasActiveDuty
                      ? 'bg-emerald-500'
                      : currentStatus === 'reported_at_hub'
                      ? 'bg-cyan-500'
                      : 'bg-amber-500'
                  }`}
                />
              </span>
              <span className="text-sm font-black text-[#1c1917] uppercase tracking-wider">
                Current Status
              </span>
            </div>

            <span
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider ${
                hasActiveDuty
                  ? 'bg-emerald-500 text-white'
                  : currentStatus === 'reported_at_hub'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-stone-200 text-stone-900 border border-stone-300'
              }`}
            >
              {hasActiveDuty ? 'ON DUTY' : currentStatus === 'reported_at_hub' ? 'AVAILABLE' : 'CAB OFF DUTY'}
            </span>
          </div>
        </div>

        {/* PRIMARY ACTIONS AREA (TRANSFERRED UPWARD: Start Duty / Punch In, Punch Current Location, Enter Manual Location) */}
        <div id="driver-primary-actions-top" className="space-y-3.5 py-1">
          {/* GPS Capturing Loading Screen */}
          {isCapturingGPS ? (
            <div className="bg-white border-2 border-[#e6e0d4] rounded-3xl p-8 text-center space-y-4 shadow-xl">
              <div className="w-20 h-20 rounded-full bg-amber-100 border-4 border-amber-400 flex items-center justify-center mx-auto animate-pulse">
                <Compass className="w-10 h-10 text-amber-600 animate-spin" />
              </div>
              <div>
                <h3 className="font-black text-2xl text-[#1c1917]">Acquiring GPS...</h3>
                <p className="text-sm text-[#78716c] font-medium mt-1.5 max-w-xs mx-auto">
                  Capturing phone satellite coordinates for verified punch.
                </p>
              </div>
            </div>
          ) : pendingAction && capturedLocation ? (
            /* STEP 2: Location Confirmation Screen */
            <div
              id="confirmation-screen"
              className="bg-white border-4 border-amber-400 rounded-3xl p-5 space-y-4 shadow-xl animate-in zoom-in-95"
            >
              <div className="text-center space-y-1">
                <div className="inline-flex p-3 rounded-2xl bg-amber-100 text-amber-800 mb-1">
                  <MapPin className="w-8 h-8 stroke-[2.5]" />
                </div>
                <h3 className="font-black text-2xl text-[#1c1917] tracking-tight">Confirm Location & Punch</h3>
                <p className="text-sm text-[#57534e] font-medium">
                  {pendingAction === 'start_duty'
                    ? `Confirm starting duty & punch in for Cab ${currentCabNumber} at this location:`
                    : pendingAction === 'end_duty'
                    ? `Confirm ending active duty & punch out for Cab ${currentCabNumber} at this location:`
                    : `Confirm current location punch for Cab ${currentCabNumber} to update dashboard:`}
                </p>
              </div>

              {/* Location Address Card */}
              <div className="bg-[#faf7f2] border-2 border-[#e6e0d4] rounded-2xl p-4 space-y-2 text-left">
                <div className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-700" />
                  Captured GPS Location
                </div>
                <div className="text-base sm:text-lg font-black text-[#1c1917] break-words leading-snug">
                  {capturedLocation.locationText}
                </div>
                <div className="text-xs text-[#78716c] font-mono">
                  Coordinates: {capturedLocation.latitude.toFixed(5)}, {capturedLocation.longitude.toFixed(5)}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <button
                  type="button"
                  id="btn-cancel-action"
                  disabled={isSubmitting}
                  onClick={handleCancelConfirmation}
                  className="w-full min-h-[58px] rounded-2xl bg-[#f5f0e6] hover:bg-[#eae3d2] active:bg-[#ded7c8] text-[#44403c] font-black text-base border-2 border-[#ded7c8] transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  id="btn-confirm-action"
                  disabled={isSubmitting}
                  onClick={handleConfirmAction}
                  className="w-full min-h-[58px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-base sm:text-lg shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-6 h-6 stroke-[3]" />
                      <span>Confirm Punch</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Normal Action View - Prominently Displayed at Top of Screen */
            <div className="space-y-3.5">
              {/* IF DRIVER HAS ACTIVE DUTY: Show "END DUTY / PUNCH OUT" */}
              {hasActiveDuty ? (
                <button
                  type="button"
                  id="btn-end-duty-punch-out"
                  onClick={handleInitiateEndDuty}
                  className="w-full min-h-[95px] rounded-3xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-black text-xl sm:text-2xl shadow-xl shadow-red-900/20 border-4 border-red-400 transition-all flex items-center justify-between px-6 cursor-pointer"
                >
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                      <LogOut className="w-8 h-8 text-white stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="tracking-tight text-xl sm:text-2xl">
                        END DUTY / PUNCH OUT
                      </div>
                      <div className="text-xs sm:text-sm text-red-100 font-semibold mt-0.5">
                        Complete trip & punch out attendance
                      </div>
                    </div>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-red-200 shrink-0 stroke-[2.5]" />
                </button>
              ) : (
                /* IF NO ACTIVE DUTY: Show "START DUTY / PUNCH IN" */
                <button
                  type="button"
                  id="btn-start-duty-punch-in"
                  onClick={handleInitiateStartDuty}
                  className="w-full min-h-[95px] rounded-3xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-xl sm:text-2xl shadow-xl shadow-emerald-900/20 border-4 border-emerald-400 transition-all flex items-center justify-between px-6 cursor-pointer"
                >
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                      <PlayCircle className="w-8 h-8 text-white stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="tracking-tight text-xl sm:text-2xl">
                        START DUTY / PUNCH IN
                      </div>
                      <div className="text-xs sm:text-sm text-emerald-100 font-semibold mt-0.5">
                        Punch in attendance & start 12h shift
                      </div>
                    </div>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-emerald-200 shrink-0 stroke-[2.5]" />
                </button>
              )}

              {/* PUNCH CURRENT LOCATION Button */}
              <button
                type="button"
                id="btn-punch-current-location"
                disabled={isPunchingLocation}
                onClick={handleInitiatePunchLocation}
                className={`w-full min-h-[85px] rounded-3xl ${
                  isPunchingLocation
                    ? 'bg-cyan-700 cursor-wait'
                    : 'bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] cursor-pointer'
                } text-white font-black text-lg sm:text-xl shadow-lg shadow-cyan-900/20 border-4 border-cyan-400 transition-all flex items-center justify-between px-6`}
              >
                <div className="flex items-center gap-3.5 text-left">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    {isPunchingLocation ? (
                      <RefreshCw className="w-7 h-7 text-white animate-spin" />
                    ) : (
                      <MapPin className="w-7 h-7 text-white stroke-[2.5]" />
                    )}
                  </div>
                  <div>
                    <div className="tracking-tight text-lg sm:text-xl">
                      {isPunchingLocation ? 'PUNCHING LOCATION...' : 'PUNCH CURRENT LOCATION'}
                    </div>
                    <div className="text-xs sm:text-sm text-cyan-100 font-semibold">
                      {isPunchingLocation
                        ? 'Capturing GPS & updating Admin Dashboard'
                        : 'Capture GPS & update location on dashboard'}
                    </div>
                  </div>
                </div>
                <Compass className={`w-7 h-7 text-cyan-200 shrink-0 stroke-[2.5] ${isPunchingLocation ? 'animate-spin' : ''}`} />
              </button>

              {/* Enter / Edit Location Manually */}
              <button
                type="button"
                id="btn-open-custom-location-modal"
                onClick={() => setShowCustomLocationModal(true)}
                className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-[#faf7f2] active:scale-[0.99] text-amber-900 hover:text-amber-950 font-bold text-xs sm:text-sm border-2 border-[#ded7c8] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Edit3 className="w-4 h-4 text-amber-600" />
                <span>Enter / Edit Location Manually (Landmark)</span>
              </button>
            </div>
          )}
        </div>

        {/* DETAILS & STATUS AREA (Punched Location, Shift Durations, Roster) */}
        <div className="bg-white border-2 border-[#e6e0d4] rounded-3xl p-4 sm:p-5 space-y-4 shadow-sm">
          {/* Current Punched Location Box */}
          <div className="p-3.5 bg-[#faf7f2] rounded-2xl border-2 border-[#e6e0d4] flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
              <MapPin className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-black uppercase text-amber-900 tracking-wider">
                Current / Punched Location
              </div>
              <div className="text-[#1c1917] font-bold text-xs sm:text-sm mt-0.5 break-words leading-snug">
                {lastTrackedLocationText || assignedCab?.currentLocationText || 'No GPS punch recorded yet — tap "Punch Current Location" above'}
              </div>
              {assignedCab?.lastUpdated && (
                <div className="text-[10px] text-[#78716c] font-medium mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#a8a29e]" />
                  <span>Last punched: {formatTimeAgo(assignedCab.lastUpdated)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Active Duty Trip Details */}
          {hasActiveDuty && (
            <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 text-xs sm:text-sm space-y-1.5">
              <div className="flex items-center justify-between text-emerald-900 font-black">
                <span className="flex items-center gap-1.5 text-sm">
                  <Navigation className="w-4 h-4" />
                  Active Trip in Progress
                </span>
                <span className="font-mono text-xs bg-emerald-200 px-2.5 py-1 rounded-lg text-emerald-900 border border-emerald-400">
                  ON TRIP
                </span>
              </div>
              <div className="text-[#1c1917] flex items-start gap-1.5 pt-1 text-xs sm:text-sm">
                <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  Start: <strong className="text-[#1c1917] font-bold">{activeDuty?.startLocationText || lastTrackedLocationText || 'Current GPS Location'}</strong>
                </span>
              </div>
            </div>
          )}

          {/* 14-Hour Continuous Duty Duration & 2-Hour Buffer Monitor */}
          {hasActiveDuty && (
            <div className="p-4 bg-[#faf7f2] rounded-2xl border-2 border-[#e6e0d4] space-y-3">
              {/* Header with live clock */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#44403c] font-bold text-xs uppercase tracking-wider">
                  <Timer className="w-4 h-4 text-amber-600" />
                  <span>Continuous Duty Elapsed</span>
                </div>
                <div className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-white border border-[#ded7c8] text-amber-800 shadow-2xs">
                  {Math.floor(elapsedDutyMs / (1000 * 60 * 60))}h{' '}
                  {Math.floor((elapsedDutyMs % (1000 * 60 * 60)) / (1000 * 60))}m{' '}
                  {Math.floor((elapsedDutyMs % (1000 * 60)) / 1000)}s
                </div>
              </div>

              {/* Progress bar visual: 0 to 12h standard, 12 to 14h buffer */}
              <div>
                <div className="flex justify-between text-[10px] font-bold text-[#78716c] mb-1">
                  <span>Start (0h)</span>
                  <span className="text-emerald-700">12h Dynamic Shift</span>
                  <span className="text-rose-700 font-black">+2h Buffer (14h Max)</span>
                </div>
                <div className="w-full h-3 bg-[#e6e0d4] rounded-full overflow-hidden flex p-0.5 border border-[#ded7c8]">
                  {/* Standard 12h segment (12/14 = 85.7%) */}
                  <div className="w-[85.7%] h-full rounded-l-full bg-white relative overflow-hidden mr-0.5">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (elapsedDutyMs / STANDARD_SHIFT_MS) * 100)}%`,
                      }}
                    />
                  </div>
                  {/* Buffer 2h segment (2/14 = 14.3%) */}
                  <div className="w-[14.3%] h-full rounded-r-full bg-white relative overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{
                        width: `${
                          elapsedDutyMs > STANDARD_SHIFT_MS
                            ? Math.min(100, ((elapsedDutyMs - STANDARD_SHIFT_MS) / BUFFER_PERIOD_MS) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* In Buffer Period Warning Banner */}
              {elapsedDutyMs >= STANDARD_SHIFT_MS && elapsedDutyMs < MAX_DUTY_MS && (
                <div className="p-3.5 rounded-xl bg-amber-100 border-2 border-amber-500 text-amber-950 text-xs space-y-1.5 animate-pulse shadow-xs">
                  <div className="flex items-center gap-1.5 font-black text-amber-900 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>⚠️ 12-Hour Shift Ended • In 2-Hour Grace Buffer</span>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    You have reached the 12-hour continuous shift duration limit. You have{' '}
                    <strong className="text-amber-950 font-mono font-black underline">
                      {Math.max(0, Math.ceil((MAX_DUTY_MS - elapsedDutyMs) / (60 * 1000)))} minutes remaining
                    </strong>{' '}
                    to conclude your trip and end duty. Continuous duty automatically concludes at 14 hours.
                  </p>
                </div>
              )}

              {/* Testing / Simulator bar */}
              <div className="pt-2 border-t border-[#e6e0d4] flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowDevSimulator(!showDevSimulator)}
                  className="text-[#78716c] hover:text-amber-700 font-mono cursor-pointer underline flex items-center gap-1"
                >
                  <Timer className="w-3 h-3 text-amber-600" />
                  <span>{showDevSimulator ? 'Hide Test Simulator' : '⚡ Test 12h/14h Limit (Simulation)'}</span>
                </button>

                {simulatedOffsetMs > 0 && (
                  <span className="text-amber-900 font-mono font-bold bg-amber-100 px-2 py-0.5 rounded border border-amber-400">
                    Simulation active
                  </span>
                )}
              </div>

              {showDevSimulator && (
                <div className="p-3 rounded-xl bg-white border border-[#ded7c8] space-y-2 text-xs animate-in fade-in shadow-xs">
                  <div className="text-[11px] font-bold text-[#44403c]">
                    Test 12h Shift Buffer & 14h Auto-Conclusion Instantly:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSimulatedOffsetMs(12.2 * 60 * 60 * 1000)}
                      className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-400 text-xs font-bold cursor-pointer transition"
                    >
                      Simulate 12h Buffer (12h 12m)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulatedOffsetMs(14.05 * 60 * 60 * 1000)}
                      className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-400 text-xs font-bold cursor-pointer transition"
                    >
                      Simulate 14h Limit (Auto-Conclude)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulatedOffsetMs(0)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-xs cursor-pointer"
                    >
                      Reset Timer
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Driver Shift Induction & 2-Driver Roster Card */}
          <div className="p-3.5 bg-[#faf7f2] rounded-2xl border-2 border-[#e6e0d4] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#78716c]">
                    Driver Designation
                  </div>
                  <div className="text-[#1c1917] font-black text-sm flex items-center gap-1.5 flex-wrap">
                    <span>
                      {userProfile?.driverSlot === 'second' ? '2nd Driver' : '1st Driver'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Dynamic 12h Shift
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                id="btn-switch-driver-shift"
                onClick={() => setShowShiftModal(true)}
                className="px-2.5 py-1.5 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] font-bold text-xs transition flex items-center gap-1 cursor-pointer border border-[#ded7c8] shrink-0"
                title="Switch between 1st Driver and 2nd Driver"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Switch Role</span>
              </button>
            </div>

            {/* Cab Partner Induction Status */}
            <div className="pt-2 border-t border-[#e6e0d4] flex items-center justify-between text-[11px] text-[#78716c]">
              <span className="flex items-center gap-1.5 font-medium">
                <Users className="w-3.5 h-3.5 text-[#a8a29e] shrink-0" />
                <span>
                  {userProfile?.driverSlot === 'second'
                    ? `1st Driver: ${assignedCab?.firstDriverName || 'Available for pairing'}`
                    : `2nd Driver: ${assignedCab?.secondDriverName || 'Available for pairing'}`}
                </span>
              </span>
              <span className="text-[10px] text-[#a8a29e] font-mono hidden sm:inline">2 Drivers / Cab</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center py-2 text-xs text-[#a8a29e] font-semibold">
          Cab Fleet Tracker &bull; Driver Mobile System &bull; Live GPS Sync
        </div>
      </div>

      {/* Manual Custom Location Modal */}
      {showCustomLocationModal && (
        <div
          id="modal-custom-location"
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border-2 border-amber-400 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#e6e0d4]">
              <div className="flex items-center gap-2 text-amber-900 font-black text-lg">
                <MapPin className="w-5 h-5 text-amber-600" />
                <span>Punch Cab Location</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomLocationModal(false)}
                className="text-[#78716c] hover:text-[#1c1917] text-xs font-bold px-2 py-1 rounded-lg bg-[#f5f0e6]"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-[#57534e]">
              Type your current spot or landmark to show immediately on the Admin Dashboard:
            </p>

            <input
              type="text"
              id="input-custom-location-text"
              value={customLocationText}
              onChange={(e) => setCustomLocationText(e.target.value)}
              placeholder="e.g. Airport Terminal 1 Departure, Hub Gate 2"
              className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-sm text-[#1c1917] font-medium focus:outline-none focus:border-amber-500"
            />

            {/* Quick Suggestions */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['Airport T1', 'Airport T2', 'Central Tech Hub', 'South City Depot'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCustomLocationText(preset)}
                  className="px-2.5 py-1 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[11px] text-[#44403c] font-medium transition"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                id="btn-confirm-custom-location-punch"
                disabled={!customLocationText.trim()}
                onClick={handlePunchCustomLocation}
                className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#1c1917] font-black text-sm transition cursor-pointer shadow-xs"
              >
                Punch This Location
              </button>
              <button
                type="button"
                onClick={() => setShowCustomLocationModal(false)}
                className="px-4 py-3 rounded-xl bg-[#f5f0e6] text-[#44403c] text-sm hover:bg-[#eae3d2] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkmark Animation Modal after successful punch */}
      {showCheckmarkModal && (
        <div
          id="modal-punch-success-animation"
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border-4 border-emerald-500 rounded-3xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <AnimatedCheckmark size={96} />

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-[#1c1917] tracking-tight">
                Punch Recorded!
              </h2>
              <p className="text-base font-bold text-emerald-800">
                {successMessage}
              </p>
              {isQueuedOffline && (
                <div className="mt-2 text-xs text-amber-900 bg-amber-100 p-2.5 rounded-xl border border-amber-400 font-medium">
                  Saved offline on phone. Will automatically sync to database when internet connects.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCheckmarkModal(false)}
              className="w-full min-h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base shadow-md transition cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* 14-Hour Shift Concluded Notification Modal (12h + 2h Buffer) */}
      {show14hExpiredModal && (
        <div
          id="modal-14h-shift-concluded"
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white border-4 border-amber-500 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="w-18 h-18 mx-auto rounded-3xl bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-amber-700">
              <ShieldAlert className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-3 py-1 rounded-full border border-amber-400 inline-block">
                14-Hour Maximum Shift Policy Enforced
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#1c1917] tracking-tight leading-tight">
                Duty Concluded
              </h2>
              <p className="text-sm font-semibold text-[#57534e] leading-relaxed">
                Your continuous duty shift and attendance have been automatically concluded after reaching the{' '}
                <strong className="text-amber-900 font-bold">12 hours standard duty + 2 hours grace buffer (14 hours total)</strong> limit.
              </p>
              <div className="p-3.5 bg-[#faf7f2] rounded-2xl border border-[#ded7c8] text-xs text-[#44403c] text-left space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Cab marked Cab Off Duty in fleet registry for shift handover</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Attendance auto punched out with completed hours</span>
                </div>
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Re-login required to continue or start next duty shift</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              id="btn-relogin-after-14h"
              onClick={async () => {
                setShow14hExpiredModal(false);
                await signOut();
              }}
              className="w-full min-h-[56px] rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-[#1c1917] font-black text-base shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              <span>Re-login to Continue Duty</span>
            </button>
          </div>
        </div>
      )}

      {/* Driver Shift Designation Switcher Modal (1st Driver / 2nd Driver - Dynamic 12h) */}
      {showShiftModal && (
        <div
          id="modal-shift-switcher"
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white border-2 border-[#ded7c8] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[#1c1917]">Select Driver Designation</h3>
              <button
                type="button"
                onClick={() => setShowShiftModal(false)}
                className="text-[#78716c] hover:text-[#1c1917] text-xs cursor-pointer px-2 py-1 rounded-lg hover:bg-[#f5f0e6]"
              >
                ✕ Cancel
              </button>
            </div>

            <p className="text-xs text-[#57534e]">
              Each cab accommodates two drivers. Whenever you punch in duty at any time, your 12-hour shift count begins automatically:
            </p>

            <div className="space-y-3">
              {/* Option: 1st Driver */}
              <button
                type="button"
                id="btn-select-first-driver"
                disabled={isSwitchingShift}
                onClick={() => handleUpdateShift('morning_12h', 'first')}
                className={`w-full p-4 rounded-2xl border-2 text-left transition flex items-start gap-3 cursor-pointer ${
                  userProfile?.driverSlot === 'first' || (!userProfile?.driverSlot && userProfile?.shift !== 'night_12h')
                    ? 'bg-amber-50 border-amber-500 text-[#1c1917] shadow-xs'
                    : 'bg-[#faf7f2] border-[#ded7c8] text-[#44403c] hover:border-amber-300'
                }`}
              >
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-black text-[#1c1917]">
                    1st Driver
                  </div>
                  <div className="text-xs text-amber-900 font-bold mt-0.5">
                    Dynamic 12-Hour Shift
                  </div>
                  <div className="text-[11px] text-[#78716c] mt-1">
                    Counts 12 hours from whenever duty is started + 2h buffer allowance
                  </div>
                </div>
              </button>

              {/* Option: 2nd Driver */}
              <button
                type="button"
                id="btn-select-second-driver"
                disabled={isSwitchingShift}
                onClick={() => handleUpdateShift('night_12h', 'second')}
                className={`w-full p-4 rounded-2xl border-2 text-left transition flex items-start gap-3 cursor-pointer ${
                  userProfile?.driverSlot === 'second' || userProfile?.shift === 'night_12h'
                    ? 'bg-amber-50 border-amber-500 text-[#1c1917] shadow-xs'
                    : 'bg-[#faf7f2] border-[#ded7c8] text-[#44403c] hover:border-amber-300'
                }`}
              >
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-black text-[#1c1917]">
                    2nd Driver
                  </div>
                  <div className="text-xs text-amber-900 font-bold mt-0.5">
                    Dynamic 12-Hour Shift
                  </div>
                  <div className="text-[11px] text-[#78716c] mt-1">
                    Relief driver slot, counts 12 hours from start time + 2h buffer allowance
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
