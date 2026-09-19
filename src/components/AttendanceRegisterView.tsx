import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DriverAttendance, DriverSlotType } from '../types';
import { formatTimeAgo } from '../lib/timeAgo';
import { getGoogleMapsUrl } from '../lib/geolocation';
import {
  Calendar,
  Clock,
  Car,
  UserCheck,
  Search,
  Download,
  Filter,
  RefreshCw,
  ExternalLink,
  MapPin,
  CheckCircle2,
  Timer,
  FileSpreadsheet,
  AlertCircle,
  Users,
} from 'lucide-react';

export const AttendanceRegisterView: React.FC = () => {
  const [attendanceRecords, setAttendanceRecords] = useState<DriverAttendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'custom' | 'all'>('today');
  const [searchTerm, setSearchTerm] = useState('');
  const [slotFilter, setSlotFilter] = useState<'all' | DriverSlotType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'completed'>('all');

  // Live Firestore subscription
  useEffect(() => {
    setIsLoading(true);
    const attRef = collection(db, 'attendance');
    const q = query(attRef);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const records: DriverAttendance[] = [];
        snapshot.forEach((d) => {
          records.push({ id: d.id, ...(d.data() as DriverAttendance) });
        });
        // Sort descending by punchInTime or date
        records.sort((a, b) => {
          const timeA = a.punchInTime?.toMillis ? a.punchInTime.toMillis() : new Date(a.punchInTime || 0).getTime();
          const timeB = b.punchInTime?.toMillis ? b.punchInTime.toMillis() : new Date(b.punchInTime || 0).getTime();
          return timeB - timeA;
        });
        setAttendanceRecords(records);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error fetching attendance records:', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Filtered attendance list
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((rec) => {
      // Date filter
      if (dateFilterMode === 'today' && rec.date !== todayStr) {
        return false;
      }
      if (dateFilterMode === 'custom' && selectedDate && rec.date !== selectedDate) {
        return false;
      }

      // Slot filter (1st Driver vs 2nd Driver)
      if (slotFilter !== 'all' && rec.driverSlot !== slotFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && rec.status !== statusFilter) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchName = rec.driverName?.toLowerCase().includes(term);
        const matchPhone = rec.driverPhone?.toLowerCase().includes(term);
        const matchCab = rec.cabNumber?.toLowerCase().includes(term);
        const matchLoc = rec.punchInLocation?.toLowerCase().includes(term);
        return matchName || matchPhone || matchCab || matchLoc;
      }

      return true;
    });
  }, [attendanceRecords, dateFilterMode, selectedDate, todayStr, slotFilter, statusFilter, searchTerm]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const todayList = attendanceRecords.filter((r) => r.date === todayStr);
    const presentCount = todayList.filter((r) => r.status === 'present').length;
    const completedCount = todayList.filter((r) => r.status === 'completed').length;
    const firstDriverCount = todayList.filter((r) => r.driverSlot === 'first').length;
    const secondDriverCount = todayList.filter((r) => r.driverSlot === 'second').length;

    return {
      totalToday: todayList.length,
      presentCount,
      completedCount,
      firstDriverCount,
      secondDriverCount,
    };
  }, [attendanceRecords, todayStr]);

  // Format timestamp helper
  const formatTime = (ts: any): string => {
    if (!ts) return '—';
    try {
      if (typeof ts?.toDate === 'function') {
        return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      if (ts instanceof Date) {
        return ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return;

    const headers = [
      'Date',
      'Driver Name',
      'Phone',
      'Designation',
      'Cab Number',
      'Punch-In Time',
      'Punch-In Location',
      'Punch-Out Time',
      'Punch-Out Location',
      'Status',
      'Total Hours Worked',
    ];

    const rows = filteredRecords.map((r) => [
      `"${r.date || ''}"`,
      `"${r.driverName || ''}"`,
      `"${r.driverPhone || ''}"`,
      `"${r.driverSlot === 'second' ? '2nd Driver' : '1st Driver'}"`,
      `"${r.cabNumber || ''}"`,
      `"${formatTime(r.punchInTime)}"`,
      `"${(r.punchInLocation || '').replace(/"/g, '""')}"`,
      `"${formatTime(r.punchOutTime)}"`,
      `"${(r.punchOutLocation || '').replace(/"/g, '""')}"`,
      `"${r.status || 'present'}"`,
      `"${r.totalHoursWorked || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Driver_Attendance_Register_${dateFilterMode === 'today' ? todayStr : selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Today */}
        <div className="p-4 rounded-2xl bg-white border-2 border-[#e6e0d4] shadow-xs">
          <div className="flex items-center justify-between text-[#78716c] text-xs font-bold uppercase tracking-wider mb-1">
            <span>Total Attendance</span>
            <Users className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-[#1c1917]">{metrics.totalToday}</div>
          <div className="text-[11px] text-[#78716c] mt-0.5">Punched today ({todayStr})</div>
        </div>

        {/* Active / Present */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 border-2 border-emerald-300 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Active On Duty</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-emerald-950">{metrics.presentCount}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">Currently on duty</div>
        </div>

        {/* Completed Today */}
        <div className="p-4 rounded-2xl bg-white border-2 border-[#e6e0d4] shadow-xs">
          <div className="flex items-center justify-between text-[#78716c] text-xs font-bold uppercase tracking-wider mb-1">
            <span>Duty Ended</span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-[#1c1917]">{metrics.completedCount}</div>
          <div className="text-[11px] text-[#78716c] mt-0.5">Completed shifts today</div>
        </div>

        {/* 1st Drivers */}
        <div className="p-4 rounded-2xl bg-[#faf7f2] border-2 border-amber-300/80 shadow-xs">
          <div className="flex items-center justify-between text-amber-900 text-xs font-bold uppercase tracking-wider mb-1">
            <span>1st Drivers</span>
            <UserCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-950">{metrics.firstDriverCount}</div>
          <div className="text-[11px] text-amber-800 mt-0.5">Primary shift slot</div>
        </div>

        {/* 2nd Drivers */}
        <div className="p-4 rounded-2xl bg-[#faf7f2] border-2 border-indigo-300/80 shadow-xs">
          <div className="flex items-center justify-between text-indigo-900 text-xs font-bold uppercase tracking-wider mb-1">
            <span>2nd Drivers</span>
            <UserCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-950">{metrics.secondDriverCount}</div>
          <div className="text-[11px] text-indigo-800 mt-0.5">Secondary shift slot</div>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#e6e0d4] shadow-sm space-y-3 sm:space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Date Picker Mode Buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-[#f4efe6] rounded-xl border border-[#ded7c8] w-fit">
            <button
              type="button"
              id="btn-att-date-today"
              onClick={() => setDateFilterMode('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                dateFilterMode === 'today'
                  ? 'bg-white text-[#1c1917] shadow-xs'
                  : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              id="btn-att-date-custom"
              onClick={() => setDateFilterMode('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                dateFilterMode === 'custom'
                  ? 'bg-white text-[#1c1917] shadow-xs'
                  : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
            >
              Specific Date
            </button>
            <button
              type="button"
              id="btn-att-date-all"
              onClick={() => setDateFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                dateFilterMode === 'all'
                  ? 'bg-white text-[#1c1917] shadow-xs'
                  : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
            >
              All Records
            </button>
          </div>

          {/* Date Input if custom */}
          {dateFilterMode === 'custom' && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-700" />
              <input
                type="date"
                id="input-att-custom-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3 py-1.5 text-xs text-[#1c1917] font-medium focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-att-export-csv"
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Search & Slot Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#f0eae0]">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3 top-2.5" />
            <input
              type="text"
              id="input-att-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search driver name, phone, cab..."
              className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-9 pr-3 py-2 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Slot Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#57534e] shrink-0">Designation:</label>
            <select
              id="select-att-slot"
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value as any)}
              className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3 py-2 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value="all">All Drivers (1st & 2nd)</option>
              <option value="first">1st Driver Only</option>
              <option value="second">2nd Driver Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#57534e] shrink-0">Duty Status:</label>
            <select
              id="select-att-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3 py-2 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="present">Present (On Duty)</option>
              <option value="completed">Completed / Duty Ended</option>
            </select>
          </div>
        </div>
      </div>

      {/* Attendance Register Table */}
      <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#e6e0d4] flex items-center justify-between bg-[#faf7f2]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-700" />
            <h3 className="font-bold text-sm text-[#1c1917]">
              Driver Attendance Register ({filteredRecords.length} records)
            </h3>
          </div>
          <span className="text-[11px] text-[#78716c] font-medium">
            Punched automatically whenever driver begins duty
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-[#78716c]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-600" />
            <p className="text-xs font-medium">Loading live attendance records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-[#78716c] space-y-2">
            <UserCheck className="w-10 h-10 text-[#d6cdb8] mx-auto" />
            <div className="text-sm font-bold text-[#1c1917]">No Attendance Records Found</div>
            <p className="text-xs text-[#78716c] max-w-sm mx-auto">
              When drivers tap &quot;Start Duty / Punch In&quot; on their mobile screen, their daily attendance will automatically register here in real-time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#1c1917]">
              <thead className="bg-[#f5f0e6] border-b border-[#e6e0d4] text-[#44403c] font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Driver Name & Phone</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Cab Number</th>
                  <th className="py-3 px-4">Punch In (Start)</th>
                  <th className="py-3 px-4">Punch Out (End)</th>
                  <th className="py-3 px-4">Hours</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eae0]">
                {filteredRecords.map((rec) => {
                  const is1st = rec.driverSlot === 'first';
                  const isPresent = rec.status === 'present';

                  return (
                    <tr key={rec.id} className="hover:bg-[#faf7f2] transition-colors">
                      {/* Date */}
                      <td className="py-3.5 px-4 font-mono font-medium whitespace-nowrap text-[#57534e]">
                        {rec.date || '—'}
                      </td>

                      {/* Driver Name & Phone */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sm text-[#1c1917]">{rec.driverName}</div>
                        {rec.driverPhone && (
                          <div className="text-[11px] font-mono text-[#78716c] mt-0.5">
                            {rec.driverPhone}
                          </div>
                        )}
                      </td>

                      {/* Role Slot (1st Driver vs 2nd Driver) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            is1st
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                          }`}
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>{is1st ? '1st Driver' : '2nd Driver'}</span>
                        </span>
                      </td>

                      {/* Cab Number */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-sm text-amber-900">
                        {rec.cabNumber}
                      </td>

                      {/* Punch In Time & Location */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-xs text-[#1c1917]">
                          {formatTime(rec.punchInTime)}
                        </div>
                        <div className="text-[11px] text-[#57534e] line-clamp-1 mt-0.5" title={rec.punchInLocation}>
                          {rec.punchInLocation || 'Recorded GPS Spot'}
                        </div>
                      </td>

                      {/* Punch Out Time & Location */}
                      <td className="py-3.5 px-4">
                        {rec.punchOutTime ? (
                          <>
                            <div className="font-mono font-bold text-xs text-[#1c1917]">
                              {formatTime(rec.punchOutTime)}
                            </div>
                            <div className="text-[11px] text-[#57534e] line-clamp-1 mt-0.5" title={rec.punchOutLocation || ''}>
                              {rec.punchOutLocation || 'Recorded GPS Spot'}
                            </div>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active on Duty
                          </span>
                        )}
                      </td>

                      {/* Hours */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs font-semibold">
                        {rec.totalHoursWorked ? `${rec.totalHoursWorked}h` : isPresent ? 'In progress' : '—'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                            isPresent
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-[#f4efe6] text-[#57534e] border border-[#ded7c8]'
                          }`}
                        >
                          {isPresent ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Present</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-stone-500" />
                              <span>Completed</span>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
