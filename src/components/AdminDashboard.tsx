import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FleetCab, FleetCabStatus, UserProfile, DEFAULT_SUB_VENDOR_PERMISSIONS, normalizeCab, cleanCabForCompare } from '../types';
import { clearAllFleetData } from '../lib/clearData';
import { FleetMasterUpload } from './FleetMasterUpload';
import { AssignDutyModal } from './AssignDutyModal';
import { AddCabModal } from './AddCabModal';
import { TeamSettingsPage } from './TeamSettingsPage';
import { SubVendorsManagementView } from './SubVendorsManagementView';
import { FleetLiveMapView } from './FleetLiveMapView';
import { DriverInstallModal } from './DriverInstallModal';
import { DateWiseLocationReport } from './DateWiseLocationReport';
import { AttendanceRegisterView } from './AttendanceRegisterView';
import { RegisteredDriversView } from './RegisteredDriversView';
import { soundNotificationService } from '../lib/soundNotification';
import { formatTimeAgo } from '../lib/timeAgo';
import {
  reverseGeocode,
  getGoogleMapsUrl,
  copyToClipboard,
} from '../lib/geolocation';
import {
  Car,
  ShieldCheck,
  LogOut,
  Radio,
  Clock,
  MapPin,
  RefreshCw,
  Phone,
  UploadCloud,
  Users,
  Search,
  ArrowUpDown,
  CheckCircle2,
  Navigation,
  Sparkles,
  ArrowUpRight,
  Filter,
  Map as MapIcon,
  Table as TableIcon,
  Smartphone,
  Trash2,
  Crosshair,
  Copy,
  Check,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  UserCheck,
  ChevronRight,
  X,
  AlertCircle,
  Volume2,
  VolumeX,
  Bell,
  Building2,
  ShieldAlert,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { userProfile, signOut, signIn } = useAuth();

  const [fleetList, setFleetList] = useState<FleetCab[]>([]);
  const [driverUsers, setDriverUsers] = useState<UserProfile[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // View state: main dashboard tab ('table' | 'drivers' | 'map' | 'reports' | 'attendance'), team settings, or subvendors
  const [currentView, setCurrentView] = useState<'dashboard' | 'team' | 'subvendors'>('dashboard');
  const [fleetTab, setFleetTab] = useState<'table' | 'drivers' | 'map' | 'reports' | 'attendance'>('table');

  // Sub-Vendors list
  const [subVendorsList, setSubVendorsList] = useState<UserProfile[]>([]);

  // Sound Notification state
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => soundNotificationService.isEnabled());
  const [recentlyPunchedCab, setRecentlyPunchedCab] = useState<string | null>(null);
  const [punchToast, setPunchToast] = useState<{
    driverName: string;
    cabNumber: string;
    locationText: string;
    timeStr: string;
  } | null>(null);

  // Modals state
  const [isAddCabModalOpen, setIsAddCabModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDriverInstallModalOpen, setIsDriverInstallModalOpen] = useState(false);
  const [selectedCabForDuty, setSelectedCabForDuty] = useState<FleetCab | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Filter & Search & Sort states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FleetCabStatus>('all');
  const [sortBy, setSortBy] = useState<'lastUpdated' | 'status' | 'cabNumber'>('lastUpdated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Delete Cab State
  const [cabToDelete, setCabToDelete] = useState<FleetCab | null>(null);
  const [isDeletingCab, setIsDeletingCab] = useState(false);
  const [unlinkDriversOnCabDelete, setUnlinkDriversOnCabDelete] = useState(true);
  const [deleteDriversOnCabDelete, setDeleteDriversOnCabDelete] = useState(false);
  const recentlyDeletedCabsRef = useRef<Set<string>>(new Set());

  // Automatic Cab Tracking & Map Focus State
  const [focusedCabNumber, setFocusedCabNumber] = useState<string | null>(null);
  const [autoFocusTracking, setAutoFocusTracking] = useState(true);

  const [copiedCabNumber, setCopiedCabNumber] = useState<string | null>(null);

  // Copy helper for supervisor to assign duty in second software
  const handleCopyForSecondSoftware = async (cab: FleetCab, format: 'coords' | 'full' = 'coords') => {
    const lat = cab.currentLocationLat || cab.lastPunchedLat;
    const lng = cab.currentLocationLng || cab.lastPunchedLng;
    const hasCoords = typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0;
    const locationName =
      cab.lastPunchedLocation ||
      cab.currentLocationText ||
      cab.baseHub ||
      (hasCoords ? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°` : 'Current Standing Location');

    let textToCopy = '';
    if (format === 'coords') {
      textToCopy = hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : locationName;
    } else {
      textToCopy = hasCoords
        ? `${cab.cabNumber} - ${locationName} (${lat.toFixed(6)}, ${lng.toFixed(6)})`
        : `${cab.cabNumber} - ${locationName}`;
    }

    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopiedCabNumber(cab.cabNumber);
      setActionSuccessMsg(
        `Copied ${format === 'coords' ? 'coordinates' : 'standing location'} for ${cab.cabNumber} to clipboard! Ready to paste into 2nd software.`
      );
      setTimeout(() => {
        setCopiedCabNumber(null);
      }, 2500);
      setTimeout(() => {
        setActionSuccessMsg(null);
      }, 4500);
    }
  };

  // Relative time tick state to refresh "x minutes ago" in real-time every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Real-time Firestore live listener for registered drivers in "users" collection
  useEffect(() => {
    const driversQuery = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubDrivers = onSnapshot(
      driversQuery,
      (snapshot) => {
        const drivers: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          drivers.push({ uid: docSnap.id, ...(docSnap.data() as UserProfile) });
        });
        // Sort newest accounts first
        drivers.sort((a, b) => {
          const timeA = (a.createdAt as any)?.seconds || (a.createdAt ? new Date(a.createdAt as any).getTime() : 0);
          const timeB = (b.createdAt as any)?.seconds || (b.createdAt ? new Date(b.createdAt as any).getTime() : 0);
          return timeB - timeA;
        });
        setDriverUsers(drivers);
      },
      (err) => console.error('Driver live listener error:', err)
    );
    return () => unsubDrivers();
  }, []);

  // Real-time Firestore live listener for "fleet" collection
  useEffect(() => {
    const fleetQuery = query(collection(db, 'fleet'));
    const unsubFleet = onSnapshot(
      fleetQuery,
      (snapshot) => {
        const cabs: FleetCab[] = [];
        snapshot.forEach((doc) => {
          cabs.push({ id: doc.id, ...(doc.data() as Omit<FleetCab, 'id'>) });
        });
        setFleetList(cabs);

        // Auto-focus cab tracking: strictly follow the driver whose coordinates or punch updated most recently
        if (autoFocusTracking && cabs.length > 0) {
          const sorted = [...cabs].sort((a, b) => {
            const timeA = a.lastUpdated?.seconds || (a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0);
            const timeB = b.lastUpdated?.seconds || (b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0);
            return timeB - timeA;
          });
          if (sorted[0]?.cabNumber) {
            setFocusedCabNumber(sorted[0].cabNumber);
          }
        }
      },
      (err) => console.error('Fleet live listener error:', err)
    );

    return () => {
      unsubFleet();
    };
  }, [autoFocusTracking]);

  // Automatic Sync: If any driver account registered via mobile with a cabNumber that doesn't yet exist in fleet, immediately add it to fleet!
  useEffect(() => {
    if (fleetList.length === 0 || driverUsers.length === 0) return;
    const existingCabs = new Set(fleetList.map((c) => c.cabNumber.trim().toUpperCase()));
    for (const driver of driverUsers) {
      if (driver.cabNumber && driver.cabNumber.trim() !== '') {
        const normCab = driver.cabNumber.trim().toUpperCase();
        // Skip if this cab was recently deleted by the admin
        if (recentlyDeletedCabsRef.current.has(normCab)) continue;
        if (!existingCabs.has(normCab)) {
          existingCabs.add(normCab); // avoid multiple calls in same cycle
          const cleanDocId = 'cab_' + normCab.replace(/[^A-Z0-9]/g, '_').toLowerCase();
          setDoc(
            doc(db, 'fleet', cleanDocId),
            {
              cabNumber: normCab,
              site: driver.site || userProfile?.site || 'North Terminal Hub',
              driverName: driver.name || 'Driver',
              driverPhone: driver.phoneNumber || '',
              firstDriverName: driver.name || 'Driver',
              firstDriverPhone: driver.phoneNumber || '',
              firstDriverShift: driver.shift || 'morning_12h',
              activeDriverSlot: driver.driverSlot || 'first',
              vehicleType: 'Sedan (Dzire / Etios)',
              baseHub: driver.site || userProfile?.site || 'North Terminal Hub',
              status: 'reported_at_hub',
              currentLocationText: `${driver.site || userProfile?.site || 'North Terminal Hub'} (Depot)`,
              currentLocationLat: 12.9716,
              currentLocationLng: 77.5946,
              lastUpdated: serverTimestamp(),
            },
            { merge: true }
          ).catch((e) => console.error('Auto-sync cab to fleet failed:', e));
        }
      }
    }
  }, [driverUsers, fleetList, userProfile?.site]);

  // Live Firestore listener for Sub-Vendor accounts
  useEffect(() => {
    const qVendors = query(collection(db, 'users'), where('role', '==', 'sub_vendor'));
    const unsubVendors = onSnapshot(
      qVendors,
      (snapshot) => {
        const vendors: UserProfile[] = [];
        snapshot.forEach((d) => {
          vendors.push({ uid: d.id, ...(d.data() as UserProfile) });
        });
        setSubVendorsList(vendors);
      },
      (err) => console.warn('Sub-vendors live query notice:', err)
    );
    return () => unsubVendors();
  }, []);

  // Live listener for Driver Location Punches -> Produces Sound Chime & Visual Notification
  const hasInitializedNotifsRef = useRef(false);
  useEffect(() => {
    const notifQuery = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc'),
      limit(15)
    );

    const unsubNotif = onSnapshot(
      notifQuery,
      (snapshot) => {
        if (!hasInitializedNotifsRef.current) {
          hasInitializedNotifsRef.current = true;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.type === 'location_punch') {
              const punchedCab = (data.cabNumber || '').trim().toUpperCase();

              // If logged in as Sub-Vendor, only play sound & alert if this cab belongs to them!
              if (
                userProfile?.role === 'sub_vendor' &&
                userProfile.assignedCabs &&
                userProfile.assignedCabs.length > 0
              ) {
                const assignedSet = new Set(
                  userProfile.assignedCabs.map((c) => c.trim().toUpperCase().replace(/\s+/g, ''))
                );
                const cleanPunched = punchedCab.replace(/\s+/g, '');
                if (!assignedSet.has(cleanPunched)) {
                  return; // Cab not assigned to this vendor
                }
              }

              // Play Web Audio Chime!
              soundNotificationService.playLocationPunchChime();

              // Highlight recently punched cab with emerald ring & Standing Free alert badge
              setRecentlyPunchedCab(punchedCab);
              setTimeout(() => {
                setRecentlyPunchedCab((curr) => (curr === punchedCab ? null : curr));
              }, 12000);

              // Show Rich Notification Banner
              const nowTime = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              setPunchToast({
                driverName: data.driverName || 'Driver',
                cabNumber: punchedCab || 'Fleet Cab',
                locationText: data.locationText || 'Punched Current Location',
                timeStr: nowTime,
              });

              setTimeout(() => {
                setPunchToast((curr) => (curr?.cabNumber === punchedCab ? null : curr));
              }, 8000);
            }
          }
        });
      },
      (err) => console.warn('Notifications live listener notice:', err)
    );

    return () => unsubNotif();
  }, [userProfile?.role, userProfile?.assignedCabs]);

  // Helper to normalize cab registration numbers across any formatting (dashes, spaces, slashes)
  const normalizeCabKey = (str?: string) => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Sub-Vendor Role & Permissions Detection
  const isSubVendor = userProfile?.role === 'sub_vendor' || (userProfile?.role as string) === 'vendor';
  const isMasterOrAdmin = userProfile?.role === 'master_admin' || userProfile?.role === 'admin';
  const vendorPerms = userProfile?.permissions || DEFAULT_SUB_VENDOR_PERMISSIONS;

  // Check if current browser opened the vendor portal link (?role=vendor or ?portal=vendor)
  const isVendorDeepLinkInUrl = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('role') === 'vendor' ||
    new URLSearchParams(window.location.search).get('role') === 'sub_vendor' ||
    new URLSearchParams(window.location.search).get('portal') === 'vendor' ||
    new URLSearchParams(window.location.search).get('app') === 'vendor'
  );

  // Auto-switch initial tab if sub-vendor lacks permission for 'table'
  useEffect(() => {
    if (isSubVendor) {
      if (!vendorPerms.canViewFleetTable && vendorPerms.canViewMap) {
        setFleetTab('map');
      } else if (!vendorPerms.canViewFleetTable && vendorPerms.canViewReports) {
        setFleetTab('reports');
      } else if (!vendorPerms.canViewFleetTable && vendorPerms.canViewAttendance) {
        setFleetTab('attendance');
      } else if (!vendorPerms.canViewFleetTable && vendorPerms.canViewDrivers) {
        setFleetTab('drivers');
      }
    }
  }, [isSubVendor, vendorPerms]);

  // Scoped fleet list: STRICTLY show only cabs assigned to this sub-vendor
  const visibleFleetList = useMemo(() => {
    if (!isSubVendor) return fleetList;

    const assigned = userProfile?.assignedCabs || [];
    const vName = userProfile?.vendorName?.trim().toLowerCase();

    // 1. If sub-vendor has explicit assigned cab numbers
    if (assigned.length > 0) {
      const cleanAssignedSet = new Set(assigned.map(normalizeCabKey).filter(Boolean));
      return fleetList.filter((cab) => {
        const norm = normalizeCabKey(cab.cabNumber);
        const matchesAssigned = cleanAssignedSet.has(norm);
        const matchesVendorName = Boolean(vName && cab.vendorName && cab.vendorName.trim().toLowerCase() === vName);
        return matchesAssigned || matchesVendorName;
      });
    }

    // 2. If sub-vendor is mapped by company / vendorName
    if (vName) {
      return fleetList.filter(
        (c) => c.vendorName && c.vendorName.trim().toLowerCase() === vName
      );
    }

    // 3. Strict isolation: If a sub-vendor has NO assigned cabs, return empty array!
    // Never leak the entire master fleet to an unconfigured sub-vendor!
    return [];
  }, [fleetList, isSubVendor, userProfile?.assignedCabs, userProfile?.vendorName]);

  // Scoped driver list for sub-vendor
  const scopedDriverUsers = useMemo(() => {
    if (!isSubVendor) return driverUsers;

    const assigned = userProfile?.assignedCabs || [];
    const vName = userProfile?.vendorName?.trim().toLowerCase();

    // Strict isolation: if no assigned cabs, return empty array
    if (assigned.length === 0 && !vName) return [];

    const cleanAssignedSet = new Set(assigned.map(normalizeCabKey).filter(Boolean));

    return driverUsers.filter((d) => {
      if (!d.cabNumber) return false;
      const norm = normalizeCabKey(d.cabNumber);
      return cleanAssignedSet.has(norm);
    });
  }, [driverUsers, isSubVendor, userProfile?.assignedCabs, userProfile?.vendorName]);

  const handleFocusCabOnMap = (cab: FleetCab) => {
    setFocusedCabNumber(cab.cabNumber);
    setFleetTab('map');
  };

  const handleClearFleetData = async () => {
    setIsClearing(true);
    setActionSuccessMsg(null);
    try {
      const stats = await clearAllFleetData(userProfile?.uid);
      setActionSuccessMsg(
        `Purged ${stats.cabsDeleted} dummy cabs, ${stats.dutiesDeleted} duties, and ${stats.notificationsDeleted} alerts.`
      );
      setShowClearConfirm(false);
    } catch (err: any) {
      console.error('Clear error:', err);
      setActionSuccessMsg('Failed to clear database: ' + err.message);
    } finally {
      setIsClearing(false);
      setTimeout(() => setActionSuccessMsg(null), 5000);
    }
  };

  const handleConfirmDeleteCab = async () => {
    if (!cabToDelete) return;
    setIsDeletingCab(true);
    const normCab = cabToDelete.cabNumber.trim().toUpperCase();
    recentlyDeletedCabsRef.current.add(normCab);

    try {
      // 1. Delete fleet document(s)
      if (cabToDelete.id) {
        await deleteDoc(doc(db, 'fleet', cabToDelete.id));
      }
      const cleanDocId = 'cab_' + normCab.replace(/[^A-Z0-9]/g, '_').toLowerCase();
      if (cleanDocId !== cabToDelete.id) {
        await deleteDoc(doc(db, 'fleet', cleanDocId)).catch(() => {});
      }

      // 2. Handle linked driver user accounts in "users" collection
      if (unlinkDriversOnCabDelete || deleteDriversOnCabDelete) {
        const driversQuery = query(collection(db, 'users'), where('cabNumber', '==', normCab));
        const snap = await getDocs(driversQuery);
        for (const userDoc of snap.docs) {
          if (deleteDriversOnCabDelete) {
            await deleteDoc(userDoc.ref);
          } else if (unlinkDriversOnCabDelete) {
            await updateDoc(userDoc.ref, {
              cabNumber: '',
              driverSlot: null,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      // 3. Clean up any active/pending duties for this cab
      try {
        const dutiesQuery = query(collection(db, 'duties'), where('cabNumber', '==', normCab));
        const dutiesSnap = await getDocs(dutiesQuery);
        for (const dutyDoc of dutiesSnap.docs) {
          await deleteDoc(dutyDoc.ref).catch(() => {});
        }
      } catch (e) {
        // duties cleanup is best-effort
      }

      setActionSuccessMsg(`Cab ${normCab} was successfully deleted from the fleet.`);
      setCabToDelete(null);
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Failed to delete cab:', err);
      alert('Failed to delete cab: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsDeletingCab(false);
    }
  };

  const handleOpenAssignDuty = (cab: FleetCab) => {
    if (cab.status === 'free' || cab.status === 'cab_off_duty' || cab.status === 'reported_at_hub') {
      setSelectedCabForDuty(cab);
      setIsAssignModalOpen(true);
    }
  };

  // 1. Two Summary Card live calculations based on visibleFleetList
  const offDutyCabsCount = useMemo(
    () => visibleFleetList.filter((c) => c.status === 'free' || c.status === 'cab_off_duty' || c.status === 'reported_at_hub').length,
    [visibleFleetList]
  );
  const onDutyCount = useMemo(
    () => visibleFleetList.filter((c) => c.status === 'on_duty').length,
    [visibleFleetList]
  );
  const reportedAtHubCount = useMemo(
    () => visibleFleetList.filter((c) => c.status === 'reported_at_hub' || Boolean(c.lastPunchedLocation || c.currentLocationText)).length,
    [visibleFleetList]
  );

  // Helper to extract numeric epoch time for sorting
  const getTimeValue = (timestamp: any): number => {
    if (!timestamp) return 0;
    if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime();
    if (timestamp instanceof Date) return timestamp.getTime();
    if (timestamp?.seconds) return timestamp.seconds * 1000;
    if (typeof timestamp === 'number') return timestamp;
    if (typeof timestamp === 'string') return new Date(timestamp).getTime() || 0;
    return 0;
  };

  // Filtered & Sorted Cabs based on visibleFleetList
  const filteredAndSortedCabs = useMemo(() => {
    return visibleFleetList
      .filter((cab) => {
        // Status filter
        if ((statusFilter === 'free' || statusFilter === 'cab_off_duty') && cab.status === 'on_duty') {
          return false;
        }
        if (statusFilter === 'on_duty' && cab.status !== 'on_duty') {
          return false;
        }
        if (statusFilter === 'reported_at_hub' && cab.status !== 'reported_at_hub' && !cab.lastPunchedLocation && !cab.currentLocationText) {
          return false;
        }
        // Search term (Cab Number, Driver Name, Location, Base Hub)
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase().trim();
          const matchCab = cab.cabNumber?.toLowerCase().includes(term);
          const matchDriver = cab.driverName?.toLowerCase().includes(term);
          const matchPhone = cab.driverPhone?.toLowerCase().includes(term);
          const matchLoc = cab.currentLocationText?.toLowerCase().includes(term);
          const matchHub = cab.baseHub?.toLowerCase().includes(term);
          const matchVehicle = cab.vehicleType?.toLowerCase().includes(term);
          return matchCab || matchDriver || matchPhone || matchLoc || matchHub || matchVehicle;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'status') {
          // Status order priority: cab_off_duty/free -> reported_at_hub -> on_duty
          const orderMap: Record<string, number> = {
            cab_off_duty: 1,
            free: 1,
            reported_at_hub: 2,
            on_duty: 3,
          };
          const valA = orderMap[a.status] || 99;
          const valB = orderMap[b.status] || 99;
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }

        if (sortBy === 'lastUpdated') {
          const timeA = getTimeValue(a.lastUpdated);
          const timeB = getTimeValue(b.lastUpdated);
          return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        }

        if (sortBy === 'cabNumber') {
          const cabA = a.cabNumber || '';
          const cabB = b.cabNumber || '';
          return sortOrder === 'asc'
            ? cabA.localeCompare(cabB)
            : cabB.localeCompare(cabA);
        }

        return 0;
      });
  }, [visibleFleetList, searchTerm, statusFilter, sortBy, sortOrder]);

  const toggleSort = (newSortBy: 'lastUpdated' | 'status' | 'cabNumber') => {
    if (sortBy === newSortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(newSortBy);
      setSortOrder(newSortBy === 'lastUpdated' ? 'desc' : 'asc');
    }
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#1c1917] flex flex-col md:flex-row selection:bg-amber-400 selection:text-[#1c1917] font-sans">
      {/* Mobile Header Bar (Visible on mobile screens only) */}
      <header className="md:hidden bg-white border-b border-[#e6e0d4] px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shadow-xs">
            <Car className="w-5 h-5 text-[#1c1917] font-bold" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-[#1c1917]">Cab Fleet Tracker</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-[#78716c]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Sync</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="px-3 py-1.5 rounded-xl bg-[#f5f0e6] border border-[#ded7c8] text-[#1c1917] text-xs font-semibold shadow-xs cursor-pointer hover:bg-[#eae3d2]"
        >
          {isMobileMenuOpen ? 'Close Menu' : 'Menu'}
        </button>
      </header>

      {/* LEFT VERTICAL SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-[#e6e0d4] flex flex-col justify-between transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 shrink-0 ${
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar Header & Brand */}
        <div className="p-5 border-b border-[#e6e0d4]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shadow-xs shrink-0">
              <Car className="w-6 h-6 text-[#1c1917] font-bold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="font-bold text-base text-[#1c1917] truncate">Cab Fleet Tracker</h1>
              </div>
              <p className="text-[11px] text-[#78716c] truncate">Operations Management</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {isSubVendor ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-900 border border-cyan-300">
                <Building2 className="w-3 h-3 text-cyan-700" /> SUB-VENDOR
              </span>
            ) : isMasterOrAdmin ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <ShieldCheck className="w-3 h-3 text-amber-700" /> MASTER ADMIN
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                <ShieldCheck className="w-3 h-3 text-indigo-700" /> SUPERVISOR
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Live Sync
            </span>
          </div>

          {isSubVendor && userProfile?.vendorName && (
            <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-950 text-xs font-bold flex items-center gap-1.5 truncate">
              <Building2 className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
              <span className="truncate">{userProfile.vendorName}</span>
            </div>
          )}
        </div>

        {/* Scrollable Navigation & Operations */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Section: Views */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#78716c] px-2">
              Views & Telemetry
            </div>

            {(!isSubVendor || vendorPerms.canViewFleetTable) && (
              <button
                type="button"
                id="sidebar-btn-table"
                onClick={() => {
                  setCurrentView('dashboard');
                  setFleetTab('table');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 cursor-pointer text-left ${
                  currentView === 'dashboard' && fleetTab === 'table'
                    ? 'bg-amber-400 text-[#1c1917] shadow-xs font-black'
                    : 'text-[#57534e] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                }`}
              >
                <TableIcon className={`w-4 h-4 shrink-0 ${currentView === 'dashboard' && fleetTab === 'table' ? 'text-[#1c1917]' : 'text-amber-600'}`} />
                <span className="flex-1">Fleet Table</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${currentView === 'dashboard' && fleetTab === 'table' ? 'bg-[#1c1917] text-white' : 'bg-[#f5f0e6] text-[#57534e]'}`}>
                  {visibleFleetList.length}
                </span>
              </button>
            )}

            {(!isSubVendor || vendorPerms.canViewDrivers) && (
              <button
                type="button"
                id="sidebar-btn-drivers"
                onClick={() => {
                  setCurrentView('dashboard');
                  setFleetTab('drivers');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 cursor-pointer text-left ${
                  currentView === 'dashboard' && fleetTab === 'drivers'
                    ? 'bg-amber-400 text-[#1c1917] shadow-xs font-black'
                    : 'text-[#57534e] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                }`}
              >
                <Smartphone className={`w-4 h-4 shrink-0 ${currentView === 'dashboard' && fleetTab === 'drivers' ? 'text-[#1c1917]' : 'text-amber-700'}`} />
                <span className="flex-1">Registered Drivers</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${currentView === 'dashboard' && fleetTab === 'drivers' ? 'bg-[#1c1917] text-white' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
                  {scopedDriverUsers.length}
                </span>
              </button>
            )}

            {(!isSubVendor || vendorPerms.canViewMap) && (
              <button
                type="button"
                id="sidebar-btn-map"
                onClick={() => {
                  setCurrentView('dashboard');
                  setFleetTab('map');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 cursor-pointer text-left ${
                  currentView === 'dashboard' && fleetTab === 'map'
                    ? 'bg-amber-400 text-[#1c1917] shadow-xs font-black'
                    : 'text-[#57534e] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                }`}
              >
                <MapIcon className={`w-4 h-4 shrink-0 ${currentView === 'dashboard' && fleetTab === 'map' ? 'text-[#1c1917]' : 'text-cyan-600'}`} />
                <span className="flex-1">Live GPS Map</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
              </button>
            )}

            {(!isSubVendor || vendorPerms.canViewAttendance) && (
              <button
                type="button"
                id="sidebar-btn-attendance"
                onClick={() => {
                  setCurrentView('dashboard');
                  setFleetTab('attendance');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 cursor-pointer text-left ${
                  currentView === 'dashboard' && fleetTab === 'attendance'
                    ? 'bg-amber-400 text-[#1c1917] shadow-xs font-black'
                    : 'text-[#57534e] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                }`}
              >
                <UserCheck className={`w-4 h-4 shrink-0 ${currentView === 'dashboard' && fleetTab === 'attendance' ? 'text-[#1c1917]' : 'text-amber-600'}`} />
                <span className="flex-1">Driver Attendance</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${currentView === 'dashboard' && fleetTab === 'attendance' ? 'bg-[#1c1917] text-amber-300' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
                  Punch
                </span>
              </button>
            )}

            {(!isSubVendor || vendorPerms.canViewReports) && (
              <button
                type="button"
                id="sidebar-btn-reports"
                onClick={() => {
                  setCurrentView('dashboard');
                  setFleetTab('reports');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 cursor-pointer text-left ${
                  currentView === 'dashboard' && fleetTab === 'reports'
                    ? 'bg-amber-400 text-[#1c1917] shadow-xs font-black'
                    : 'text-[#57534e] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                }`}
              >
                <FileSpreadsheet className={`w-4 h-4 shrink-0 ${currentView === 'dashboard' && fleetTab === 'reports' ? 'text-[#1c1917]' : 'text-emerald-600'}`} />
                <span className="flex-1">Location Logs Report</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${currentView === 'dashboard' && fleetTab === 'reports' ? 'bg-[#1c1917] text-white' : 'bg-[#f5f0e6] text-[#57534e] border border-[#ded7c8]'}`}>
                  Audit
                </span>
              </button>
            )}

            {/* Sub-Vendors Management Tab for Master Admin */}
            {isMasterOrAdmin && (
              <button
                type="button"
                id="sidebar-btn-subvendors"
                onClick={() => {
                  setCurrentView('subvendors');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 cursor-pointer text-left ${
                  currentView === 'subvendors'
                    ? 'bg-amber-400 text-[#1c1917] shadow-xs font-black'
                    : 'text-[#57534e] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                }`}
              >
                <Building2 className={`w-4 h-4 shrink-0 ${currentView === 'subvendors' ? 'text-[#1c1917]' : 'text-cyan-700'}`} />
                <span className="flex-1">Sub-Vendors & Rights</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${currentView === 'subvendors' ? 'bg-[#1c1917] text-white' : 'bg-cyan-50 text-cyan-900 border border-cyan-200'}`}>
                  {subVendorsList.length}
                </span>
              </button>
            )}

            {!isSubVendor && (
              <button
                type="button"
                id="sidebar-btn-team"
                onClick={() => {
                  setCurrentView('team');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 cursor-pointer text-left ${
                  currentView === 'team'
                    ? 'bg-amber-400 text-[#1c1917] shadow-xs font-black'
                    : 'text-[#57534e] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                }`}
              >
                <Users className={`w-4 h-4 shrink-0 ${currentView === 'team' ? 'text-[#1c1917]' : 'text-indigo-600'}`} />
                <span className="flex-1">Team Settings</span>
              </button>
            )}
          </div>

          {/* Section: Fleet Actions */}
          <div className="space-y-2 pt-2 border-t border-[#e6e0d4]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#78716c] px-2">
              Fleet Operations
            </div>

            {/* Add Real Cab Single Entry Button */}
            {(!isSubVendor || vendorPerms.canAddCab) && (
              <button
                type="button"
                id="btn-sidebar-add-cab"
                onClick={() => {
                  setIsAddCabModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Cab</span>
              </button>
            )}

            {/* Upload Fleet List Button */}
            {(!isSubVendor || vendorPerms.canAddCab) && (
              <button
                type="button"
                id="btn-sidebar-upload-fleet"
                onClick={() => {
                  setIsUploadModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload Fleet List</span>
              </button>
            )}

            {/* Driver Mobile Setup Modal Button */}
            <button
              type="button"
              id="btn-sidebar-driver-install"
              onClick={() => {
                setIsDriverInstallModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] font-semibold text-xs transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-amber-700" />
              <span>Driver Mobile Setup</span>
            </button>

            {/* Purge / Clear Demo Data Button - Master Admin Only */}
            {isMasterOrAdmin && (
              <button
                type="button"
                id="btn-sidebar-clear-data"
                onClick={() => {
                  setShowClearConfirm(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full px-3.5 py-2 rounded-xl bg-transparent hover:bg-rose-50 text-[#78716c] hover:text-rose-600 font-medium text-xs transition flex items-center gap-2 cursor-pointer"
                title="Purge dummy cabs, duties, and demo data"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Demo Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Footer: Supervisor User Info & Sign Out */}
        <div className="p-4 border-t border-[#e6e0d4] space-y-3 bg-[#faf7f2]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-amber-200 border border-amber-400 flex items-center justify-center font-bold text-amber-900 text-xs shrink-0">
              {(userProfile?.name || 'S').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#1c1917] truncate">
                {userProfile?.name || 'Operations Supervisor'}
              </div>
              <div className="text-[10px] text-[#78716c] flex items-center gap-1 font-mono truncate">
                <Phone className="w-2.5 h-2.5 text-[#a8a29e] shrink-0" />
                <span>{userProfile?.phoneNumber || 'Dispatch'}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            id="btn-sidebar-signout"
            onClick={() => signOut()}
            className="w-full px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-[#57534e] hover:text-rose-700 border border-[#ded7c8] hover:border-rose-300 text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Backdrop overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-stone-900/40 z-40 md:hidden backdrop-blur-xs"
        />
      )}

      {/* MAIN CONTENT AREA - EXPANDED FULL WIDTH */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#f8f6f0]">
        {/* Banner if Master Admin / Supervisor opened the vendor portal URL (?role=vendor) */}
        {isVendorDeepLinkInUrl && !isSubVendor && (
          <div className="bg-cyan-950 text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-800 text-xs shadow-md">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <div>
                <span className="font-bold text-cyan-200">Sub-Vendor Portal Link Active:</span>{' '}
                <span>
                  You are currently logged in as <strong>{userProfile?.email}</strong> (Role: <span className="uppercase text-amber-300 font-mono font-bold">{userProfile?.role}</span>). To access the sub-vendor portal and see only assigned cabs, sign out and sign in with your vendor account.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-switch-to-demo-vendor"
                onClick={async () => {
                  try {
                    await signIn('vendor@fleet.com', 'Vendor@12345');
                  } catch (e) {
                    console.error('Failed to switch to demo vendor:', e);
                  }
                }}
                className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-[#1c1917] font-bold rounded-lg transition shadow-xs cursor-pointer text-xs"
              >
                Switch to Demo Vendor
              </button>
              <button
                type="button"
                id="btn-signout-for-vendor"
                onClick={() => signOut()}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition text-xs font-semibold cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Sub-Vendor Active Workspace Status Bar */}
        {isSubVendor && (
          <div className="bg-cyan-900 text-white px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-cyan-800 shadow-xs">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>
                <strong className="text-cyan-200">Sub-Vendor Portal:</strong> {userProfile?.vendorName || userProfile?.name} &bull; Showing only <strong>{visibleFleetList.length} assigned {visibleFleetList.length === 1 ? 'cab' : 'cabs'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] bg-cyan-800 text-cyan-200 px-2 py-0.5 rounded font-mono border border-cyan-700">
                Restricted Vendor View
              </span>
              <button
                type="button"
                id="btn-subvendor-bar-signout"
                onClick={() => signOut()}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center gap-1 cursor-pointer shadow-xs"
                title="Sign out of Vendor Portal"
              >
                <LogOut className="w-3 h-3 text-white shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* Top Header inside main view */}
        <header className="border-b border-[#e6e0d4] bg-white/95 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3.5 shadow-xs">
          <div className="w-full mx-auto flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1c1917]">
                {currentView === 'team'
                  ? 'Team & Driver Accounts'
                  : fleetTab === 'map'
                  ? 'Live GPS Fleet Tracking Map'
                  : fleetTab === 'reports'
                  ? 'Date-Wise Location Logs Report'
                  : fleetTab === 'attendance'
                  ? 'Driver Attendance Register'
                  : isSubVendor
                  ? `${userProfile?.vendorName || 'Vendor'} - Assigned Fleet`
                  : 'Fleet Operations Dashboard'}
              </h2>
              <p className="text-xs text-[#78716c]">
                {currentView === 'team'
                  ? 'Manage supervisor and driver credentials'
                  : fleetTab === 'map'
                  ? 'Real-time vehicle coordinates & telemetry on Google Map'
                  : fleetTab === 'reports'
                  ? 'Exportable audit history of duty and location punches'
                  : fleetTab === 'attendance'
                  ? 'Daily biometric & duty attendance punch records (12-Hour continuous shift tracking)'
                  : isSubVendor
                  ? `Tracking ${visibleFleetList.length} assigned cabs for ${userProfile?.vendorName || 'your vendor account'}`
                  : `Managing ${fleetList.length} registered vehicles across hubs`}
              </p>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-2">
              {/* Sound Notification Alert Toggle on Location Punch */}
              <div className="flex items-center gap-1 bg-[#faf7f2] border border-[#ded7c8] rounded-xl p-1 shadow-xs">
                <button
                  type="button"
                  id="btn-toggle-sound-alerts"
                  onClick={() => {
                    const next = !isSoundEnabled;
                    soundNotificationService.setEnabled(next);
                    setIsSoundEnabled(next);
                    if (next) {
                      soundNotificationService.playLocationPunchChime();
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    isSoundEnabled
                      ? 'bg-amber-400 text-[#1c1917] shadow-xs'
                      : 'text-[#78716c] hover:text-[#1c1917]'
                  }`}
                  title={isSoundEnabled ? 'Audio Chime is ON: Rings when driver punches location' : 'Audio Chime is MUTED'}
                >
                  {isSoundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-stone-950 shrink-0" />
                      <span className="hidden sm:inline">Punch Sound: ON</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                      <span className="hidden sm:inline">Punch Sound: OFF</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  id="btn-test-punch-sound"
                  onClick={() => {
                    soundNotificationService.playLocationPunchChime();
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 rounded-md transition cursor-pointer hidden sm:block"
                  title="Test location punch audio chime"
                >
                  Test
                </button>
              </div>

              {fleetTab === 'map' && currentView === 'dashboard' && (
                <button
                  type="button"
                  id="btn-toggle-auto-focus"
                  onClick={() => setAutoFocusTracking(!autoFocusTracking)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    autoFocusTracking
                      ? 'bg-cyan-50 text-cyan-900 border-cyan-300 shadow-xs'
                      : 'bg-[#f5f0e6] text-[#78716c] border-[#ded7c8]'
                  }`}
                >
                  <Crosshair className={`w-3.5 h-3.5 ${autoFocusTracking ? 'text-cyan-600 animate-spin' : 'text-[#78716c]'}`} style={{ animationDuration: '6s' }} />
                  <span className="hidden sm:inline">Auto-Focus: {autoFocusTracking ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {(!isSubVendor || vendorPerms.canAddCab) && (
                <button
                  type="button"
                  id="btn-header-upload-fleet"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  title="Bulk upload cabs from Excel or paste from Google Sheets"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bulk Upload Cabs</span>
                  <span className="sm:hidden">Upload</span>
                </button>
              )}

              {(!isSubVendor || vendorPerms.canAddCab) && (
                <button
                  type="button"
                  id="btn-header-add-cab"
                  onClick={() => setIsAddCabModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  title="Add a single cab"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Cab</span>
                </button>
              )}

              {/* Prominent Sign Out Button on top right corner for Admin & Vendor Dashboards */}
              <button
                type="button"
                id="btn-header-top-signout"
                onClick={() => signOut()}
                className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 hover:text-rose-800 border border-rose-300 font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                title={`Sign out of ${isSubVendor ? userProfile?.vendorName || 'Vendor' : 'Admin'} Dashboard`}
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0 stroke-[2.5]" />
                <span className="inline font-bold">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Punch Notification Audio & Visual Alert Banner */}
        {punchToast && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-emerald-100 to-white border-2 border-emerald-500 shadow-md flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs font-black">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                    Driver Location Punched &bull; Standing Free
                  </span>
                  <span className="font-mono text-xs font-bold bg-emerald-200 text-emerald-950 px-2 py-0.5 rounded-md border border-emerald-300">
                    {punchToast.cabNumber}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-xs">
                    Free
                  </span>
                  <span className="text-[11px] text-[#78716c]">{punchToast.timeStr}</span>
                </div>
                <div className="text-xs text-[#1c1917] mt-0.5 font-medium truncate">
                  <strong>{punchToast.driverName}</strong> punched location — standing <strong>Free</strong> at:{' '}
                  <span className="text-emerald-950 font-bold">{punchToast.locationText}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setFocusedCabNumber(punchToast.cabNumber);
                  setFleetTab('map');
                }}
                className="px-3 py-1.5 rounded-xl bg-[#1c1917] hover:bg-stone-800 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">View on Map</span>
              </button>
              <button
                type="button"
                onClick={() => setPunchToast(null)}
                className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Body */}
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Toast / Status Alert */}
          {actionSuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{actionSuccessMsg}</span>
              </div>
            </div>
          )}

          {/* Mobile Registered Drivers Awaiting Cab Alert Banner */}
          {driverUsers.filter((d) => !d.cabNumber || d.cabNumber.trim() === '').length > 0 &&
            fleetTab !== 'drivers' &&
            currentView !== 'team' && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#1c1917]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-200/90 text-amber-900 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      <span>
                        {driverUsers.filter((d) => !d.cabNumber || d.cabNumber.trim() === '').length} Driver(s) recently registered via mobile awaiting cab assignment
                      </span>
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    </div>
                    <p className="text-[#78716c] text-[11px] mt-0.5">
                      Newly registered mobile drivers automatically appear in your database. Assign them a cab number to begin tracking.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-banner-view-drivers"
                  onClick={() => {
                    setCurrentView('dashboard');
                    setFleetTab('drivers');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shrink-0 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>View & Assign Drivers</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          {/* Sub-Vendor Suspended Notice */}
          {isSubVendor && userProfile?.status === 'suspended' ? (
            <div className="p-8 max-w-xl mx-auto my-12 bg-white border-2 border-rose-300 rounded-3xl shadow-xl text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center mx-auto text-rose-600">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-rose-950">Sub-Vendor Portal Suspended</h3>
              <p className="text-xs text-[#57534e] leading-relaxed">
                Access for <strong>{userProfile?.vendorName || 'your vendor account'}</strong> has been temporarily suspended by the Master Administrator. Please contact operations dispatch to restore your fleet access rights.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : currentView === 'team' ? (
            <TeamSettingsPage onBack={() => setCurrentView('dashboard')} />
          ) : currentView === 'subvendors' ? (
            <SubVendorsManagementView
              fleetList={fleetList || []}
              subVendors={subVendorsList}
              onBack={() => setCurrentView('dashboard')}
            />
          ) : (
            <>
              {/* TWO SUMMARY CARDS: "Cab Off Duty" & "Cabs on Duty" */}
              <section aria-label="Fleet Summary Cards" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Card 1: Cab Off Duty (Neutral / Stone Theme) */}
                <div
                  id="summary-card-free-cabs"
                  onClick={() => setStatusFilter(statusFilter === 'free' || statusFilter === 'cab_off_duty' ? 'all' : 'cab_off_duty')}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer select-none relative overflow-hidden flex flex-col justify-between shadow-xs ${
                    statusFilter === 'free' || statusFilter === 'cab_off_duty'
                      ? 'bg-stone-100 border-stone-400 ring-2 ring-stone-400/20'
                      : 'bg-white border-[#e6e0d4] hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-stone-500" />
                      <span className="text-xs uppercase tracking-wider font-bold text-stone-800">
                        Cab Off Duty
                      </span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-300 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-stone-700" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl sm:text-4xl font-black text-[#1c1917] tracking-tight">
                        {offDutyCabsCount}
                      </span>
                      <span className="text-xs text-[#78716c] ml-2 font-medium">available off duty cabs</span>
                    </div>
                    <span className="text-[11px] font-bold text-stone-800 bg-stone-100 px-2.5 py-1 rounded-lg border border-stone-300">
                      Cab Off Duty
                    </span>
                  </div>

                  <p className="text-[11px] text-[#78716c] mt-2">
                    Vehicles with ended duty or awaiting driver shift punch-in.
                  </p>
                </div>

                {/* Card 2: Cabs on Duty (Blue Theme) */}
                <div
                  id="summary-card-on-duty"
                  onClick={() => setStatusFilter(statusFilter === 'on_duty' ? 'all' : 'on_duty')}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer select-none relative overflow-hidden flex flex-col justify-between shadow-xs ${
                    statusFilter === 'on_duty'
                      ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-400/20'
                      : 'bg-white border-[#e6e0d4] hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-xs uppercase tracking-wider font-bold text-blue-800">
                        Cabs on Duty
                      </span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-blue-100 border border-blue-300 flex items-center justify-center">
                      <Radio className="w-5 h-5 text-blue-700" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl sm:text-4xl font-black text-[#1c1917] tracking-tight">
                        {onDutyCount}
                      </span>
                      <span className="text-xs text-[#78716c] ml-2 font-medium">active on duty</span>
                    </div>
                    <span className="text-[11px] font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-300">
                      Active Trips
                    </span>
                  </div>

                  <p className="text-[11px] text-[#78716c] mt-2">
                    Cabs currently executing an active duty or transportation trip.
                  </p>
                </div>
              </section>

        {/* Tab 0: Registered Drivers List & Account Directory */}
        {fleetTab === 'drivers' && (
          <RegisteredDriversView
            drivers={scopedDriverUsers}
            fleetList={visibleFleetList}
            currentSupervisorSite={userProfile?.site}
            onOpenBulkUpload={() => setIsUploadModalOpen(true)}
            onOpenAddCab={() => setIsAddCabModalOpen(true)}
          />
        )}

        {/* Tab 1: Live Map View */}
        {fleetTab === 'map' && (
          <FleetLiveMapView
            fleetList={visibleFleetList}
            focusedCabNumber={focusedCabNumber}
          />
        )}

        {/* Tab 2: Searchable, Filterable, Sortable Fleet Table */}
        {fleetTab === 'table' && (
          <section className="bg-white border border-[#e6e0d4] rounded-2xl p-4 sm:p-6 space-y-4 shadow-xs">
          {/* Controls Bar: Search, Status Filter Pills & Quick Sort Dropdowns */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
              <input
                id="input-search-cabs"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Cab Number, Driver Name, Hub, Location..."
                className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:border-amber-400 focus:outline-none transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-xs text-[#78716c] hover:text-[#1c1917]"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filter Pills & Sort Selectors */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Status Filter Tabs - Showing only Cab Off Duty and Cabs on Duty */}
              <div className="flex items-center bg-[#faf7f2] p-1 rounded-xl border border-[#ded7c8]">
                <button
                  type="button"
                  id="filter-all"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'all'
                      ? 'bg-white text-[#1c1917] shadow-xs font-bold'
                      : 'text-[#78716c] hover:text-[#1c1917]'
                  }`}
                >
                  All ({visibleFleetList.length})
                </button>
                <button
                  type="button"
                  id="filter-free"
                  onClick={() => setStatusFilter(statusFilter === 'free' || statusFilter === 'cab_off_duty' ? 'all' : 'free')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'free' || statusFilter === 'cab_off_duty'
                      ? 'bg-emerald-100 text-emerald-950 border border-emerald-400 shadow-xs font-bold'
                      : 'text-[#78716c] hover:text-emerald-900'
                  }`}
                >
                  Free ({offDutyCabsCount})
                </button>
                <button
                  type="button"
                  id="filter-on-duty"
                  onClick={() => setStatusFilter('on_duty')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'on_duty'
                      ? 'bg-blue-100 text-blue-900 border border-blue-300 shadow-xs font-bold'
                      : 'text-[#78716c] hover:text-blue-700'
                  }`}
                >
                  Cabs on Duty ({onDutyCount})
                </button>
              </div>

              {/* Sort selector dropdown & trigger */}
              <div className="flex items-center gap-1.5 bg-[#faf7f2] px-3 py-1.5 rounded-xl border border-[#ded7c8]">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#78716c]" />
                <span className="text-[#78716c] text-[11px]">Sort:</span>
                <select
                  id="select-sort-by"
                  value={sortBy}
                  onChange={(e) => {
                    const val = e.target.value as 'lastUpdated' | 'status' | 'cabNumber';
                    setSortBy(val);
                  }}
                  className="bg-transparent text-[#1c1917] font-medium text-xs focus:outline-none cursor-pointer"
                >
                  <option value="lastUpdated" className="bg-white text-[#1c1917]">Last Updated</option>
                  <option value="status" className="bg-white text-[#1c1917]">Status</option>
                  <option value="cabNumber" className="bg-white text-[#1c1917]">Cab Number</option>
                </select>

                <button
                  type="button"
                  id="btn-toggle-sort-order"
                  onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="p-1 rounded text-[#78716c] hover:text-[#1c1917] font-bold text-[11px] ml-1 cursor-pointer"
                  title="Toggle Ascending / Descending"
                >
                  {sortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
                </button>
              </div>

              {/* Quick Add Cab button in table toolbar */}
              {(!isSubVendor || vendorPerms.canAddCab) && (
                <button
                  type="button"
                  id="btn-table-toolbar-add-cab"
                  onClick={() => setIsAddCabModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Cab</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Filter indicator */}
          {(statusFilter !== 'all' || searchTerm.trim()) && (
            <div className="flex items-center gap-2 text-[11px] text-[#57534e] bg-[#f5f0e6] px-3 py-1.5 rounded-lg border border-[#ded7c8]">
              <Filter className="w-3 h-3 text-amber-700" />
              <span>
                Showing {filteredAndSortedCabs.length} of {visibleFleetList.length} {isSubVendor ? 'assigned cabs' : 'total cabs'}
              </span>
              {statusFilter !== 'all' && (
                <span className="font-semibold text-amber-800">
                  (Filter: {statusFilter === 'on_duty' ? 'Cabs on Duty' : 'Free (Standing Available)'})
                </span>
              )}
              {searchTerm && (
                <span className="text-[#1c1917] font-semibold">
                  matching &quot;{searchTerm}&quot;
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setSearchTerm('');
                }}
                className="text-amber-800 hover:underline ml-auto font-semibold cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}

          {/* Table Container */}
          <div className="border border-[#e6e0d4] rounded-xl overflow-hidden bg-white">
            {filteredAndSortedCabs.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center text-[#78716c] px-4">
                {isSubVendor && visibleFleetList.length === 0 ? (
                  <>
                    <Building2 className="w-12 h-12 text-cyan-600 mb-3" />
                    <p className="text-base font-bold text-[#1c1917]">
                      No Cabs Assigned to Your Vendor Account
                    </p>
                    <p className="text-xs text-[#78716c] mt-1 max-w-md">
                      Your vendor profile ({userProfile?.vendorName || userProfile?.name}) currently has no vehicle registration numbers allocated. Please contact the Master Administrator to assign cabs to your company roster.
                    </p>
                  </>
                ) : (
                  <>
                    <Car className="w-12 h-12 text-[#a8a29e] mb-3" />
                    <p className="text-base font-semibold text-[#1c1917]">
                      {visibleFleetList.length === 0
                        ? 'No Cabs in Fleet Registry'
                        : 'No matching cabs found'}
                    </p>
                    <p className="text-xs text-[#78716c] mt-1 max-w-sm">
                      {visibleFleetList.length === 0
                        ? 'Click "Add Cab" or "Upload Fleet List" to register vehicles in the system.'
                        : 'Try adjusting your search keywords or status filter.'}
                    </p>
                    {visibleFleetList.length === 0 && !isSubVendor && (
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          type="button"
                          id="btn-empty-add-cab"
                          onClick={() => setIsAddCabModalOpen(true)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Real Cab</span>
                        </button>
                        <button
                          type="button"
                          id="btn-empty-upload-fleet"
                          onClick={() => setIsUploadModalOpen(true)}
                          className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <UploadCloud className="w-4 h-4" />
                          <span>Upload Fleet List</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#1c1917]">
                  <thead className="bg-[#faf7f2] text-[#78716c] uppercase tracking-wider text-[10px] border-b border-[#e6e0d4]">
                    <tr>
                      {/* Column: Cab Number */}
                      <th
                        className="py-3.5 px-4 font-bold cursor-pointer hover:text-[#1c1917] transition"
                        onClick={() => toggleSort('cabNumber')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Cab Number</span>
                          {sortBy === 'cabNumber' && (
                            <span className="text-amber-700 font-bold">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Column: Driver Name */}
                      <th className="py-3.5 px-4 font-bold">Driver Details</th>

                      {/* Column: Status ("Cab Off Duty" or "Cabs on Duty") */}
                      <th
                        className="py-3.5 px-4 font-bold cursor-pointer hover:text-[#1c1917] transition"
                        onClick={() => toggleSort('status')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Status</span>
                          {sortBy === 'status' && (
                            <span className="text-amber-700 font-bold">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Column: Ideal Standing Location */}
                      <th className="py-3.5 px-4 font-bold min-w-[280px]">
                        <div className="flex items-center gap-1.5 text-[#57534e]">
                          <MapPin className="w-4 h-4 text-amber-600" />
                          <span>Ideal Standing Location</span>
                        </div>
                      </th>

                      {/* Column: Last Updated ("x minutes ago") */}
                      <th
                        className="py-3.5 px-4 font-bold cursor-pointer hover:text-[#1c1917] transition"
                        onClick={() => toggleSort('lastUpdated')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Last Updated</span>
                          {sortBy === 'lastUpdated' && (
                            <span className="text-amber-700 font-bold">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Column: Action */}
                      <th className="py-3.5 px-4 font-bold text-right">Actions & Tracking</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#e6e0d4] font-sans">
                    {filteredAndSortedCabs.map((cab) => {
                      const isOnDuty = cab.status === 'on_duty';
                      const isRecentlyPunched = Boolean(
                        recentlyPunchedCab &&
                        (normalizeCab(cab.cabNumber) === normalizeCab(recentlyPunchedCab) ||
                         cleanCabForCompare(cab.cabNumber) === cleanCabForCompare(recentlyPunchedCab))
                      );

                      return (
                        <tr
                          key={cab.id || cab.cabNumber}
                          className={`transition-all duration-500 ${
                            isRecentlyPunched
                              ? 'bg-emerald-50/95 ring-2 ring-emerald-500 shadow-sm'
                              : focusedCabNumber === cab.cabNumber
                              ? 'bg-cyan-50/80 ring-1 ring-cyan-400/40'
                              : 'hover:bg-[#faf7f2]/80'
                          }`}
                        >
                          {/* Cab Number */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-[#1c1917] text-sm">
                                {cab.cabNumber}
                              </span>
                              {isRecentlyPunched && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-950 border border-emerald-500 animate-pulse flex items-center gap-1 shadow-2xs">
                                  <span>🔔</span> Just Punched Free
                                </span>
                              )}
                              {focusedCabNumber === cab.cabNumber && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-900 border border-cyan-300">
                                  Tracked
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#78716c]">
                              {cab.vehicleType || 'Sedan'}
                            </div>
                          </td>

                          {/* Driver Name & Phone with 1st Driver & 2nd Driver - highlights whichever driver is on duty (Live) */}
                          <td className="py-3.5 px-4 min-w-[230px]">
                            {(() => {
                              const activeSlot = cab.activeDriverSlot;
                              const isSecondActive = isOnDuty && activeSlot === 'second';
                              const isFirstActive = isOnDuty && !isSecondActive;

                              const firstDriverName = cab.firstDriverName || (!cab.secondDriverName ? cab.driverName : '');
                              const firstDriverPhone = cab.firstDriverPhone || (!cab.secondDriverName ? cab.driverPhone : '');
                              const secondDriverName = cab.secondDriverName;
                              const secondDriverPhone = cab.secondDriverPhone;

                              return (
                                <div className="space-y-1.5">
                                  {/* 1st Driver */}
                                  <div className={`p-1.5 rounded-lg transition-colors ${
                                    isFirstActive
                                      ? 'bg-amber-100/70 border border-amber-300 shadow-2xs'
                                      : 'bg-[#fbf9f5] border border-transparent'
                                  }`}>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        isFirstActive
                                          ? 'bg-amber-500 text-stone-950 font-black'
                                          : 'bg-stone-200 text-stone-700'
                                      }`}>
                                        1st Driver
                                      </span>
                                      <span className={`text-xs ${isFirstActive ? 'font-bold text-[#1c1917]' : 'font-medium text-[#44403c]'} truncate`}>
                                        {firstDriverName || 'Unassigned'}
                                      </span>
                                      {isFirstActive && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                          Live on Duty
                                        </span>
                                      )}
                                    </div>
                                    {firstDriverPhone && (
                                      <div className="text-[10px] text-[#78716c] font-mono pl-0.5 pt-0.5">
                                        {firstDriverPhone}
                                      </div>
                                    )}
                                  </div>

                                  {/* 2nd Driver */}
                                  {secondDriverName ? (
                                    <div className={`p-1.5 rounded-lg transition-colors ${
                                      isSecondActive
                                        ? 'bg-amber-100/70 border border-amber-300 shadow-2xs'
                                        : 'bg-[#fbf9f5] border border-transparent'
                                    }`}>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          isSecondActive
                                            ? 'bg-amber-500 text-stone-950 font-black'
                                            : 'bg-stone-200 text-stone-700'
                                        }`}>
                                          2nd Driver
                                        </span>
                                        <span className={`text-xs ${isSecondActive ? 'font-bold text-[#1c1917]' : 'font-medium text-[#44403c]'} truncate`}>
                                          {secondDriverName}
                                        </span>
                                        {isSecondActive && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                            Live on Duty
                                          </span>
                                        )}
                                      </div>
                                      {secondDriverPhone && (
                                        <div className="text-[10px] text-[#78716c] font-mono pl-0.5 pt-0.5">
                                          {secondDriverPhone}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-amber-800/70 italic px-1.5">
                                      2nd Driver: Available for roster
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Status: "Cabs on Duty" or "Cab Off Duty", with Duty Start Location and Duty End Location */}
                          <td className="py-3.5 px-4 min-w-[260px]">
                            <div className="space-y-2">
                              {/* Status Tag */}
                              <div className="flex items-center gap-2">
                                {isOnDuty ? (
                                  <span
                                    id={`badge-status-${cab.cabNumber}`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 shadow-xs"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                    Cabs on Duty
                                  </span>
                                ) : (
                                  <span
                                    id={`badge-status-${cab.cabNumber}`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-xs"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                    Free (Cab Off Duty)
                                  </span>
                                )}

                                {cab.isMoving && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-100 text-cyan-900 border border-cyan-300">
                                    <Radio className="w-2.5 h-2.5 text-cyan-600 animate-pulse" />
                                    Moving {cab.speed ? `• ${Math.round(cab.speed)} km/h` : ''}
                                  </span>
                                )}
                              </div>

                              {/* Duty Start & Duty End Locations captured via Punch In & 12 hrs Duty */}
                              <div className="bg-[#faf7f2] border border-[#e6e0d4] rounded-xl p-2.5 space-y-1.5 text-xs">
                                <div className="flex items-start gap-1.5">
                                  <span className="font-bold text-amber-900 shrink-0 text-[11px]">Duty Starts:</span>
                                  <span
                                    className="text-[#1c1917] font-semibold text-[11px] truncate"
                                    title={cab.dutyStartLocation || (isOnDuty ? (cab.currentLocationText || 'Duty started') : (cab.baseHub || 'Hub Base'))}
                                  >
                                    {cab.dutyStartLocation || (isOnDuty ? (cab.currentLocationText || 'Current GPS Location') : (cab.baseHub || 'Depot Base'))}
                                  </span>
                                </div>

                                <div className="flex items-start gap-1.5">
                                  <span className="font-bold text-[#57534e] shrink-0 text-[11px]">Duty Ends (12h):</span>
                                  <span
                                    className="text-[#44403c] font-medium text-[11px] truncate"
                                    title={cab.dutyEndLocation || (isOnDuty ? 'In Progress (12 hrs Shift)' : (cab.lastPunchedLocation || 'Awaiting Shift'))}
                                  >
                                    {cab.dutyEndLocation || (isOnDuty ? 'In Progress (12 hrs Shift)' : (cab.lastPunchedLocation || cab.baseHub || 'Completed'))}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Ideal Standing Location: Displays location when driver presses "Punch Current Location" */}
                          <td className="py-3.5 px-4 min-w-[280px]">
                            {(() => {
                              const lat = cab.lastPunchedLat || cab.currentLocationLat;
                              const lng = cab.lastPunchedLng || cab.currentLocationLng;
                              const hasCoords = typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0;

                              const standingLocation =
                                cab.lastPunchedLocation ||
                                cab.currentLocationText ||
                                cab.baseHub ||
                                'Standing Location Pending';

                              const isPunched = Boolean(cab.lastPunchedLocation || cab.lastPunchedAt);

                              return (
                                <div className="space-y-1.5">
                                  {/* Standing Landmark / Address Name */}
                                  <div className="flex items-start gap-1.5">
                                    <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-xs font-bold text-[#1c1917] leading-tight" title={standingLocation}>
                                        {standingLocation}
                                      </div>
                                      <div className="text-[10px] text-[#78716c]">
                                        Base Hub: {cab.baseHub || 'Central Hub'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Standing Free Badge under Ideal Standing Location */}
                                  <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                                    <span
                                      id={`tag-standing-free-${cab.cabNumber}`}
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                                        isRecentlyPunched
                                          ? 'bg-emerald-200 text-emerald-950 border-2 border-emerald-500 ring-2 ring-emerald-300 shadow-md scale-105'
                                          : 'bg-emerald-100 text-emerald-950 border border-emerald-400 shadow-xs'
                                      }`}
                                      title="Cab is Standing Free at this location"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                      Free
                                    </span>

                                    {isPunched && (
                                      <span
                                        id={`tag-standing-punched-${cab.cabNumber}`}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200"
                                        title="Current location verified via driver GPS punch"
                                      >
                                        <CheckCircle2 className="w-3 h-3 text-teal-600 shrink-0" />
                                        Punched Location
                                      </span>
                                    )}

                                    {isRecentlyPunched && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-900 bg-emerald-200/90 px-2 py-0.5 rounded-full border border-emerald-400 shadow-2xs animate-bounce">
                                        🔔 Free Standing Alert
                                      </span>
                                    )}

                                    {hasCoords && (
                                      <a
                                        href={getGoogleMapsUrl(lat, lng)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] hover:text-[#1c1917] border border-[#ded7c8] transition flex items-center gap-1 shadow-xs"
                                        title="Verify vehicle location on Google Maps"
                                      >
                                        <ExternalLink className="w-3 h-3 text-[#78716c]" />
                                        <span>View Map</span>
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Last Updated ("x minutes ago") */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 text-[#78716c] font-medium">
                              <Clock className="w-3.5 h-3.5 text-[#a8a29e]" />
                              <span>{formatTimeAgo(cab.lastUpdated)}</span>
                            </div>
                          </td>

                          {/* Action Button: "Focus Map" button & "Delete Cab" button */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                id={`btn-focus-cab-${cab.cabNumber.replace(/[^A-Z0-9]/gi, '-').toLowerCase()}`}
                                onClick={() => handleFocusCabOnMap(cab)}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 border ${
                                  focusedCabNumber === cab.cabNumber
                                    ? 'bg-cyan-600 text-white border-cyan-700 ring-2 ring-cyan-400/30 font-black'
                                    : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border border-cyan-300'
                                }`}
                                title="Focus and track this cab on live map"
                              >
                                <Crosshair className={`w-3.5 h-3.5 ${focusedCabNumber === cab.cabNumber ? 'text-white animate-spin' : 'text-cyan-700'}`} style={{ animationDuration: '4s' }} />
                                <span>{focusedCabNumber === cab.cabNumber ? 'Tracking Live' : 'Focus Map'}</span>
                              </button>

                              {(!isSubVendor || vendorPerms.canDeleteCab) && (
                                <button
                                  type="button"
                                  id={`btn-delete-cab-${cab.cabNumber.replace(/[^A-Z0-9]/gi, '-').toLowerCase()}`}
                                  onClick={() => setCabToDelete(cab)}
                                  className="p-1.5 rounded-xl font-bold text-xs transition flex items-center justify-center cursor-pointer shadow-xs active:scale-95 border bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300"
                                  title={`Delete Cab ${cab.cabNumber} from fleet`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Tab 3: Date-Wise Cab Location & Billing Report */}
        {fleetTab === 'reports' && (
          <DateWiseLocationReport
            fleetList={visibleFleetList}
            onViewCabOnMap={(cabNo) => {
              setFocusedCabNumber(cabNo);
              setFleetTab('map');
            }}
          />
        )}

        {/* Tab 4: Driver Attendance Register (Attendance Punch System) */}
        {fleetTab === 'attendance' && (
          <AttendanceRegisterView
            fleetList={visibleFleetList}
            onViewCabOnMap={(cabNo) => {
              setFocusedCabNumber(cabNo);
              setFleetTab('map');
            }}
          />
        )}
            </>
          )}
        </main>
      </div>

      {/* Assign Duty Modal */}
      <AssignDutyModal
        cab={selectedCabForDuty}
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setSelectedCabForDuty(null);
        }}
        onSuccess={(cabNo) => {
          setActionSuccessMsg(
            `Duty successfully dispatched for ${cabNo}! Status set to "On Duty" and notifications marked read.`
          );
          setTimeout(() => setActionSuccessMsg(null), 5000);
        }}
      />

      {/* Add Single Cab Modal */}
      <AddCabModal
        isOpen={isAddCabModalOpen}
        onClose={() => setIsAddCabModalOpen(false)}
        onSwitchToBulkUpload={() => {
          setIsAddCabModalOpen(false);
          setIsUploadModalOpen(true);
        }}
        onSuccess={(cabNo) => {
          setActionSuccessMsg(
            `Cab ${cabNo} added successfully to live fleet!`
          );
          setTimeout(() => setActionSuccessMsg(null), 5000);
        }}
        existingCabNumbers={fleetList.map((c) => c.cabNumber)}
      />

      {/* Driver Mobile Install & QR Modal */}
      <DriverInstallModal
        isOpen={isDriverInstallModalOpen}
        onClose={() => setIsDriverInstallModalOpen(false)}
      />

      {/* Fleet Master Upload Modal */}
      <FleetMasterUpload
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadComplete={(stats) => {
          setActionSuccessMsg(
            `Fleet Master Upload Complete: +${stats.added} new cabs added, ${stats.updated} existing cabs updated, ${stats.skipped} skipped.`
          );
          setTimeout(() => setActionSuccessMsg(null), 5000);
        }}
      />

      {/* Clear / Purge Dummy Data Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
          <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1c1917]">Purge All Dummy Data?</h3>
                <p className="text-xs text-[#78716c]">Reset database for real fleet deployment</p>
              </div>
            </div>

            <p className="text-xs text-[#57534e] leading-relaxed">
              This will permanently delete all cabs from the <strong>fleet</strong> collection, past duty records, and telemetry alerts from your Firestore database so you can start clean with your real drivers and vehicles.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
              💡 Your current supervisor login account will <strong>not</strong> be deleted.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                id="btn-cancel-clear-data"
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-clear-data"
                onClick={handleClearFleetData}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                {isClearing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isClearing ? 'Purging Database...' : 'Yes, Purge Dummy Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Cab Confirmation Modal */}
      {cabToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs">
          <div className="bg-white border-2 border-rose-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-[#1c1917] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-3">
              <div className="flex items-center gap-2 text-rose-700">
                <div className="p-2 rounded-xl bg-rose-100 border border-rose-300">
                  <Trash2 className="w-5 h-5 text-rose-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1c1917]">Delete Cab from Fleet</h3>
                  <p className="text-[11px] text-[#78716c]">Permanent vehicle removal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCabToDelete(null)}
                disabled={isDeletingCab}
                className="p-1.5 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cab Details Summary Card */}
            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-900">Cab Registration:</span>
                <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-white border border-rose-300 text-rose-900">
                  {cabToDelete.cabNumber}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-900">Vehicle Type:</span>
                <span className="text-[#1c1917]">{cabToDelete.vehicleType || 'Sedan'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-900">Base Hub / Site:</span>
                <span className="text-[#1c1917]">{cabToDelete.baseHub || cabToDelete.site || 'North Terminal Hub'}</span>
              </div>
              {(cabToDelete.firstDriverName || cabToDelete.driverName) && (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-rose-900">1st Driver (Day):</span>
                  <span className="text-[#1c1917] font-medium">
                    {cabToDelete.firstDriverName || cabToDelete.driverName}{' '}
                    <span className="text-[#78716c] font-mono text-[11px]">
                      ({cabToDelete.firstDriverPhone || cabToDelete.driverPhone || '—'})
                    </span>
                  </span>
                </div>
              )}
              {cabToDelete.secondDriverName && (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-rose-900">2nd Driver (Night):</span>
                  <span className="text-[#1c1917] font-medium">
                    {cabToDelete.secondDriverName}{' '}
                    <span className="text-[#78716c] font-mono text-[11px]">({cabToDelete.secondDriverPhone || '—'})</span>
                  </span>
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Warning: This action cannot be undone.</p>
                <p className="text-[11px] text-[#78716c] mt-0.5">
                  This cab will be permanently removed from the active fleet and live GPS tracking map.
                </p>
              </div>
            </div>

            {/* Driver accounts handling options */}
            {(cabToDelete.firstDriverName || cabToDelete.driverName || cabToDelete.secondDriverName) && (
              <div className="space-y-2 bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8] text-xs">
                <p className="font-bold text-[#57534e]">Driver Accounts Associated With This Cab:</p>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={unlinkDriversOnCabDelete && !deleteDriversOnCabDelete}
                    disabled={deleteDriversOnCabDelete}
                    onChange={(e) => setUnlinkDriversOnCabDelete(e.target.checked)}
                    className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <span>
                    Keep driver accounts active (mark them as awaiting new cab reassignment)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-rose-800">
                  <input
                    type="checkbox"
                    checked={deleteDriversOnCabDelete}
                    onChange={(e) => {
                      setDeleteDriversOnCabDelete(e.target.checked);
                      if (e.target.checked) setUnlinkDriversOnCabDelete(true);
                    }}
                    className="rounded border-[#ded7c8] text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="font-semibold">
                    Also permanently delete assigned driver accounts from user database
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e6e0d4]">
              <button
                type="button"
                onClick={() => setCabToDelete(null)}
                disabled={isDeletingCab}
                className="px-4 py-2 rounded-xl text-[#78716c] hover:bg-[#f5f0e6] font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-cab"
                onClick={handleConfirmDeleteCab}
                disabled={isDeletingCab}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingCab ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Cab...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Cab</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
