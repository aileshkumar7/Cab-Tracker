import React, { useState } from 'react';
import {
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, FleetCab } from '../types';
import { copyToClipboard } from '../lib/geolocation';
import {
  Users,
  Search,
  Phone,
  Car,
  Key,
  CheckCircle2,
  AlertCircle,
  Copy,
  Clock,
  Building2,
  Plus,
  RefreshCw,
  Smartphone,
  Edit2,
  X,
  Check,
} from 'lucide-react';

interface RegisteredDriversViewProps {
  drivers: UserProfile[];
  fleetList: FleetCab[];
  currentSupervisorSite?: string;
  onOpenBulkUpload?: () => void;
  onOpenAddCab?: () => void;
}

export const RegisteredDriversView: React.FC<RegisteredDriversViewProps> = ({
  drivers,
  fleetList,
  currentSupervisorSite,
  onOpenBulkUpload,
  onOpenAddCab,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Assign Cab Modal State
  const [driverToAssign, setDriverToAssign] = useState<UserProfile | null>(null);
  const [cabInput, setCabInput] = useState('');
  const [siteInput, setSiteInput] = useState('');
  const [shiftInput, setShiftInput] = useState<'morning_12h' | 'night_12h'>('morning_12h');
  const [isSaving, setIsSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const existingCabNumbers = new Set(fleetList.map((c) => c.cabNumber.trim().toUpperCase()));

  const filteredDrivers = drivers.filter((driver) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      driver.name?.toLowerCase().includes(term) ||
      driver.phoneNumber?.toLowerCase().includes(term) ||
      driver.cabNumber?.toLowerCase().includes(term) ||
      driver.site?.toLowerCase().includes(term);

    const hasCab = Boolean(driver.cabNumber && driver.cabNumber.trim() !== '');

    if (filterTab === 'assigned') return matchesSearch && hasCab;
    if (filterTab === 'unassigned') return matchesSearch && !hasCab;
    return matchesSearch;
  });

  const assignedCount = drivers.filter((d) => d.cabNumber && d.cabNumber.trim() !== '').length;
  const unassignedCount = drivers.length - assignedCount;

  const handleCopy = async (text: string, id: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(id);
      setSuccessToast(`Copied ${label} to clipboard!`);
      setTimeout(() => setCopiedId(null), 2500);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const openAssignModal = (driver: UserProfile) => {
    setDriverToAssign(driver);
    setCabInput(driver.cabNumber || '');
    setSiteInput(driver.site || currentSupervisorSite || 'North Terminal Hub');
    setShiftInput(driver.shift || 'morning_12h');
    setAssignError(null);
  };

  const handleSaveCabAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverToAssign) return;

    const trimmedCab = cabInput.trim().toUpperCase();
    if (!trimmedCab) {
      setAssignError('Please enter a valid Cab Number.');
      return;
    }

    setIsSaving(true);
    setAssignError(null);

    try {
      // 1. Update user profile in 'users'
      const userRef = doc(db, 'users', driverToAssign.uid);
      await updateDoc(userRef, {
        cabNumber: trimmedCab,
        site: siteInput,
        shift: shiftInput,
        driverSlot: shiftInput === 'morning_12h' ? 'first' : 'second',
        updatedAt: serverTimestamp(),
      });

      // 2. Ensure cab document exists in 'fleet' collection
      const cleanCabId = 'cab_' + trimmedCab.replace(/[^A-Z0-9]/g, '_').toLowerCase();
      const fleetDocRef = doc(db, 'fleet', cleanCabId);

      const existingCab = fleetList.find(
        (c) => c.cabNumber.trim().toUpperCase() === trimmedCab
      );

      if (existingCab && existingCab.id) {
        // Update existing fleet doc with this driver
        const isSlot2 = shiftInput === 'night_12h';
        await updateDoc(doc(db, 'fleet', existingCab.id), {
          site: siteInput || existingCab.site || 'North Terminal Hub',
          ...(isSlot2
            ? {
                secondDriverName: driverToAssign.name,
                secondDriverPhone: driverToAssign.phoneNumber,
                secondDriverShift: 'night_12h',
              }
            : {
                firstDriverName: driverToAssign.name,
                firstDriverPhone: driverToAssign.phoneNumber,
                firstDriverShift: 'morning_12h',
                driverName: driverToAssign.name,
                driverPhone: driverToAssign.phoneNumber,
              }),
          lastUpdated: serverTimestamp(),
        });
      } else {
        // Create new fleet cab document
        await setDoc(fleetDocRef, {
          cabNumber: trimmedCab,
          site: siteInput || 'North Terminal Hub',
          driverName: driverToAssign.name,
          driverPhone: driverToAssign.phoneNumber,
          firstDriverName: driverToAssign.name,
          firstDriverPhone: driverToAssign.phoneNumber,
          firstDriverShift: 'morning_12h',
          activeDriverSlot: 'first',
          vehicleType: 'Sedan (Dzire / Etios)',
          baseHub: siteInput || 'North Terminal Hub',
          status: 'reported_at_hub',
          currentLocationText: `${siteInput || 'North Terminal Hub'} (Depot)`,
          currentLocationLat: 12.9716,
          currentLocationLng: 77.5946,
          lastUpdated: serverTimestamp(),
        });
      }

      setSuccessToast(`Cab ${trimmedCab} successfully assigned to ${driverToAssign.name}! It is now live in Fleet Table.`);
      setDriverToAssign(null);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Failed to assign cab:', err);
      setAssignError(err.message || 'Failed to save cab assignment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {successToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successToast}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#e6e0d4] rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#78716c]">
              Total Drivers
            </div>
            <div className="text-3xl font-black text-[#1c1917] mt-1">{drivers.length}</div>
            <div className="text-[11px] text-[#78716c] mt-1">Mobile & team accounts</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#e6e0d4] rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Assigned to Cabs
            </div>
            <div className="text-3xl font-black text-emerald-950 mt-1">{assignedCount}</div>
            <div className="text-[11px] text-[#78716c] mt-1">Active in fleet tracking</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800">
            <Car className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#e6e0d4] rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Awaiting Cab Allocation
            </div>
            <div className="text-3xl font-black text-amber-950 mt-1">{unassignedCount}</div>
            <div className="text-[11px] text-[#78716c] mt-1">Need cab number linked</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-center text-amber-800">
            <Smartphone className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-[#e6e0d4] rounded-2xl p-4 sm:p-6 space-y-4 shadow-xs">
        {/* Header Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e6e0d4] pb-4">
          <div>
            <h2 className="text-base font-bold text-[#1c1917] flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-amber-700" />
              <span>Registered Driver Accounts</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#faf7f2] border border-[#ded7c8] text-[#57534e]">
                {drivers.length} Accounts
              </span>
            </h2>
            <p className="text-xs text-[#78716c] mt-0.5">
              Real-time directory of all driver accounts created via mobile login or bulk upload.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenBulkUpload && (
              <button
                type="button"
                id="btn-driver-view-bulk-upload"
                onClick={onOpenBulkUpload}
                className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>Bulk Upload Cabs</span>
              </button>
            )}
            {onOpenAddCab && (
              <button
                type="button"
                id="btn-driver-view-add-cab"
                onClick={onOpenAddCab}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Cab</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
            <input
              type="text"
              id="input-search-registered-drivers"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search driver by name, mobile, cab number or site..."
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

          <div className="flex items-center bg-[#faf7f2] p-1 rounded-xl border border-[#ded7c8] text-xs">
            <button
              type="button"
              id="filter-drivers-all"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                filterTab === 'all'
                  ? 'bg-white text-[#1c1917] shadow-xs font-bold'
                  : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
            >
              All ({drivers.length})
            </button>
            <button
              type="button"
              id="filter-drivers-assigned"
              onClick={() => setFilterTab('assigned')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                filterTab === 'assigned'
                  ? 'bg-emerald-100 text-emerald-950 font-bold shadow-xs'
                  : 'text-[#78716c] hover:text-emerald-900'
              }`}
            >
              Assigned to Cab ({assignedCount})
            </button>
            <button
              type="button"
              id="filter-drivers-unassigned"
              onClick={() => setFilterTab('unassigned')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                filterTab === 'unassigned'
                  ? 'bg-amber-100 text-amber-950 font-bold shadow-xs'
                  : 'text-[#78716c] hover:text-amber-900'
              }`}
            >
              Pending Cab ({unassignedCount})
            </button>
          </div>
        </div>

        {/* Drivers List Table */}
        <div className="overflow-x-auto border border-[#e6e0d4] rounded-xl">
          <table className="w-full text-left text-xs text-[#1c1917]">
            <thead className="bg-[#faf7f2] text-[#57534e] uppercase font-bold text-[10px] tracking-wider border-b border-[#e6e0d4]">
              <tr>
                <th className="py-3 px-4">Driver Details</th>
                <th className="py-3 px-4">Mobile Number</th>
                <th className="py-3 px-4">Assigned Cab</th>
                <th className="py-3 px-4">Shift & Slot</th>
                <th className="py-3 px-4">Site / Hub</th>
                <th className="py-3 px-4">Login Password</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f0e6]">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#78716c]">
                    <Users className="w-8 h-8 text-[#a8a29e] mx-auto mb-2" />
                    <p className="font-semibold">No driver accounts found</p>
                    <p className="text-[11px] text-[#a8a29e] mt-1">
                      {searchTerm
                        ? 'Try clearing your search query.'
                        : 'Drivers will automatically appear here as soon as they sign up from mobile.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => {
                  const hasCab = Boolean(driver.cabNumber && driver.cabNumber.trim() !== '');
                  const isExistingInFleet = hasCab && existingCabNumbers.has(driver.cabNumber!.trim().toUpperCase());
                  const tempPwd = driver.temporaryPassword || 'Driver@12345';

                  return (
                    <tr key={driver.uid} className="hover:bg-[#faf7f2]/80 transition">
                      {/* Driver Name */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#1c1917] flex items-center gap-1.5">
                          <span>{driver.name || 'Unnamed Driver'}</span>
                          {!hasCab && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Awaiting Cab Assignment" />
                          )}
                        </div>
                        <div className="text-[10px] text-[#78716c]">
                          Role: Driver &bull; ID: {driver.uid.slice(0, 12)}
                        </div>
                      </td>

                      {/* Phone Number */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`tel:${driver.phoneNumber}`}
                            className="font-mono text-[#1c1917] hover:text-amber-700 font-semibold flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{driver.phoneNumber || '—'}</span>
                          </a>
                          {driver.phoneNumber && (
                            <button
                              type="button"
                              onClick={() => handleCopy(driver.phoneNumber, `phone-${driver.uid}`, 'Phone Number')}
                              className="p-1 rounded text-[#a8a29e] hover:text-[#1c1917] transition cursor-pointer"
                              title="Copy Phone Number"
                            >
                              {copiedId === `phone-${driver.uid}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Cab Number */}
                      <td className="py-3 px-4">
                        {hasCab ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 font-mono font-bold text-xs">
                              {driver.cabNumber}
                            </span>
                            {isExistingInFleet ? (
                              <span className="text-[10px] text-emerald-800 font-medium" title="Active in Fleet Table">
                                &bull; In Fleet
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 font-medium" title="Click edit to sync to fleet">
                                &bull; Pending Sync
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Shift & Slot */}
                      <td className="py-3 px-4 text-[#57534e]">
                        <div className="font-semibold text-[11px]">
                          {driver.shift === 'night_12h' ? 'Night (12h)' : 'Morning (12h)'}
                        </div>
                        <div className="text-[10px] text-[#78716c]">
                          {driver.driverSlot === 'second' ? '2nd Driver' : '1st Driver'}
                        </div>
                      </td>

                      {/* Site / Hub */}
                      <td className="py-3 px-4 text-[#57534e]">
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-amber-700 shrink-0" />
                          <span>{driver.site || currentSupervisorSite || 'North Terminal Hub'}</span>
                        </div>
                      </td>

                      {/* Login Password */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] bg-[#faf7f2] px-2 py-1 rounded-lg border border-[#ded7c8] w-fit">
                          <Key className="w-3 h-3 text-amber-700 shrink-0" />
                          <span className="text-[#1c1917]">{tempPwd}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(tempPwd, `pwd-${driver.uid}`, 'Password')}
                            className="p-0.5 rounded text-[#a8a29e] hover:text-[#1c1917] transition cursor-pointer"
                            title="Copy Password for Driver"
                          >
                            {copiedId === `pwd-${driver.uid}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          id={`btn-assign-cab-${driver.uid}`}
                          onClick={() => openAssignModal(driver)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-[11px] transition shadow-xs flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>{hasCab ? 'Change Cab' : 'Assign Cab'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Cab Modal */}
      {driverToAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
          <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-[#1c1917]">
            <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-3">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-amber-700" />
                <h3 className="text-base font-bold">Assign Cab to Driver</h3>
              </div>
              <button
                type="button"
                onClick={() => setDriverToAssign(null)}
                className="p-1 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8] text-xs space-y-1">
              <div className="font-bold text-[#1c1917]">{driverToAssign.name}</div>
              <div className="text-[#78716c] font-mono">Mobile: {driverToAssign.phoneNumber}</div>
            </div>

            {assignError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{assignError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCabAssignment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#57534e] mb-1">
                  Cab Registration Number *
                </label>
                <input
                  type="text"
                  id="input-assign-cab-number"
                  required
                  value={cabInput}
                  onChange={(e) => setCabInput(e.target.value.toUpperCase())}
                  placeholder="e.g. KA-01-AB-1024"
                  className="w-full uppercase font-mono p-2.5 rounded-xl border border-[#ded7c8] bg-white focus:border-amber-400 focus:outline-none text-[#1c1917]"
                />
                <p className="text-[10px] text-[#78716c] mt-1">
                  This cab will be created in the Fleet Table or linked if it already exists.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#57534e] mb-1">Shift / Slot</label>
                  <select
                    value={shiftInput}
                    onChange={(e) => setShiftInput(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-[#ded7c8] bg-white focus:border-amber-400 focus:outline-none text-[#1c1917]"
                  >
                    <option value="morning_12h">Morning (12h) - 1st Driver</option>
                    <option value="night_12h">Night (12h) - 2nd Driver</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#57534e] mb-1">Site / Location</label>
                  <input
                    type="text"
                    value={siteInput}
                    onChange={(e) => setSiteInput(e.target.value)}
                    placeholder="e.g. North Terminal Hub"
                    className="w-full p-2.5 rounded-xl border border-[#ded7c8] bg-white focus:border-amber-400 focus:outline-none text-[#1c1917]"
                  >
                  </input>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e6e0d4]">
                <button
                  type="button"
                  onClick={() => setDriverToAssign(null)}
                  className="px-3.5 py-2 rounded-xl text-[#78716c] hover:bg-[#f5f0e6] font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-confirm-assign-cab"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save & Link to Fleet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
