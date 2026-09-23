import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FleetCab, LocationLogEventType } from '../types';
import { seedLocationAuditLogs } from '../lib/seedData';
import {
  Calendar,
  Download,
  Printer,
  Search,
  Car,
  MapPin,
  Clock,
  Copy,
  Check,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Navigation,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export interface ReportItem {
  id: string;
  timestamp: Date;
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:MM AM/PM
  cabNumber: string;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  eventType: LocationLogEventType;
  locationText: string;
  lat: number;
  lng: number;
  dutyId?: string | null;
  speed?: number;
  notes?: string;
}

interface DateWiseLocationReportProps {
  fleetList?: FleetCab[];
  onViewCabOnMap?: (cabNumber: string) => void;
}

export const DateWiseLocationReport: React.FC<DateWiseLocationReportProps> = ({
  fleetList = [],
  onViewCabOnMap,
}) => {
  // Helper for current date strings
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const getCurrentMonthString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // State: Month selector & date range
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthString());
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState<string>(() => getTodayString());

  // Instant Search & Filter state
  const [cabSearchQuery, setCabSearchQuery] = useState<string>('');
  const [selectedCab, setSelectedCab] = useState<string>('all');
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'cab_breakdown' | 'all_logs'>('cab_breakdown');
  const [expandedCab, setExpandedCab] = useState<string | null>(null);

  // Firestore data collections
  const [locationLogs, setLocationLogs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [duties, setDuties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Modal inspection
  const [inspectedLocation, setInspectedLocation] = useState<ReportItem | null>(null);

  // Set month and update start/end dates
  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    const [yearStr, monthStr] = newMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!isNaN(year) && !isNaN(month)) {
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDayObj = new Date(year, month, 0); // last day of month
      const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
      setStartDate(firstDay);
      setEndDate(lastDay);
    }
  };

  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) - 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const newMonth = `${year}-${String(month).padStart(2, '0')}`;
    handleMonthChange(newMonth);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const newMonth = `${year}-${String(month).padStart(2, '0')}`;
    handleMonthChange(newMonth);
  };

  // Quick Preset Handlers
  const handleSetPreset = (preset: 'this_month' | 'last_month' | 'today' | 'last7' | 'last30' | 'all') => {
    const now = new Date();
    const today = getTodayString();

    if (preset === 'this_month') {
      const currentMonth = getCurrentMonthString();
      handleMonthChange(currentMonth);
    } else if (preset === 'last_month') {
      let prevMonthNum = now.getMonth(); // 0-indexed, so last month is now.getMonth()
      let prevYear = now.getFullYear();
      if (prevMonthNum === 0) {
        prevMonthNum = 12;
        prevYear -= 1;
      }
      const prevMonthStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`;
      handleMonthChange(prevMonthStr);
    } else if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (preset === 'last30') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate('2030-12-31');
    }
  };

  // Real-time listener from Firestore
  useEffect(() => {
    setIsLoading(true);

    const unsubLogs = onSnapshot(
      query(collection(db, 'location_logs')),
      (snap) => {
        const items: any[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        setLocationLogs(items);
        setIsLoading(false);
      },
      (err) => {
        console.warn('location_logs listener notice:', err);
        setIsLoading(false);
      }
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications')),
      (snap) => {
        const items: any[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        setNotifications(items);
      },
      (err) => console.warn('notifications listener notice:', err)
    );

    const unsubDuties = onSnapshot(
      query(collection(db, 'duties')),
      (snap) => {
        const items: any[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        setDuties(items);
      },
      (err) => console.warn('duties listener notice:', err)
    );

    return () => {
      unsubLogs();
      unsubNotifs();
      unsubDuties();
    };
  }, []);

  // Helper to parse dates from various timestamp formats
  const parseToDate = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string') {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  // Build Cab metadata lookup map
  const cabMetaMap = useMemo(() => {
    const map = new Map<string, FleetCab>();
    fleetList.forEach((c) => {
      const clean = c.cabNumber?.toUpperCase().replace(/\s+/g, '');
      if (clean) map.set(clean, c);
    });
    return map;
  }, [fleetList]);

  // Aggregate and unify all location records into standardized ReportItem array
  const aggregatedReportItems: ReportItem[] = useMemo(() => {
    const items: ReportItem[] = [];
    const seenEventKeys = new Set<string>();
    const seenDutyIds = new Set<string>();

    const getEventKey = (cabNorm: string, dateStr: string, timeStr: string, eventType: string) => {
      return `${cabNorm}_${dateStr}_${timeStr}_${eventType}`;
    };

    // 1. Process dedicated location_logs
    locationLogs.forEach((log) => {
      const d = parseToDate(log.timestamp);
      if (!d) return;

      const cabNorm = (log.cabNumber || '').toUpperCase().replace(/\s+/g, '');
      const meta = cabMetaMap.get(cabNorm);
      const dateStr = d.toISOString().split('T')[0];
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      const eventKey = getEventKey(cabNorm, dateStr, timeStr, log.eventType);
      if (seenEventKeys.has(eventKey)) return;
      seenEventKeys.add(eventKey);

      if (log.dutyId) {
        seenDutyIds.add(`${log.dutyId}_${log.eventType}`);
      }

      items.push({
        id: log.id || eventKey,
        timestamp: d,
        dateString: dateStr,
        timeString: timeStr,
        cabNumber: log.cabNumber || meta?.cabNumber || 'Unknown Cab',
        driverName: log.driverName || meta?.driverName || 'Driver',
        driverPhone: log.driverPhone || meta?.driverPhone || '',
        vehicleType: log.vehicleType || meta?.vehicleType || 'Commercial Cab',
        eventType: log.eventType || 'location_punch',
        locationText: log.locationText || 'Punched Location',
        lat: Number(log.lat) || meta?.currentLocationLat || 0,
        lng: Number(log.lng) || meta?.currentLocationLng || 0,
        dutyId: log.dutyId || null,
        speed: log.speed || 0,
        notes: log.notes || '',
      });
    });

    // 2. Process notifications collection
    notifications.forEach((notif) => {
      const d = parseToDate(notif.timestamp);
      if (!d) return;

      const cabNorm = (notif.cabNumber || '').toUpperCase().replace(/\s+/g, '');
      const meta = cabMetaMap.get(cabNorm);
      const dateStr = d.toISOString().split('T')[0];
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      const eventKey = getEventKey(cabNorm, dateStr, timeStr, notif.type);
      if (seenEventKeys.has(eventKey)) return;
      seenEventKeys.add(eventKey);

      items.push({
        id: notif.id || eventKey,
        timestamp: d,
        dateString: dateStr,
        timeString: timeStr,
        cabNumber: notif.cabNumber || meta?.cabNumber || 'Cab',
        driverName: notif.driverName || meta?.driverName || 'Driver',
        driverPhone: meta?.driverPhone || '',
        vehicleType: meta?.vehicleType || 'Commercial Cab',
        eventType: notif.type || 'location_punch',
        locationText: notif.locationText || 'Location update',
        lat: Number(notif.lat) || meta?.currentLocationLat || 0,
        lng: Number(notif.lng) || meta?.currentLocationLng || 0,
        dutyId: null,
        speed: 0,
        notes: notif.read ? 'Acknowledged' : 'Real-time punch',
      });
    });

    // 3. Process duties for start and completion locations
    duties.forEach((duty) => {
      const cabNorm = (duty.cabNumber || '').toUpperCase().replace(/\s+/g, '');
      const meta = cabMetaMap.get(cabNorm);

      // Start event
      const dStart = parseToDate(duty.startTime);
      if (dStart && duty.startLocationText) {
        const dateStr = dStart.toISOString().split('T')[0];
        const timeStr = dStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const eventKey = getEventKey(cabNorm, dateStr, timeStr, 'duty_started');
        const dutyStartIdKey = `${duty.id}_duty_started`;

        if (!seenEventKeys.has(eventKey) && !seenDutyIds.has(dutyStartIdKey)) {
          seenEventKeys.add(eventKey);
          seenDutyIds.add(dutyStartIdKey);
          items.push({
            id: `duty_start_${duty.id}`,
            timestamp: dStart,
            dateString: dateStr,
            timeString: timeStr,
            cabNumber: duty.cabNumber || meta?.cabNumber || 'Cab',
            driverName: duty.driverName || meta?.driverName || 'Driver',
            driverPhone: meta?.driverPhone || '',
            vehicleType: meta?.vehicleType || 'Commercial Cab',
            eventType: 'duty_started',
            locationText: duty.startLocationText,
            lat: meta?.currentLocationLat || 12.9716,
            lng: meta?.currentLocationLng || 77.5946,
            dutyId: duty.id,
            speed: 0,
            notes: `Duty trip #${(duty.id || '').slice(-4)} started`,
          });
        }
      }

      // End event
      const dEnd = parseToDate(duty.endTime);
      if (dEnd && duty.endLocationText && duty.status === 'completed') {
        const dateStr = dEnd.toISOString().split('T')[0];
        const timeStr = dEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const eventKey = getEventKey(cabNorm, dateStr, timeStr, 'duty_completed');
        const dutyEndIdKey = `${duty.id}_duty_completed`;

        if (!seenEventKeys.has(eventKey) && !seenDutyIds.has(dutyEndIdKey)) {
          seenEventKeys.add(eventKey);
          seenDutyIds.add(dutyEndIdKey);
          items.push({
            id: `duty_end_${duty.id}`,
            timestamp: dEnd,
            dateString: dateStr,
            timeString: timeStr,
            cabNumber: duty.cabNumber || meta?.cabNumber || 'Cab',
            driverName: duty.driverName || meta?.driverName || 'Driver',
            driverPhone: meta?.driverPhone || '',
            vehicleType: meta?.vehicleType || 'Commercial Cab',
            eventType: 'duty_completed',
            locationText: duty.endLocationText,
            lat: meta?.currentLocationLat || 12.9716,
            lng: meta?.currentLocationLng || 77.5946,
            dutyId: duty.id,
            speed: 0,
            notes: `Duty trip drop completed #${(duty.id || '').slice(-4)}`,
          });
        }
      }
    });

    // Sort descending by timestamp (newest records first)
    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [locationLogs, notifications, duties, cabMetaMap]);

  // List of all unique cabs available across fleet and logs
  const availableCabs = useMemo(() => {
    const cabs = new Set<string>();
    fleetList.forEach((c) => c.cabNumber && cabs.add(c.cabNumber));
    aggregatedReportItems.forEach((i) => i.cabNumber && cabs.add(i.cabNumber));
    return Array.from(cabs).sort();
  }, [fleetList, aggregatedReportItems]);

  const availableDrivers = useMemo(() => {
    const drivers = new Set<string>();
    fleetList.forEach((c) => c.driverName && drivers.add(c.driverName));
    aggregatedReportItems.forEach((i) => i.driverName && drivers.add(i.driverName));
    return Array.from(drivers).sort();
  }, [fleetList, aggregatedReportItems]);

  // Filter items according to date range, cab search, selected cab, driver, and event type
  const filteredReportItems = useMemo(() => {
    const searchClean = cabSearchQuery.trim().toLowerCase();

    return aggregatedReportItems.filter((item) => {
      // Date boundary check
      if (startDate && item.dateString < startDate) return false;
      if (endDate && item.dateString > endDate) return false;

      // Selected cab dropdown
      if (selectedCab !== 'all') {
        const targetClean = selectedCab.toUpperCase().replace(/\s+/g, '');
        const itemClean = item.cabNumber.toUpperCase().replace(/\s+/g, '');
        if (targetClean !== itemClean) return false;
      }

      // Selected driver dropdown
      if (selectedDriver !== 'all') {
        if (item.driverName.trim().toLowerCase() !== selectedDriver.trim().toLowerCase()) return false;
      }

      // Selected Event Type
      if (selectedEventType !== 'all') {
        if (item.eventType !== selectedEventType) return false;
      }

      // Instant Cab / General Search filter
      if (searchClean) {
        const matchCab = item.cabNumber.toLowerCase().includes(searchClean);
        const matchDriver = item.driverName.toLowerCase().includes(searchClean);
        const matchLoc = item.locationText.toLowerCase().includes(searchClean);
        const matchNotes = item.notes?.toLowerCase().includes(searchClean);
        const matchPhone = item.driverPhone?.toLowerCase().includes(searchClean);
        return matchCab || matchDriver || matchLoc || matchNotes || matchPhone;
      }

      return true;
    });
  }, [aggregatedReportItems, startDate, endDate, selectedCab, selectedDriver, selectedEventType, cabSearchQuery]);

  // Monthly Cab-Wise Location Punch Aggregation:
  // Groups by Cab -> aggregates all unique locations punched during the period, times punched, and full logs
  const cabMonthlyLocations = useMemo(() => {
    interface LocationPunchSummary {
      locationText: string;
      punchCount: number;
      lat: number;
      lng: number;
      lastPunchedDate: string;
      lastPunchedTime: string;
      lastTimestamp: Date;
    }

    interface CabMonthlyRecord {
      cabNumber: string;
      driverName: string;
      driverPhone: string;
      vehicleType: string;
      totalPunches: number;
      activeDates: Set<string>;
      uniqueLocationsMap: Map<string, LocationPunchSummary>;
      logs: ReportItem[];
    }

    const map = new Map<string, CabMonthlyRecord>();

    filteredReportItems.forEach((item) => {
      const cabKey = item.cabNumber;
      if (!map.has(cabKey)) {
        map.set(cabKey, {
          cabNumber: item.cabNumber,
          driverName: item.driverName,
          driverPhone: item.driverPhone,
          vehicleType: item.vehicleType,
          totalPunches: 0,
          activeDates: new Set<string>(),
          uniqueLocationsMap: new Map<string, LocationPunchSummary>(),
          logs: [],
        });
      }

      const rec = map.get(cabKey)!;
      rec.totalPunches++;
      rec.activeDates.add(item.dateString);
      rec.logs.push(item);

      // Group by locationText (normalized)
      const locKey = item.locationText.trim().toLowerCase();
      if (!rec.uniqueLocationsMap.has(locKey)) {
        rec.uniqueLocationsMap.set(locKey, {
          locationText: item.locationText,
          punchCount: 1,
          lat: item.lat,
          lng: item.lng,
          lastPunchedDate: item.dateString,
          lastPunchedTime: item.timeString,
          lastTimestamp: item.timestamp,
        });
      } else {
        const locRecord = rec.uniqueLocationsMap.get(locKey)!;
        locRecord.punchCount++;
        if (item.timestamp > locRecord.lastTimestamp) {
          locRecord.lastPunchedDate = item.dateString;
          locRecord.lastPunchedTime = item.timeString;
          locRecord.lastTimestamp = item.timestamp;
          if (item.lat && item.lng) {
            locRecord.lat = item.lat;
            locRecord.lng = item.lng;
          }
        }
      }
    });

    // Convert map to sorted array (most active cabs first)
    return Array.from(map.values()).map((c) => ({
      ...c,
      activeDaysCount: c.activeDates.size,
      locationsList: Array.from(c.uniqueLocationsMap.values()).sort(
        (a, b) => b.punchCount - a.punchCount
      ),
    })).sort((a, b) => b.totalPunches - a.totalPunches);
  }, [filteredReportItems]);

  // Overall KPI Metrics
  const summaryMetrics = useMemo(() => {
    const totalPunches = filteredReportItems.length;
    const uniqueCabs = new Set(filteredReportItems.map((i) => i.cabNumber)).size;
    const uniqueDates = new Set(filteredReportItems.map((i) => i.dateString)).size;
    const uniqueLocations = new Set(
      filteredReportItems.map((i) => i.locationText.trim().toLowerCase())
    ).size;

    return {
      totalPunches,
      uniqueCabs,
      uniqueDates,
      uniqueLocations,
    };
  }, [filteredReportItems]);

  // Cab count for quick pills
  const cabPunchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    aggregatedReportItems.forEach((item) => {
      // Check date range
      if (startDate && item.dateString < startDate) return;
      if (endDate && item.dateString > endDate) return;
      counts.set(item.cabNumber, (counts.get(item.cabNumber) || 0) + 1);
    });
    return counts;
  }, [aggregatedReportItems, startDate, endDate]);

  // 1-Click CSV Export for Excel & Google Sheets
  const handleExportCSV = () => {
    if (filteredReportItems.length === 0) {
      alert('No location punch records to export for the selected filters.');
      return;
    }

    const headers = [
      'Date',
      'Time',
      'Cab Number',
      'Driver Name',
      'Driver Phone',
      'Vehicle Type',
      'Punch / Event Type',
      'Standing Location / Address',
      'Latitude',
      'Longitude',
      'Speed (km/h)',
      'Duty ID Ref',
      'Notes',
    ];

    const rows = filteredReportItems.map((item) => [
      item.dateString,
      item.timeString,
      `"${item.cabNumber}"`,
      `"${item.driverName}"`,
      `"${item.driverPhone}"`,
      `"${item.vehicleType}"`,
      `"${item.eventType.replace('_', ' ').toUpperCase()}"`,
      `"${item.locationText.replace(/"/g, '""')}"`,
      item.lat ? item.lat.toFixed(6) : '',
      item.lng ? item.lng.toFixed(6) : '',
      item.speed || 0,
      item.dutyId ? `"${item.dutyId}"` : '',
      `"${(item.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Cab_Location_Logs_Report_${startDate || 'start'}_to_${endDate || 'end'}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report
  const handlePrintReport = () => {
    window.print();
  };

  // Copy Formatted Location Logs Summary to Clipboard
  const handleCopySummary = async () => {
    const dateRangeLabel = `${startDate || 'Start'} to ${endDate || 'Current'}`;
    let text = `🚕 *CAB FLEET DATE-WISE LOCATION LOGS REPORT*\n`;
    text += `📅 Period: ${dateRangeLabel}\n`;
    text += `📍 Total Location Punches: ${summaryMetrics.totalPunches}\n`;
    text += `🚗 Active Cabs: ${summaryMetrics.uniqueCabs}\n`;
    text += `🏢 Distinct Locations Visited: ${summaryMetrics.uniqueLocations}\n\n`;
    text += `*CAB-WISE PUNCH LOCATIONS SUMMARY:*\n`;

    cabMonthlyLocations.forEach((cab) => {
      text += `\n🚘 *${cab.cabNumber}* (${cab.driverName} - ${cab.vehicleType})\n`;
      text += `   Total Punches: ${cab.totalPunches} | Active Days: ${cab.activeDaysCount}\n`;
      text += `   Punched Locations:\n`;
      cab.locationsList.forEach((loc, idx) => {
        text += `   ${idx + 1}. ${loc.locationText} (${loc.punchCount}x punch, last: ${loc.lastPunchedDate} ${loc.lastPunchedTime})\n`;
      });
    });

    text += `\nGenerated via Transport Operations Fleet Portal • Verified GPS Coordinates`;

    try {
      if (typeof navigator !== 'undefined') {
        await navigator.clipboard.writeText(text);
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 3000);
      }
    } catch (e) {
      console.warn('Copy summary error:', e);
    }
  };

  // 1-Click Seeder for Instant Testing Data
  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await seedLocationAuditLogs();
      alert('Sample multi-date location punch records loaded successfully! You can now audit date-wise locations for each cab.');
    } catch (err: any) {
      console.error('Seed error:', err);
      alert('Could not seed sample logs: ' + err.message);
    } finally {
      setIsSeeding(false);
    }
  };

  // Copy single coordinate
  const handleCopyCoord = (lat: number, lng: number, id: string) => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Format event badge
  const getEventBadge = (type: LocationLogEventType) => {
    switch (type) {
      case 'location_punch':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Location Punch
          </span>
        );
      case 'duty_started':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Duty Started
          </span>
        );
      case 'duty_completed':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Duty Completed
          </span>
        );
      case 'reported_at_hub':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 inline-flex items-center gap-1">
            <Car className="w-3 h-3" /> Hub Check-In
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f5f0e6] text-[#44403c] border border-[#ded7c8]">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Instant Cab Search Bar */}
      <section className="bg-white border border-[#e6e0d4] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-[#e6e0d4] pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-amber-500 text-stone-950 shadow-xs font-bold">
                <FileSpreadsheet className="w-5 h-5 font-bold" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-[#1c1917]">Date-Wise Cab Location Logs Report</h2>
                  <span className="text-xs font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Punch Audit
                  </span>
                </div>
                <p className="text-xs text-[#78716c] mt-0.5">
                  Audit which locations cabs punched during the month, standing GPS spots, and verified check-in history.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons: Export CSV, Print, Copy WhatsApp Summary */}
          <div className="flex flex-wrap items-center gap-2">
            {aggregatedReportItems.length === 0 && (
              <button
                type="button"
                id="btn-seed-location-data"
                onClick={handleSeedData}
                disabled={isSeeding}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                <span>{isSeeding ? 'Loading Data...' : 'Load Sample Multi-Day Data'}</span>
              </button>
            )}

            <button
              type="button"
              id="btn-copy-location-summary"
              onClick={handleCopySummary}
              className="px-3 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-[#ded7c8] shadow-xs"
              title="Copy formatted summary to paste in WhatsApp or Email"
            >
              {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSummary ? 'Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              type="button"
              id="btn-print-location-report"
              onClick={handlePrintReport}
              className="px-3 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-[#ded7c8] shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-amber-700" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              id="btn-export-location-csv"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* PROMINENT INSTANT SEARCH OPTION FOR ANY CAB */}
        <div className="bg-[#faf7f2] p-4 rounded-xl border border-[#ded7c8] space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-amber-600 absolute left-3.5 top-3" />
              <input
                type="text"
                id="input-instant-cab-search"
                value={cabSearchQuery}
                onChange={(e) => setCabSearchQuery(e.target.value)}
                placeholder="Search any cab instantly by cab number (e.g. KA-01-AB-1024, 1024), driver name, or punched location..."
                className="w-full bg-white border border-[#ded7c8] focus:border-amber-400 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none transition shadow-inner"
              />
              {cabSearchQuery && (
                <button
                  type="button"
                  id="btn-clear-cab-search"
                  onClick={() => setCabSearchQuery('')}
                  className="absolute right-3 top-2.5 p-1 text-[#78716c] hover:text-[#1c1917] rounded-lg hover:bg-[#eae3d2]"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Month Selector */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[#78716c] font-semibold flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-700" /> Month:
              </span>
              <div className="flex items-center bg-white border border-[#ded7c8] rounded-xl p-0.5 shadow-xs">
                <button
                  type="button"
                  id="btn-prev-month"
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-[#f5f0e6] text-[#78716c] hover:text-[#1c1917] rounded-lg transition cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="month"
                  id="input-select-month"
                  value={selectedMonth}
                  onChange={(e) => e.target.value && handleMonthChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-[#1c1917] px-2 py-1 focus:outline-none cursor-pointer"
                />
                <button
                  type="button"
                  id="btn-next-month"
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-[#f5f0e6] text-[#78716c] hover:text-[#1c1917] rounded-lg transition cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Instant Quick-Select Cab Pills Bar */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
            <span className="text-[#78716c] font-medium mr-1 flex items-center gap-1">
              <Car className="w-3.5 h-3.5 text-amber-700" /> Instant Cab Filter:
            </span>

            <button
              type="button"
              id="pill-cab-all"
              onClick={() => {
                setSelectedCab('all');
                setCabSearchQuery('');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                selectedCab === 'all' && !cabSearchQuery
                  ? 'bg-amber-500 text-stone-950 border-amber-600 shadow-xs'
                  : 'bg-white text-[#57534e] hover:text-[#1c1917] border-[#ded7c8] hover:border-amber-400'
              }`}
            >
              All Cabs ({availableCabs.length})
            </button>

            {availableCabs.map((cab) => {
              const punchCount = cabPunchCounts.get(cab) || 0;
              const isSelected = selectedCab === cab || cabSearchQuery.trim().toLowerCase() === cab.toLowerCase();

              return (
                <button
                  key={cab}
                  type="button"
                  id={`pill-cab-${cab.replace(/\s+/g, '_')}`}
                  onClick={() => {
                    if (selectedCab === cab) {
                      setSelectedCab('all');
                    } else {
                      setSelectedCab(cab);
                      setCabSearchQuery('');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-amber-500 text-stone-950 border-amber-600 font-bold shadow-xs'
                      : 'bg-white text-[#57534e] hover:text-[#1c1917] border-[#ded7c8] hover:border-amber-400'
                  }`}
                >
                  <span>{cab}</span>
                  {punchCount > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected ? 'bg-stone-950/20 text-stone-950 font-bold' : 'bg-[#f5f0e6] text-amber-800'
                      }`}
                    >
                      {punchCount}
                    </span>
                  )}
                </button>
              );
            })}

            {(selectedCab !== 'all' || cabSearchQuery) && (
              <button
                type="button"
                id="btn-reset-cab-filters"
                onClick={() => {
                  setSelectedCab('all');
                  setCabSearchQuery('');
                }}
                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 text-[11px] font-semibold border border-rose-300 ml-auto flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Reset Cab Filter</span>
              </button>
            )}
          </div>
        </div>

        {/* Date Filter Presets & Granular Range Selectors */}
        <div className="pt-2 space-y-3">
          {/* Quick Date Range Presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[#78716c] font-medium mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-700" /> Presets:
            </span>
            {[
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'today', label: 'Today' },
              { id: 'last7', label: 'Last 7 Days' },
              { id: 'last30', label: 'Last 30 Days' },
              { id: 'all', label: 'All Dates' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                id={`btn-preset-${p.id}`}
                onClick={() => handleSetPreset(p.id as any)}
                className="px-2.5 py-1 rounded-lg bg-[#faf7f2] hover:bg-[#f0eae0] text-[#57534e] hover:text-[#1c1917] border border-[#ded7c8] transition font-medium cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Granular Filters: Start Date, End Date, Cab, Driver, Event Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-1">
            {/* Start Date */}
            <div>
              <label htmlFor="input-report-start-date" className="block text-[11px] font-semibold text-[#57534e] mb-1">
                From Date
              </label>
              <input
                id="input-report-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white border border-[#ded7c8] rounded-xl px-3 py-1.5 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {/* End Date */}
            <div>
              <label htmlFor="input-report-end-date" className="block text-[11px] font-semibold text-[#57534e] mb-1">
                To Date
              </label>
              <input
                id="input-report-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-white border border-[#ded7c8] rounded-xl px-3 py-1.5 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {/* Cab Filter Dropdown */}
            <div>
              <label htmlFor="select-report-cab" className="block text-[11px] font-semibold text-[#57534e] mb-1">
                Cab Number
              </label>
              <select
                id="select-report-cab"
                value={selectedCab}
                onChange={(e) => setSelectedCab(e.target.value)}
                className="w-full bg-white border border-[#ded7c8] rounded-xl px-3 py-1.5 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 transition"
              >
                <option value="all">All Cabs ({availableCabs.length})</option>
                {availableCabs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Driver Filter Dropdown */}
            <div>
              <label htmlFor="select-report-driver" className="block text-[11px] font-semibold text-[#57534e] mb-1">
                Driver
              </label>
              <select
                id="select-report-driver"
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                className="w-full bg-white border border-[#ded7c8] rounded-xl px-3 py-1.5 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 transition"
              >
                <option value="all">All Drivers ({availableDrivers.length})</option>
                {availableDrivers.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Event Type Filter */}
            <div>
              <label htmlFor="select-report-event-type" className="block text-[11px] font-semibold text-[#57534e] mb-1">
                Punch Type
              </label>
              <select
                id="select-report-event-type"
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="w-full bg-white border border-[#ded7c8] rounded-xl px-3 py-1.5 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 transition"
              >
                <option value="all">All Punch Events</option>
                <option value="location_punch">Location Punches Only</option>
                <option value="duty_started">Duty Started</option>
                <option value="duty_completed">Duty Completed</option>
                <option value="reported_at_hub">Reported At Hub</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SUMMARY KPI STATS (Location Audit Focus - No Billing) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border-2 border-[#e6e0d4] shadow-xs">
          <div className="flex items-center justify-between text-[#78716c] text-xs font-bold uppercase tracking-wider">
            <span>Total Location Punches</span>
            <MapPin className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#1c1917]">
            {summaryMetrics.totalPunches}
          </div>
          <p className="text-[11px] text-[#78716c] mt-0.5">
            Verified check-ins in selected period
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border-2 border-[#e6e0d4] shadow-xs">
          <div className="flex items-center justify-between text-[#78716c] text-xs font-bold uppercase tracking-wider">
            <span>Active Cabs Punched</span>
            <Car className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#1c1917]">
            {summaryMetrics.uniqueCabs}
          </div>
          <p className="text-[11px] text-[#78716c] mt-0.5">
            Commercial vehicles with location logs
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border-2 border-[#e6e0d4] shadow-xs">
          <div className="flex items-center justify-between text-[#78716c] text-xs font-bold uppercase tracking-wider">
            <span>Punched Locations / Hubs</span>
            <Navigation className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-800">
            {summaryMetrics.uniqueLocations}
          </div>
          <p className="text-[11px] text-[#78716c] mt-0.5">
            Distinct standing spots & client bases
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border-2 border-[#e6e0d4] shadow-xs">
          <div className="flex items-center justify-between text-[#78716c] text-xs font-bold uppercase tracking-wider">
            <span>Active Days with Punches</span>
            <Calendar className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-purple-800">
            {summaryMetrics.uniqueDates}
          </div>
          <p className="text-[11px] text-[#78716c] mt-0.5">
            Between {startDate || 'Start'} and {endDate || 'End'}
          </p>
        </div>
      </section>

      {/* 3. VIEW MODE TABS: Cab Location Breakdown (Monthly Focus) vs Chronological Itemized Log */}
      <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-2">
        <div className="flex items-center bg-[#f4efe6] p-1 rounded-xl border border-[#ded7c8]">
          <button
            type="button"
            id="tab-view-cab-breakdown"
            onClick={() => setActiveTab('cab_breakdown')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'cab_breakdown'
                ? 'bg-white text-[#1c1917] shadow-xs font-black'
                : 'text-[#78716c] hover:text-[#1c1917]'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Cab-Wise Monthly Location Punch Overview</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[#e6e0d4] text-[#44403c]">
              {cabMonthlyLocations.length} cabs
            </span>
          </button>

          <button
            type="button"
            id="tab-view-all-logs"
            onClick={() => setActiveTab('all_logs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'all_logs'
                ? 'bg-white text-[#1c1917] shadow-xs font-black'
                : 'text-[#78716c] hover:text-[#1c1917]'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>All Punch Logs (Chronological Audit)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[#e6e0d4] text-[#44403c]">
              {filteredReportItems.length} records
            </span>
          </button>
        </div>

        <span className="text-xs text-[#78716c] hidden sm:inline">
          Showing data for <span className="text-[#1c1917] font-bold">{startDate || 'Start'}</span> to{' '}
          <span className="text-[#1c1917] font-bold">{endDate || 'End'}</span>
        </span>
      </div>

      {/* TAB 1: CAB-WISE MONTHLY LOCATION PUNCH OVERVIEW */}
      {activeTab === 'cab_breakdown' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-700" />
              <span>Locations Punched by Each Cab in Selected Month / Period</span>
            </h3>
            <span className="text-xs text-[#78716c]">
              {cabMonthlyLocations.length} vehicle{cabMonthlyLocations.length !== 1 ? 's' : ''} logged
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-[#78716c] text-xs bg-white border border-[#e6e0d4] rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
              <span>Loading cab location punches...</span>
            </div>
          ) : cabMonthlyLocations.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white border border-[#e6e0d4] text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#f4efe6] border border-[#ded7c8] mx-auto flex items-center justify-center text-[#78716c]">
                <MapPin className="w-6 h-6 text-amber-700" />
              </div>
              <div className="text-sm font-bold text-[#1c1917]">No cab punch records found</div>
              <p className="text-xs text-[#78716c] max-w-md mx-auto">
                No location punches match your active filters or search term ({cabSearchQuery || 'active'}).
                Try selecting "This Month" or click below to load sample multi-day location punches.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  id="btn-seed-empty-cab-overview"
                  onClick={handleSeedData}
                  disabled={isSeeding}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition cursor-pointer shadow-xs"
                >
                  {isSeeding ? 'Generating...' : 'Load Sample Multi-Day Data'}
                </button>
                <button
                  type="button"
                  id="btn-reset-search-empty"
                  onClick={() => {
                    setCabSearchQuery('');
                    setSelectedCab('all');
                    handleSetPreset('this_month');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-xs font-semibold transition cursor-pointer border border-[#ded7c8]"
                >
                  Reset to This Month
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {cabMonthlyLocations.map((cab) => {
                const isExpanded = expandedCab === cab.cabNumber;

                return (
                  <div
                    key={cab.cabNumber}
                    className="bg-white border-2 border-[#e6e0d4] hover:border-[#ded7c8] rounded-2xl p-5 shadow-xs transition text-[#1c1917]"
                  >
                    {/* Cab Header Info */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#e6e0d4] pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#faf7f2] border border-[#ded7c8] flex items-center justify-center text-amber-700">
                          <Car className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-mono text-base font-black text-[#1c1917] tracking-wide">
                              {cab.cabNumber}
                            </h4>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#faf7f2] border border-[#ded7c8] text-[#57534e]">
                              {cab.vehicleType}
                            </span>
                          </div>
                          <div className="text-xs text-[#78716c] mt-0.5 flex items-center gap-2">
                            <span>Driver: <strong className="text-[#1c1917]">{cab.driverName}</strong></span>
                            {cab.driverPhone && (
                              <span className="font-mono text-[#78716c] text-[11px]">
                                ({cab.driverPhone})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Cab Summary Pills */}
                      <div className="flex items-center gap-2">
                        <div className="bg-[#faf7f2] px-3 py-1.5 rounded-xl border border-[#ded7c8] text-center">
                          <div className="text-xs font-mono font-bold text-amber-800">
                            {cab.totalPunches}
                          </div>
                          <div className="text-[10px] text-[#78716c]">Total Punches</div>
                        </div>

                        <div className="bg-[#faf7f2] px-3 py-1.5 rounded-xl border border-[#ded7c8] text-center">
                          <div className="text-xs font-mono font-bold text-blue-800">
                            {cab.locationsList.length}
                          </div>
                          <div className="text-[10px] text-[#78716c]">Unique Spots</div>
                        </div>

                        <div className="bg-[#faf7f2] px-3 py-1.5 rounded-xl border border-[#ded7c8] text-center">
                          <div className="text-xs font-mono font-bold text-emerald-800">
                            {cab.activeDaysCount}
                          </div>
                          <div className="text-[10px] text-[#78716c]">Active Days</div>
                        </div>

                        {onViewCabOnMap && (
                          <button
                            type="button"
                            onClick={() => onViewCabOnMap(cab.cabNumber)}
                            className="px-3 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-xs font-semibold flex items-center gap-1 transition cursor-pointer border border-[#ded7c8]"
                            title="Locate cab on live map"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
                            <span className="hidden sm:inline">Live Map</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* CORE REQUIREMENT: Locations Punched During the Month */}
                    <div className="pt-3 space-y-2">
                      <div className="text-xs font-semibold text-[#57534e] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-700" />
                        <span>Locations Punched During the Month / Period:</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {cab.locationsList.map((loc, idx) => (
                          <div
                            key={idx}
                            className="bg-[#faf7f2] border border-[#ded7c8] rounded-xl p-3 hover:border-amber-400 transition flex flex-col justify-between space-y-2"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-xs font-semibold text-[#1c1917] leading-snug flex items-start gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                  <span>{loc.locationText}</span>
                                </div>
                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                                  {loc.punchCount} {loc.punchCount === 1 ? 'punch' : 'punches'}
                                </span>
                              </div>
                              <div className="text-[10px] text-[#78716c] mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[#a8a29e]" />
                                <span>Last logged: {loc.lastPunchedDate} at {loc.lastPunchedTime}</span>
                              </div>
                            </div>

                            {/* Coordinates and Actions */}
                            {loc.lat !== 0 && loc.lng !== 0 && (
                              <div className="flex items-center justify-between pt-1 border-t border-[#ded7c8] text-[11px] text-[#78716c] font-mono">
                                <span>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCoord(loc.lat, loc.lng, `${cab.cabNumber}_loc_${idx}`)}
                                    className="p-1 hover:text-amber-800 text-[#78716c] transition cursor-pointer"
                                    title="Copy GPS coordinates"
                                  >
                                    {copiedId === `${cab.cabNumber}_loc_${idx}` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <a
                                    href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 hover:text-amber-800 text-[#78716c] transition"
                                    title="Open Google Maps Pin"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Collapsible Timeline of Individual Punches */}
                    <div className="mt-3 pt-3 border-t border-[#e6e0d4]">
                      <button
                        type="button"
                        onClick={() => setExpandedCab(isExpanded ? null : cab.cabNumber)}
                        className="text-xs font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide' : 'View Full'} Punch Records for {cab.cabNumber} ({cab.logs.length})</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 overflow-x-auto border border-[#ded7c8] rounded-xl bg-white">
                          <table className="w-full text-left text-xs text-[#1c1917] border-collapse">
                            <thead>
                              <tr className="bg-[#f5f0e6] border-b border-[#ded7c8] text-[#57534e] font-semibold uppercase tracking-wider text-[10px]">
                                <th className="py-2.5 px-3">Date & Time</th>
                                <th className="py-2.5 px-3">Punch Event</th>
                                <th className="py-2.5 px-3">Punched Standing Location</th>
                                <th className="py-2.5 px-3">GPS Coordinates</th>
                                <th className="py-2.5 px-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f0eae0] font-mono">
                              {cab.logs.map((item) => (
                                <tr key={item.id} className="hover:bg-[#faf7f2]">
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span className="text-[#1c1917] font-bold">{item.dateString}</span>
                                    <span className="text-[#78716c] ml-1.5">{item.timeString}</span>
                                  </td>
                                  <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                                    {getEventBadge(item.eventType)}
                                  </td>
                                  <td className="py-2.5 px-3 font-sans text-[#1c1917]">
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-amber-700 shrink-0" />
                                      <span>{item.locationText}</span>
                                    </div>
                                    {item.notes && (
                                      <div className="text-[10px] text-[#78716c] italic mt-0.5 font-sans">
                                        {item.notes}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyCoord(item.lat, item.lng, item.id)}
                                      className="text-[#78716c] hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                                      title="Copy GPS"
                                    >
                                      <span>{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</span>
                                      {copiedId === item.id ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3 text-[#a8a29e]" />
                                      )}
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-sans">
                                    <button
                                      type="button"
                                      onClick={() => setInspectedLocation(item)}
                                      className="px-2.5 py-1 rounded-md bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-[11px] font-medium transition cursor-pointer border border-[#ded7c8]"
                                    >
                                      Inspect
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: CHRONOLOGICAL ITEMISED AUDIT LOG TABLE */}
      {activeTab === 'all_logs' && (
        <section className="bg-white border-2 border-[#e6e0d4] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-700" />
                <span>Chronological Cab Location Logs & GPS Audit Records</span>
                <span className="text-[11px] font-normal text-[#78716c]">
                  ({filteredReportItems.length} records)
                </span>
              </h3>
              <p className="text-[11px] text-[#78716c] mt-0.5">
                Detailed audit trail of standing spots, hub check-ins, and duty coordinates.
              </p>
            </div>

            <div className="text-xs text-[#78716c]">
              Showing records between <span className="text-[#1c1917] font-bold">{startDate || 'Start'}</span> and <span className="text-[#1c1917] font-bold">{endDate || 'End'}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-[#78716c] text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
              <span>Loading location history...</span>
            </div>
          ) : filteredReportItems.length === 0 ? (
            <div className="p-10 rounded-xl bg-[#faf7f2] border border-[#ded7c8] text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-white border border-[#ded7c8] mx-auto flex items-center justify-center text-[#78716c]">
                <MapPin className="w-6 h-6 text-amber-700" />
              </div>
              <div className="text-sm font-bold text-[#1c1917]">No location punches found for selected filters</div>
              <p className="text-xs text-[#78716c] max-w-md mx-auto">
                Try adjusting the date range, clearing the search query, or click below to generate sample audit records for testing.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  id="btn-seed-empty-state"
                  onClick={handleSeedData}
                  disabled={isSeeding}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition cursor-pointer shadow-xs"
                >
                  {isSeeding ? 'Generating...' : 'Load Sample Multi-Day Data'}
                </button>
                <button
                  type="button"
                  id="btn-reset-filters"
                  onClick={() => {
                    handleSetPreset('this_month');
                    setSelectedCab('all');
                    setCabSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-xs font-semibold transition cursor-pointer border border-[#ded7c8]"
                >
                  Show This Month
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#ded7c8] rounded-xl bg-white">
              <table className="w-full text-left text-xs text-[#1c1917] border-collapse">
                <thead>
                  <tr className="bg-[#f5f0e6] border-b border-[#ded7c8] text-[#57534e] font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Cab & Driver</th>
                    <th className="py-2.5 px-3">Punch Type</th>
                    <th className="py-2.5 px-3">Standing Location / Address</th>
                    <th className="py-2.5 px-3">GPS Coordinates</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0eae0]">
                  {filteredReportItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#faf7f2] transition">
                      {/* Date & Time */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-[#1c1917] font-mono">{item.dateString}</div>
                        <div className="text-[11px] text-[#78716c] font-mono flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-[#a8a29e]" />
                          <span>{item.timeString}</span>
                        </div>
                      </td>

                      {/* Cab & Driver */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-amber-900 font-mono text-xs flex items-center gap-1">
                          <Car className="w-3.5 h-3.5 text-amber-700" />
                          <span>{item.cabNumber}</span>
                        </div>
                        <div className="text-[11px] text-[#1c1917] mt-0.5">
                          {item.driverName}
                          {item.driverPhone && (
                            <span className="text-[#78716c] text-[10px] ml-1 font-mono">
                              ({item.driverPhone})
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#78716c]">{item.vehicleType}</div>
                      </td>

                      {/* Event Type */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getEventBadge(item.eventType)}
                        {item.speed && item.speed > 0 ? (
                          <div className="text-[10px] text-[#78716c] mt-1 font-mono">
                            Speed: {item.speed} km/h
                          </div>
                        ) : null}
                      </td>

                      {/* Standing Location Address */}
                      <td className="py-3 px-3 max-w-xs">
                        <div className="text-[#1c1917] font-medium text-xs leading-relaxed flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                          <span>{item.locationText}</span>
                        </div>
                        {item.notes && (
                          <div className="text-[10px] text-[#78716c] mt-1 italic">
                            Note: {item.notes}
                          </div>
                        )}
                      </td>

                      {/* GPS Coordinates with Copy */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCopyCoord(item.lat, item.lng, item.id)}
                          className="group flex items-center gap-1.5 text-[11px] font-mono text-[#57534e] bg-[#faf7f2] px-2 py-1 rounded-lg border border-[#ded7c8] hover:border-amber-400 transition cursor-pointer"
                          title="Click to copy exact coordinates"
                        >
                          <span>
                            {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                          </span>
                          {copiedId === item.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-[#a8a29e] group-hover:text-amber-800" />
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {onViewCabOnMap && (
                            <button
                              type="button"
                              onClick={() => onViewCabOnMap(item.cabNumber)}
                              className="px-2 py-1 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border border-[#ded7c8]"
                              title="Locate vehicle on live map"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
                              <span>Live Map</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setInspectedLocation(item)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] transition cursor-pointer shadow-xs"
                            title="View location inspect details"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 4. LOCATION INSPECT MODAL */}
      {inspectedLocation && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-[#1c1917]">
            <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-amber-700" />
                <h4 className="text-sm font-bold text-[#1c1917]">Location Punch Audit Details</h4>
              </div>
              <button
                type="button"
                onClick={() => setInspectedLocation(null)}
                className="p-1 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8]">
                <div>
                  <span className="text-[10px] text-[#78716c] uppercase font-bold tracking-wider">Cab Number</span>
                  <div className="font-mono font-bold text-amber-900 text-sm mt-0.5">
                    {inspectedLocation.cabNumber}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#78716c] uppercase font-bold tracking-wider">Driver</span>
                  <div className="font-bold text-[#1c1917] mt-0.5">{inspectedLocation.driverName}</div>
                  {inspectedLocation.driverPhone && (
                    <div className="text-[10px] text-[#78716c] font-mono">{inspectedLocation.driverPhone}</div>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#78716c] uppercase font-bold tracking-wider">Punched Standing Location</span>
                <div className="font-medium text-[#1c1917] text-sm mt-1 bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8]">
                  {inspectedLocation.locationText}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8]">
                  <span className="text-[10px] text-[#78716c] uppercase font-bold tracking-wider">Punch Event Type</span>
                  <div className="mt-1">{getEventBadge(inspectedLocation.eventType)}</div>
                </div>
                <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8]">
                  <span className="text-[10px] text-[#78716c] uppercase font-bold tracking-wider">Date & Timestamp</span>
                  <div className="font-mono text-[#1c1917] font-semibold mt-1">
                    {inspectedLocation.dateString} at {inspectedLocation.timeString}
                  </div>
                </div>
              </div>

              <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#78716c] uppercase font-bold tracking-wider">GPS Coordinates</span>
                    <div className="font-mono text-amber-900 font-bold text-sm mt-0.5">
                      {inspectedLocation.lat.toFixed(6)}, {inspectedLocation.lng.toFixed(6)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyCoord(inspectedLocation.lat, inspectedLocation.lng, 'modal')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-xs font-semibold flex items-center gap-1 border border-[#ded7c8] shadow-xs cursor-pointer"
                    >
                      {copiedId === 'modal' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === 'modal' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <a
                      href={`https://maps.google.com/?q=${inspectedLocation.lat},${inspectedLocation.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Google Maps</span>
                    </a>
                  </div>
                </div>
              </div>

              {inspectedLocation.notes && (
                <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8]">
                  <span className="text-[10px] text-[#78716c] uppercase font-bold tracking-wider">Audit Notes</span>
                  <div className="text-[#57534e] mt-1 italic">{inspectedLocation.notes}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInspectedLocation(null)}
                className="px-4 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] font-semibold text-xs transition cursor-pointer border border-[#ded7c8]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
