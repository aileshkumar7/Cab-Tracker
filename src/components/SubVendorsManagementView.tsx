import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  UserProfile,
  FleetCab,
  SubVendorPermissions,
  DEFAULT_SUB_VENDOR_PERMISSIONS,
} from '../types';
import {
  createSubVendorAccount,
  updateSubVendorAccount,
  deleteUserAccount,
  generateTemporaryPassword,
} from '../lib/teamManagement';
import {
  Building2,
  UserPlus,
  Search,
  Check,
  Copy,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  ShieldCheck,
  Car,
  MapPin,
  Calendar,
  FileSpreadsheet,
  Users,
  Eye,
  EyeOff,
  AlertCircle,
  Key,
  Phone,
  Mail,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';

interface SubVendorsManagementViewProps {
  subVendors?: UserProfile[];
  fleetList?: FleetCab[];
  onRefresh?: () => void;
  onBack?: () => void;
}

export const SubVendorsManagementView: React.FC<SubVendorsManagementViewProps> = ({
  subVendors,
  fleetList = [],
  onRefresh,
  onBack,
}) => {
  const [internalVendors, setInternalVendors] = useState<UserProfile[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'sub_vendor'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => list.push({ uid: d.id, ...(d.data() as UserProfile) }));
        setInternalVendors(list);
      },
      (err) => console.warn('Sub-vendors snapshot error:', err)
    );
    return () => unsub();
  }, []);

  const activeVendors = (subVendors && subVendors.length > 0) ? subVendors : (internalVendors || []);

  const normalizeCabKey = (str?: string) => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Add Sub-Vendor Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [site, setSite] = useState('North Terminal Hub');
  const [selectedCabs, setSelectedCabs] = useState<string[]>([]);
  const [cabSearchTerm, setCabSearchTerm] = useState('');
  const [permissions, setPermissions] = useState<SubVendorPermissions>({
    ...DEFAULT_SUB_VENDOR_PERMISSIONS,
  });

  // Edit Sub-Vendor Modal State
  const [editingVendor, setEditingVendor] = useState<UserProfile | null>(null);
  const [editVendorName, setEditVendorName] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editSite, setEditSite] = useState('');
  const [editSelectedCabs, setEditSelectedCabs] = useState<string[]>([]);
  const [editCabSearchTerm, setEditCabSearchTerm] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editPermissions, setEditPermissions] = useState<SubVendorPermissions>({
    ...DEFAULT_SUB_VENDOR_PERMISSIONS,
  });

  // Delete Modal State
  const [vendorToDelete, setVendorToDelete] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Status & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setVendorName('');
    setContactName('');
    setEmail('');
    setPhoneNumber('');
    setPassword(generateTemporaryPassword());
    setShowPassword(false);
    setSite('North Terminal Hub');
    setSelectedCabs([]);
    setCabSearchTerm('');
    setPermissions({ ...DEFAULT_SUB_VENDOR_PERMISSIONS });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (vendor: UserProfile) => {
    setEditingVendor(vendor);
    setEditVendorName(vendor.vendorName || vendor.name || '');
    setEditContactName(vendor.name || '');
    setEditPhone(vendor.phoneNumber || '');
    setEditPassword(vendor.temporaryPassword || '');
    setShowEditPassword(false);
    setEditSite(vendor.site || 'North Terminal Hub');
    setEditSelectedCabs(vendor.assignedCabs || []);
    setEditCabSearchTerm('');
    setEditStatus(vendor.status || 'active');
    setEditPermissions(vendor.permissions || { ...DEFAULT_SUB_VENDOR_PERMISSIONS });
    setFormError(null);
  };

  // Preset permissions templates
  const applyPreset = (preset: 'full' | 'tracking_only' | 'reports_only', isEdit = false) => {
    let presetPerms: SubVendorPermissions;
    if (preset === 'full') {
      presetPerms = {
        canViewMap: true,
        canViewFleetTable: true,
        canAssignDuty: true,
        canViewReports: true,
        canViewAttendance: true,
        canAddCab: true,
        canDeleteCab: false,
        canExportData: true,
        canViewDrivers: true,
      };
    } else if (preset === 'tracking_only') {
      presetPerms = {
        canViewMap: true,
        canViewFleetTable: true,
        canAssignDuty: false,
        canViewReports: false,
        canViewAttendance: false,
        canAddCab: false,
        canDeleteCab: false,
        canExportData: false,
        canViewDrivers: false,
      };
    } else {
      presetPerms = {
        canViewMap: false,
        canViewFleetTable: true,
        canAssignDuty: false,
        canViewReports: true,
        canViewAttendance: true,
        canAddCab: false,
        canDeleteCab: false,
        canExportData: true,
        canViewDrivers: true,
      };
    }

    if (isEdit) {
      setEditPermissions(presetPerms);
    } else {
      setPermissions(presetPerms);
    }
  };

  // All unique cabs available in fleet
  const allFleetCabs = useMemo(() => {
    const list = fleetList || [];
    const map = new Map<string, FleetCab>();
    for (const cab of list) {
      const norm = cab?.cabNumber?.trim().toUpperCase();
      if (norm && !map.has(norm)) {
        map.set(norm, cab);
      }
    }
    return Array.from(map.values());
  }, [fleetList]);

  // Submit Add Sub-Vendor
  const handleCreateSubVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!vendorName.trim()) {
      setFormError('Please enter the Sub-Vendor / Agency Company Name.');
      return;
    }
    if (!contactName.trim()) {
      setFormError('Please enter the Contact Person Name.');
      return;
    }
    if (!email.trim()) {
      setFormError('Please enter a login email address.');
      return;
    }
    if (!phoneNumber.trim()) {
      setFormError('Please enter a phone number.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createSubVendorAccount({
        vendorName: vendorName.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        password: password.trim(),
        site: site.trim(),
        assignedCabs: selectedCabs,
        permissions,
      });

      showToast(`Sub-Vendor "${vendorName}" created successfully with ${selectedCabs.length} assigned cabs.`);
      setIsAddModalOpen(false);
    } catch (err: any) {
      console.error('Error creating sub-vendor:', err);
      setFormError(err.message || 'Failed to create sub-vendor account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit Sub-Vendor
  const handleUpdateSubVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;
    setFormError(null);

    if (!editVendorName.trim()) {
      setFormError('Please enter the Sub-Vendor / Agency Company Name.');
      return;
    }
    if (!editContactName.trim()) {
      setFormError('Please enter the Contact Person Name.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSubVendorAccount(editingVendor.uid, {
        vendorName: editVendorName.trim(),
        name: editContactName.trim(),
        phoneNumber: editPhone.trim(),
        site: editSite.trim(),
        assignedCabs: editSelectedCabs,
        permissions: editPermissions,
        status: editStatus,
        temporaryPassword: editPassword.trim() || undefined,
      });

      showToast(`Updated permissions & settings for "${editVendorName}".`);
      setEditingVendor(null);
    } catch (err: any) {
      console.error('Error updating sub-vendor:', err);
      setFormError(err.message || 'Failed to update sub-vendor account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Delete Sub-Vendor
  const handleConfirmDelete = async () => {
    if (!vendorToDelete) return;
    setIsDeleting(true);
    try {
      await deleteUserAccount(vendorToDelete.uid);
      showToast(`Sub-Vendor account "${vendorToDelete.vendorName || vendorToDelete.name}" deleted.`);
      setVendorToDelete(null);
    } catch (err: any) {
      console.error('Error deleting sub-vendor:', err);
      alert('Failed to delete vendor account: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy Access Card to Clipboard (WhatsApp-ready)
  const copyVendorCredentials = (vendor: UserProfile) => {
    const cabsText =
      vendor.assignedCabs && vendor.assignedCabs.length > 0
        ? vendor.assignedCabs.join(', ')
        : 'All Fleet Cabs (Global)';

    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const portalUrl = `${appUrl}/?role=vendor`;
    const text = `🚖 *SUB-VENDOR PORTAL ACCESS DETAILS*
----------------------------------------
*Company:* ${vendor.vendorName || vendor.name}
*Contact:* ${vendor.name} (${vendor.phoneNumber || '—'})
*Portal URL:* ${portalUrl}
*Login Email:* ${vendor.email}
*Password:* ${vendor.temporaryPassword || 'Your chosen password'}
*Assigned Cabs:* ${cabsText}
*Status:* ${vendor.status === 'suspended' ? 'Suspended' : 'Active'}
----------------------------------------
Log in to track your assigned cabs live on the GPS map & fleet dashboard.`;

    navigator.clipboard.writeText(text);
    setCopiedId(vendor.uid);
    showToast(`Access details for ${vendor.vendorName || vendor.name} copied to clipboard!`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Filtered sub-vendors list
  const filteredVendors = useMemo(() => {
    return activeVendors.filter((v) => {
      if (statusFilter !== 'all' && (v.status || 'active') !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const mVendor = v.vendorName?.toLowerCase().includes(term);
        const mName = v.name?.toLowerCase().includes(term);
        const mEmail = v.email?.toLowerCase().includes(term);
        const mPhone = v.phoneNumber?.toLowerCase().includes(term);
        const mCabs = v.assignedCabs?.some((c) => c.toLowerCase().includes(term));
        return mVendor || mName || mEmail || mPhone || mCabs;
      }
      return true;
    });
  }, [activeVendors, searchTerm, statusFilter]);

  // Filtered cabs list for Add Modal
  const filteredCabsForAdd = useMemo(() => {
    if (!cabSearchTerm.trim()) return allFleetCabs;
    const term = cabSearchTerm.toLowerCase().trim();
    return allFleetCabs.filter(
      (c) =>
        c.cabNumber?.toLowerCase().includes(term) ||
        c.driverName?.toLowerCase().includes(term) ||
        c.vehicleType?.toLowerCase().includes(term)
    );
  }, [allFleetCabs, cabSearchTerm]);

  // Filtered cabs list for Edit Modal
  const filteredCabsForEdit = useMemo(() => {
    if (!editCabSearchTerm.trim()) return allFleetCabs;
    const term = editCabSearchTerm.toLowerCase().trim();
    return allFleetCabs.filter(
      (c) =>
        c.cabNumber?.toLowerCase().includes(term) ||
        c.driverName?.toLowerCase().includes(term) ||
        c.vehicleType?.toLowerCase().includes(term)
    );
  }, [allFleetCabs, editCabSearchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#1c1917] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold border border-amber-400/30">
          <Check className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-[#e6e0d4] rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0 mt-0.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-900 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#1c1917]">Sub-Vendors & Rights Management</h2>
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wider border border-amber-300">
                Master Admin
              </span>
            </div>
            <p className="text-xs text-[#78716c] mt-0.5">
              Distribute dashboard access to third-party vendors. Restrict each vendor to their specific cabs and grant granular feature rights.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Sub-Vendor</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-[#e6e0d4] shadow-xs">
          <p className="text-[11px] font-bold text-[#78716c] uppercase">Registered Sub-Vendors</p>
          <p className="text-xl font-black text-[#1c1917] mt-1">{activeVendors.length}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#e6e0d4] shadow-xs">
          <p className="text-[11px] font-bold text-[#78716c] uppercase">Active Portals</p>
          <p className="text-xl font-black text-emerald-600 mt-1">
            {activeVendors.filter((v) => (v.status || 'active') === 'active').length}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#e6e0d4] shadow-xs">
          <p className="text-[11px] font-bold text-[#78716c] uppercase">Assigned Vehicles</p>
          <p className="text-xl font-black text-amber-600 mt-1">
            {Array.from(new Set(activeVendors.flatMap((v) => v.assignedCabs || []))).length}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-[#e6e0d4] shadow-xs">
          <p className="text-[11px] font-bold text-[#78716c] uppercase">Suspended Vendors</p>
          <p className="text-xl font-black text-rose-600 mt-1">
            {activeVendors.filter((v) => v.status === 'suspended').length}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#e6e0d4] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#78716c]" />
          <input
            type="text"
            placeholder="Search by vendor name, email, phone, cab..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs text-[#1c1917] focus:outline-hidden focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-[#78716c]">Status:</span>
          <div className="flex items-center rounded-xl bg-[#faf7f2] border border-[#ded7c8] p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === 'all' ? 'bg-white shadow-xs text-[#1c1917] font-bold' : 'text-[#78716c]'
              }`}
            >
              All ({activeVendors?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === 'active' ? 'bg-white shadow-xs text-emerald-700 font-bold' : 'text-[#78716c]'
              }`}
            >
              Active ({activeVendors?.filter((v) => (v.status || 'active') === 'active').length || 0})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('suspended')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === 'suspended' ? 'bg-white shadow-xs text-rose-700 font-bold' : 'text-[#78716c]'
              }`}
            >
              Suspended ({activeVendors?.filter((v) => v.status === 'suspended').length || 0})
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Vendors Cards / Table */}
      {filteredVendors.length === 0 ? (
        <div className="bg-white border border-[#e6e0d4] rounded-2xl p-12 text-center shadow-xs">
          <Building2 className="w-12 h-12 text-[#a8a29e] mx-auto mb-3 stroke-[1.5]" />
          <h3 className="text-base font-bold text-[#1c1917]">No Sub-Vendors Found</h3>
          <p className="text-xs text-[#78716c] mt-1 max-w-sm mx-auto">
            {searchTerm
              ? 'No sub-vendors matched your search criteria.'
              : 'You have not added any sub-vendors yet. Click "Add New Sub-Vendor" to distribute portal access to vendors.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="mt-4 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create First Sub-Vendor</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredVendors.map((vendor) => {
            const perms = vendor.permissions || DEFAULT_SUB_VENDOR_PERMISSIONS;
            const assignedCount = vendor.assignedCabs?.length || 0;
            const isSuspended = vendor.status === 'suspended';

            return (
              <div
                key={vendor.uid}
                className={`bg-white border ${
                  isSuspended ? 'border-rose-200 bg-rose-50/20' : 'border-[#e6e0d4]'
                } rounded-2xl p-5 shadow-xs transition hover:shadow-md space-y-4`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Vendor Identity */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-900 shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-[#1c1917]">
                          {vendor.vendorName || vendor.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                            isSuspended
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {isSuspended ? 'Suspended' : 'Active'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 text-[#57534e] text-[11px] font-medium border border-stone-200">
                          {vendor.site || 'North Terminal Hub'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-[#78716c]">
                        <span className="flex items-center gap-1 font-semibold text-[#44403c]">
                          <Users className="w-3.5 h-3.5 text-[#a8a29e]" />
                          {vendor.name} (Contact)
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3.5 h-3.5 text-[#a8a29e]" />
                          {vendor.phoneNumber || '—'}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Mail className="w-3.5 h-3.5 text-[#a8a29e]" />
                          {vendor.email}
                        </span>
                        {vendor.temporaryPassword && (
                          <span className="flex items-center gap-1 font-mono text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[11px]">
                            <Key className="w-3 h-3 text-amber-600" />
                            Pass: {vendor.temporaryPassword}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                    <button
                      type="button"
                      onClick={() => copyVendorCredentials(vendor)}
                      className="px-3 py-1.5 rounded-xl bg-[#faf7f2] hover:bg-amber-100 text-[#1c1917] border border-[#ded7c8] font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Copy Login & Access Card"
                    >
                      {copiedId === vendor.uid ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#78716c]" />
                          <span>Copy Access</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(vendor)}
                      className="px-3 py-1.5 rounded-xl bg-[#faf7f2] hover:bg-[#efe9dc] text-[#1c1917] border border-[#ded7c8] font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Edit Rights & Assigned Cabs"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#78716c]" />
                      <span>Edit Rights</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVendorToDelete(vendor)}
                      className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs transition flex items-center justify-center cursor-pointer shadow-xs"
                      title="Delete Sub-Vendor Account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Assigned Cabs Pill List */}
                <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#ded7c8] space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#57534e] flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-amber-600" />
                      Assigned Fleet Cabs ({assignedCount})
                    </span>
                    <span className="text-[11px] text-[#78716c]">
                      {assignedCount === 0
                        ? 'Vendor can see all fleet cabs (unrestricted)'
                        : `Vendor strictly limited to these ${assignedCount} cabs`}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {assignedCount === 0 ? (
                      <span className="px-2.5 py-1 rounded-lg bg-white border border-[#ded7c8] text-[#78716c] font-medium text-[11px]">
                        Global View (All cabs visible)
                      </span>
                    ) : (
                      vendor.assignedCabs!.map((cabNo) => (
                        <span
                          key={cabNo}
                          className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-stone-900 font-mono font-bold text-xs shadow-2xs flex items-center gap-1"
                        >
                          <Car className="w-3 h-3 text-amber-600" />
                          {cabNo}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Permissions Badges */}
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-[#78716c] text-[11px] uppercase tracking-wider">
                    Feature Rights Allowed:
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canViewMap
                          ? 'bg-cyan-50 text-cyan-800 border-cyan-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Live GPS Map
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canViewFleetTable
                          ? 'bg-blue-50 text-blue-800 border-blue-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Fleet Table
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canAssignDuty
                          ? 'bg-purple-50 text-purple-800 border-purple-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Assign Duty
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canViewReports
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Location Reports
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canViewAttendance
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Attendance Register
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canViewDrivers
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Registered Drivers
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canAddCab
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Add Cabs
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canDeleteCab
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Delete Cabs
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        perms.canExportData
                          ? 'bg-teal-50 text-teal-800 border-teal-300'
                          : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                      }`}
                    >
                      Excel Export
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================== ADD SUB-VENDOR MODAL ===================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-[#e6e0d4] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-[#1c1917] my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 border border-amber-300 text-amber-900">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1c1917]">Create Sub-Vendor Account</h3>
                  <p className="text-[11px] text-[#78716c]">
                    Provide vendor login details, choose their assigned cabs, and set permissions.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubVendor} className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Vendor / Agency Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Travel Fleet / Sai Logistics"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Contact Person Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajesh Kumar"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Login Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. vendor.apex@fleet.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Mobile Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Login Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78716c] hover:text-[#1c1917]"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Base Hub / Depot
                  </label>
                  <input
                    type="text"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    placeholder="e.g. North Terminal Hub"
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Section 2: Assigned Cabs */}
              <div className="bg-[#faf7f2] p-4 rounded-xl border border-[#ded7c8] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1917] flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-amber-600" />
                      Select Cabs Assigned to this Vendor ({selectedCabs.length} selected)
                    </h4>
                    <p className="text-[11px] text-[#78716c]">
                      The vendor will only track and manage these specific cabs.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedCabs(allFleetCabs.map((c) => c.cabNumber))}
                      className="text-amber-800 font-bold hover:underline cursor-pointer"
                    >
                      Select All ({allFleetCabs.length})
                    </button>
                    <span className="text-stone-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCabs([])}
                      className="text-[#78716c] font-semibold hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Cab Search Filter */}
                <input
                  type="text"
                  placeholder="Filter cabs by registration or driver..."
                  value={cabSearchTerm}
                  onChange={(e) => setCabSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#ded7c8] rounded-lg text-xs"
                />

                {/* Cabs Multi-select Grid */}
                <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-1 bg-white rounded-lg border border-[#e6e0d4]">
                  {filteredCabsForAdd.length === 0 ? (
                    <div className="col-span-3 py-4 text-center text-xs text-[#78716c]">
                      No matching cabs in fleet
                    </div>
                  ) : (
                    filteredCabsForAdd.map((cab) => {
                      const cabNorm = normalizeCabKey(cab.cabNumber);
                      const isSelected = selectedCabs.some((c) => normalizeCabKey(c) === cabNorm);
                      return (
                        <label
                          key={cab.cabNumber}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                            isSelected
                              ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                              : 'bg-white border-[#ded7c8] text-[#57534e] hover:bg-[#fbf9f5]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCabs([...selectedCabs, cab.cabNumber]);
                              } else {
                                setSelectedCabs(selectedCabs.filter((c) => normalizeCabKey(c) !== cabNorm));
                              }
                            }}
                            className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                          />
                          <div className="truncate">
                            <span className="font-mono block truncate">{cab.cabNumber}</span>
                            <span className="text-[10px] text-[#78716c] block truncate font-normal">
                              {cab.driverName || 'No Driver'}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Section 3: Feature Rights & Permissions */}
              <div className="bg-[#faf7f2] p-4 rounded-xl border border-[#ded7c8] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1917] flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      Configure Feature Permissions
                    </h4>
                    <p className="text-[11px] text-[#78716c]">
                      Choose which dashboard tabs and actions this sub-vendor is permitted to use.
                    </p>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => applyPreset('full')}
                      className="px-2 py-1 rounded bg-white border border-[#ded7c8] hover:bg-amber-100 font-semibold cursor-pointer"
                    >
                      Full Access
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('tracking_only')}
                      className="px-2 py-1 rounded bg-white border border-[#ded7c8] hover:bg-amber-100 font-semibold cursor-pointer"
                    >
                      Live Tracking Only
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('reports_only')}
                      className="px-2 py-1 rounded bg-white border border-[#ded7c8] hover:bg-amber-100 font-semibold cursor-pointer"
                    >
                      Reports Only
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canViewMap}
                      onChange={(e) => setPermissions({ ...permissions, canViewMap: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Live GPS Map</span>
                      <span className="text-[10px] text-[#78716c]">View vehicle location & moving status</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canViewFleetTable}
                      onChange={(e) => setPermissions({ ...permissions, canViewFleetTable: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Fleet Table</span>
                      <span className="text-[10px] text-[#78716c]">Roster of assigned cabs & drivers</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canAssignDuty}
                      onChange={(e) => setPermissions({ ...permissions, canAssignDuty: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Assign Duties</span>
                      <span className="text-[10px] text-[#78716c]">Dispatch trips & assign routes</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canViewReports}
                      onChange={(e) => setPermissions({ ...permissions, canViewReports: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Location Reports</span>
                      <span className="text-[10px] text-[#78716c]">Date-wise punch logs for billing</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canViewAttendance}
                      onChange={(e) => setPermissions({ ...permissions, canViewAttendance: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Driver Attendance</span>
                      <span className="text-[10px] text-[#78716c]">Shift punch in/out timestamps</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canViewDrivers}
                      onChange={(e) => setPermissions({ ...permissions, canViewDrivers: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Drivers Directory</span>
                      <span className="text-[10px] text-[#78716c]">Driver contacts and details</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canAddCab}
                      onChange={(e) => setPermissions({ ...permissions, canAddCab: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Add New Cabs</span>
                      <span className="text-[10px] text-[#78716c]">Allow vendor to register cabs</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canExportData}
                      onChange={(e) => setPermissions({ ...permissions, canExportData: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Excel Data Export</span>
                      <span className="text-[10px] text-[#78716c]">Download XLS / CSV reports</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-rose-200 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.canDeleteCab}
                      onChange={(e) => setPermissions({ ...permissions, canDeleteCab: e.target.checked })}
                      className="rounded border-[#ded7c8] text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-rose-900 block">Delete Cabs</span>
                      <span className="text-[10px] text-rose-700">Allow removing vehicles</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e6e0d4]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-[#78716c] hover:bg-[#f5f0e6] font-semibold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Create Sub-Vendor Portal</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== EDIT SUB-VENDOR MODAL ===================== */}
      {editingVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-[#e6e0d4] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-[#1c1917] my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 border border-amber-300 text-amber-900">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1c1917]">
                    Edit Sub-Vendor: {editingVendor.vendorName || editingVendor.name}
                  </h3>
                  <p className="text-[11px] text-[#78716c]">
                    Update assigned cabs, feature permissions, or account status.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                className="p-1.5 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateSubVendor} className="space-y-4">
              {/* Account Status Switcher */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#faf7f2] border border-[#ded7c8]">
                <div>
                  <span className="text-xs font-bold text-[#1c1917] block">Vendor Portal Status</span>
                  <span className="text-[11px] text-[#78716c]">
                    {editStatus === 'active'
                      ? 'Portal is active and accessible by the vendor'
                      : 'Portal is suspended; vendor cannot access the dashboard'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditStatus(editStatus === 'active' ? 'suspended' : 'active')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition ${
                    editStatus === 'active'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}
                >
                  {editStatus === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  <span>{editStatus === 'active' ? 'Active' : 'Suspended'}</span>
                </button>
              </div>

              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Vendor / Agency Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editVendorName}
                    onChange={(e) => setEditVendorName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editContactName}
                    onChange={(e) => setEditContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#57534e] mb-1">
                    Reset / Update Password
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Leave blank to keep unchanged"
                      className="w-full pl-3 pr-9 py-2 bg-[#faf7f2] border border-[#ded7c8] rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78716c] hover:text-[#1c1917]"
                    >
                      {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Assigned Cabs */}
              <div className="bg-[#faf7f2] p-4 rounded-xl border border-[#ded7c8] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1917] flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-amber-600" />
                      Assigned Cabs ({editSelectedCabs.length} selected)
                    </h4>
                    <p className="text-[11px] text-[#78716c]">
                      Modify which cabs this vendor has authorization to track.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditSelectedCabs(allFleetCabs.map((c) => c.cabNumber))}
                      className="text-amber-800 font-bold hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-stone-300">|</span>
                    <button
                      type="button"
                      onClick={() => setEditSelectedCabs([])}
                      className="text-[#78716c] font-semibold hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Filter cabs..."
                  value={editCabSearchTerm}
                  onChange={(e) => setEditCabSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#ded7c8] rounded-lg text-xs"
                />

                <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-1 bg-white rounded-lg border border-[#e6e0d4]">
                  {filteredCabsForEdit.length === 0 ? (
                    <div className="col-span-3 py-4 text-center text-xs text-[#78716c]">
                      No matching cabs in fleet
                    </div>
                  ) : (
                    filteredCabsForEdit.map((cab) => {
                      const cabNorm = normalizeCabKey(cab.cabNumber);
                      const isSelected = editSelectedCabs.some((c) => normalizeCabKey(c) === cabNorm);
                      return (
                        <label
                          key={cab.cabNumber}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                            isSelected
                              ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                              : 'bg-white border-[#ded7c8] text-[#57534e] hover:bg-[#fbf9f5]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditSelectedCabs([...editSelectedCabs, cab.cabNumber]);
                              } else {
                                setEditSelectedCabs(editSelectedCabs.filter((c) => normalizeCabKey(c) !== cabNorm));
                              }
                            }}
                            className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                          />
                          <div className="truncate">
                            <span className="font-mono block truncate">{cab.cabNumber}</span>
                            <span className="text-[10px] text-[#78716c] block truncate font-normal">
                              {cab.driverName || 'No Driver'}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Permissions */}
              <div className="bg-[#faf7f2] p-4 rounded-xl border border-[#ded7c8] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1917] flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      Permissions & Rights
                    </h4>
                    <p className="text-[11px] text-[#78716c]">
                      Adjust feature access for this vendor.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => applyPreset('full', true)}
                      className="px-2 py-1 rounded bg-white border border-[#ded7c8] hover:bg-amber-100 font-semibold cursor-pointer"
                    >
                      Full
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('tracking_only', true)}
                      className="px-2 py-1 rounded bg-white border border-[#ded7c8] hover:bg-amber-100 font-semibold cursor-pointer"
                    >
                      Tracking Only
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('reports_only', true)}
                      className="px-2 py-1 rounded bg-white border border-[#ded7c8] hover:bg-amber-100 font-semibold cursor-pointer"
                    >
                      Reports Only
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewMap}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canViewMap: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Live GPS Map</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewFleetTable}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canViewFleetTable: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Fleet Table</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canAssignDuty}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canAssignDuty: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Assign Duties</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewReports}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canViewReports: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Location Reports</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewAttendance}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canViewAttendance: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Driver Attendance</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewDrivers}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canViewDrivers: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Drivers Directory</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canAddCab}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canAddCab: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Add Cabs</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#e6e0d4] text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canExportData}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canExportData: e.target.checked })}
                      className="rounded border-[#ded7c8] text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-[#1c1917] block">Excel Export</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-rose-200 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editPermissions.canDeleteCab}
                      onChange={(e) => setEditPermissions({ ...editPermissions, canDeleteCab: e.target.checked })}
                      className="rounded border-[#ded7c8] text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-rose-900 block">Delete Cabs</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e6e0d4]">
                <button
                  type="button"
                  onClick={() => setEditingVendor(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-[#78716c] hover:bg-[#f5f0e6] font-semibold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Rights & Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== DELETE CONFIRMATION MODAL ===================== */}
      {vendorToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white border-2 border-rose-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-[#1c1917] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#e6e0d4] pb-3">
              <div className="flex items-center gap-2 text-rose-700">
                <div className="p-2 rounded-xl bg-rose-100 border border-rose-300">
                  <Trash2 className="w-5 h-5 text-rose-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1c1917]">Delete Sub-Vendor</h3>
                  <p className="text-[11px] text-[#78716c]">Revoke vendor portal access</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVendorToDelete(null)}
                disabled={isDeleting}
                className="p-1.5 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-900">Vendor / Agency:</span>
                <span className="font-bold text-[#1c1917]">
                  {vendorToDelete.vendorName || vendorToDelete.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-900">Contact:</span>
                <span className="text-[#1c1917]">{vendorToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-900">Email:</span>
                <span className="font-mono text-[#1c1917]">{vendorToDelete.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-900">Assigned Cabs:</span>
                <span className="font-bold text-[#1c1917]">
                  {vendorToDelete.assignedCabs?.length || 0} Cabs
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">This sub-vendor will immediately lose dashboard access.</p>
                <p className="text-[11px] text-[#78716c] mt-0.5">
                  The vendor's login credentials will be revoked. Fleet vehicles and drivers will remain intact in your master database.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e6e0d4]">
              <button
                type="button"
                onClick={() => setVendorToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-[#78716c] hover:bg-[#f5f0e6] font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Sub-Vendor</span>
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
