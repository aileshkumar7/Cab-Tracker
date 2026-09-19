import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  UserProfile,
  UserRole,
  DriverShiftType,
  DriverSlotType,
  DEFAULT_SITES,
  FleetCab,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  createTeamMemberAccount,
  updateUserAccount,
  deleteUserAccount,
  generateTemporaryPassword,
  generateDriverEmail,
} from '../lib/teamManagement';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Car,
  Mail,
  Phone,
  Key,
  Copy,
  Check,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  UserCheck,
  Eye,
  EyeOff,
  User,
  MapPin,
  Pencil,
  Trash2,
  Clock,
  Radio,
} from 'lucide-react';

interface TeamSettingsPageProps {
  onBack: () => void;
}

export const TeamSettingsPage: React.FC<TeamSettingsPageProps> = ({ onBack }) => {
  const { userProfile: currentSupervisor } = useAuth();

  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [availableCabs, setAvailableCabs] = useState<FleetCab[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  // Add Member State
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<UserRole>('driver');
  const [site, setSite] = useState<string>(currentSupervisor?.site || DEFAULT_SITES[0]);
  const [customSite, setCustomSite] = useState('');
  const [isCustomSite, setIsCustomSite] = useState(false);
  const [cabNumber, setCabNumber] = useState('');
  const [shift, setShift] = useState<DriverShiftType>('morning_12h');
  const [driverSlot, setDriverSlot] = useState<DriverSlotType>('first');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status & Progress
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSuccess, setCreatedSuccess] = useState<{
    name: string;
    email: string;
    role: UserRole;
    tempPass: string;
    cabNumber?: string;
    site?: string;
    shift?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit Member State
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('driver');
  const [editSite, setEditSite] = useState('');
  const [editCustomSite, setEditCustomSite] = useState('');
  const [isEditCustomSite, setIsEditCustomSite] = useState(false);
  const [editCabNumber, setEditCabNumber] = useState('');
  const [editShift, setEditShift] = useState<DriverShiftType>('morning_12h');
  const [editDriverSlot, setEditDriverSlot] = useState<DriverSlotType>('first');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Member State
  const [deletingMember, setDeletingMember] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Live Firestore subscription on "users" collection
  useEffect(() => {
    const usersQuery = query(collection(db, 'users'));
    const unsub = onSnapshot(
      usersQuery,
      (snapshot) => {
        const users: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          users.push(docSnap.data() as UserProfile);
        });
        setTeamMembers(users);
      },
      (err) => {
        console.error('Error fetching users live listener:', err);
      }
    );

    return () => unsub();
  }, []);

  // Live Firestore subscription on "fleet" collection for quick cab assignment
  useEffect(() => {
    const fleetQuery = query(collection(db, 'fleet'));
    const unsub = onSnapshot(
      fleetQuery,
      (snapshot) => {
        const cabs: FleetCab[] = [];
        snapshot.forEach((docSnap) => {
          cabs.push({ id: docSnap.id, ...docSnap.data() } as FleetCab);
        });
        setAvailableCabs(cabs);
      },
      (err) => {
        console.error('Error fetching fleet cabs:', err);
      }
    );

    return () => unsub();
  }, []);

  // List of all known sites from defaults + fleet + users
  const allKnownSites = Array.from(
    new Set([
      ...DEFAULT_SITES,
      ...availableCabs.map((c) => c.site).filter(Boolean),
      ...teamMembers.map((m) => m.site).filter(Boolean),
    ])
  ) as string[];

  // Open Add modal with clean state
  const handleOpenAddForm = () => {
    setName('');
    setEmail('');
    setPhoneNumber('');
    setRole('driver');
    setSite(currentSupervisor?.site || DEFAULT_SITES[0]);
    setIsCustomSite(false);
    setCustomSite('');
    setCabNumber('');
    setShift('morning_12h');
    setDriverSlot('first');
    setPassword(generateTemporaryPassword());
    setError(null);
    setCreatedSuccess(null);
    setIsAddingMember(true);
  };

  const handleGenerateNewPassword = () => {
    setPassword(generateTemporaryPassword());
  };

  const handleCopyCredentials = () => {
    if (!createdSuccess) return;
    let text = `Cab Fleet Tracker Account Details\nName: ${createdSuccess.name}\nRole: ${createdSuccess.role.toUpperCase()}\nEmail: ${createdSuccess.email}\nTemporary Password: ${createdSuccess.tempPass}\nURL: ${window.location.origin}`;
    if (createdSuccess.site) {
      text += `\nAssigned Location / Hub: ${createdSuccess.site}`;
    }
    if (createdSuccess.cabNumber) {
      text += `\nAssigned Cab: ${createdSuccess.cabNumber}`;
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneNumber.trim() || !password) {
      setError('Please fill in all required fields (Name, Phone, Password).');
      return;
    }

    if (role === 'supervisor' && !email.trim()) {
      setError('Please provide an Email Address for the Supervisor account.');
      return;
    }

    if (role === 'driver' && !cabNumber.trim()) {
      setError('Please specify a Cab Number for the driver account.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const resolvedSite = isCustomSite ? customSite.trim() : site.trim();

    if (role === 'supervisor' && !resolvedSite) {
      setError('Please select or specify an assigned Location for the Supervisor.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const cleanCab = cabNumber.trim() ? cabNumber.trim().toUpperCase().replace(/\s+/g, '') : undefined;

      const result = await createTeamMemberAccount({
        name: name.trim(),
        email: email.trim() || undefined,
        phoneNumber: phoneNumber.trim(),
        password,
        role,
        site: resolvedSite || undefined,
        cabNumber: role === 'driver' ? cleanCab : undefined,
        shift: role === 'driver' ? shift : undefined,
        driverSlot: role === 'driver' ? driverSlot : undefined,
      });

      setCreatedSuccess({
        name: name.trim(),
        email: result.userProfile.email || email.trim(),
        role,
        tempPass: password,
        cabNumber: role === 'driver' ? cleanCab : undefined,
        site: resolvedSite || undefined,
        shift: role === 'driver' ? (shift === 'morning_12h' ? 'Morning (1st)' : 'Night (2nd)') : undefined,
      });

      // Clear form inputs
      setName('');
      setEmail('');
      setPhoneNumber('');
      setCabNumber('');
    } catch (err: any) {
      console.error('Error adding team member:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this identifier or email already exists.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please provide a valid email address.');
      } else {
        setError(err.message || 'Failed to create team member account.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit modal
  const handleOpenEdit = (member: UserProfile) => {
    setEditingMember(member);
    setEditName(member.name || '');
    setEditEmail(member.email || '');
    setEditPhone(member.phoneNumber || '');
    setEditRole(member.role || 'driver');

    const memberSite = member.site || currentSupervisor?.site || DEFAULT_SITES[0];
    if (allKnownSites.includes(memberSite)) {
      setEditSite(memberSite);
      setIsEditCustomSite(false);
      setEditCustomSite('');
    } else {
      setEditSite('__custom__');
      setIsEditCustomSite(true);
      setEditCustomSite(memberSite);
    }

    setEditCabNumber(member.cabNumber || '');
    setEditShift(member.shift || 'morning_12h');
    setEditDriverSlot(member.driverSlot || 'first');
    setEditPassword(member.temporaryPassword || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    if (!editName.trim() || !editPhone.trim()) {
      setEditError('Name and Phone number are required.');
      return;
    }

    if (editRole === 'supervisor' && !editEmail.trim()) {
      setEditError('Email address is required for Supervisors.');
      return;
    }

    if (editRole === 'driver' && !editCabNumber.trim()) {
      setEditError('Cab Number is required for Drivers.');
      return;
    }

    const resolvedSite = isEditCustomSite ? editCustomSite.trim() : editSite.trim();

    if (editRole === 'supervisor' && !resolvedSite) {
      setEditError('Location is required for Supervisors.');
      return;
    }

    setIsEditingSubmitting(true);
    setEditError(null);

    try {
      const cleanCab = editCabNumber.trim() ? editCabNumber.trim().toUpperCase().replace(/\s+/g, '') : undefined;
      const finalEmail = editEmail.trim() || (cleanCab ? generateDriverEmail(cleanCab) : editingMember.email);

      await updateUserAccount(editingMember.uid, {
        name: editName.trim(),
        email: finalEmail,
        phoneNumber: editPhone.trim(),
        role: editRole,
        site: resolvedSite || undefined,
        cabNumber: editRole === 'driver' ? cleanCab : undefined,
        shift: editRole === 'driver' ? editShift : undefined,
        driverSlot: editRole === 'driver' ? editDriverSlot : undefined,
        password: editPassword.trim() || undefined,
      });

      setEditingMember(null);
    } catch (err: any) {
      console.error('Error updating member:', err);
      setEditError(err.message || 'Failed to update member profile.');
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  // Delete Member Handler
  const handleDeleteMember = async () => {
    if (!deletingMember) return;
    setIsDeleting(true);
    try {
      await deleteUserAccount(deletingMember.uid);
      setDeletingMember(null);
    } catch (err: any) {
      console.error('Error deleting member:', err);
      alert('Failed to delete member: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered members list
  const filteredMembers = teamMembers.filter((member) => {
    if (roleFilter !== 'all' && member.role !== roleFilter) {
      return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const matchName = member.name?.toLowerCase().includes(term);
      const matchEmail = member.email?.toLowerCase().includes(term);
      const matchPhone = member.phoneNumber?.toLowerCase().includes(term);
      const matchCab = member.cabNumber?.toLowerCase().includes(term);
      const matchSite = member.site?.toLowerCase().includes(term);
      return matchName || matchEmail || matchPhone || matchCab || matchSite;
    }
    return true;
  });

  const supervisorsCount = teamMembers.filter((m) => m.role === 'supervisor' || m.role === 'admin' || m.role === 'master_admin').length;
  const driversCount = teamMembers.filter((m) => m.role === 'driver').length;

  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#1c1917] flex flex-col selection:bg-amber-400 selection:text-stone-900">
      {/* Top Header */}
      <header className="border-b border-[#e6e0d4] bg-white/95 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <button
              id="btn-back-to-dashboard"
              onClick={onBack}
              className="p-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>

            <div className="h-6 w-px bg-[#e6e0d4] hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-700" />
              </div>
              <div>
                <h1 className="font-bold text-base text-[#1c1917] flex items-center gap-2">
                  <span>Team & User Management</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">
                    SUPERVISORS & DRIVERS
                  </span>
                </h1>
                <p className="text-xs text-[#78716c]">
                  Provision and manage Drivers (with assigned Cabs) and Supervisors (with Location isolation)
                </p>
              </div>
            </div>
          </div>

          {/* Action button */}
          <button
            id="btn-open-add-member"
            onClick={handleOpenAddForm}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Team Member</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* KPI Counter Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-[#78716c]">
                Total Accounts
              </span>
              <div className="text-3xl font-black text-[#1c1917] mt-1">
                {teamMembers.length}
              </div>
              <span className="text-[11px] text-[#a8a29e]">Registered team members</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#faf7f2] border border-[#ded7c8] flex items-center justify-center">
              <Users className="w-6 h-6 text-[#78716c]" />
            </div>
          </div>

          <div
            onClick={() => setRoleFilter(roleFilter === 'driver' ? 'all' : 'driver')}
            className={`rounded-2xl p-5 border-2 transition-all cursor-pointer flex items-center justify-between shadow-xs ${
              roleFilter === 'driver'
                ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20'
                : 'bg-white border-[#e6e0d4] hover:border-emerald-600/40'
            }`}
          >
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-emerald-800">
                Fleet Drivers
              </span>
              <div className="text-3xl font-black text-[#1c1917] mt-1">
                {driversCount}
              </div>
              <span className="text-[11px] text-[#78716c]">Assigned to Cabs & Shifts</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <Car className="w-6 h-6 text-emerald-700" />
            </div>
          </div>

          <div
            onClick={() => setRoleFilter(roleFilter === 'supervisor' ? 'all' : 'supervisor')}
            className={`rounded-2xl p-5 border-2 transition-all cursor-pointer flex items-center justify-between shadow-xs ${
              roleFilter === 'supervisor'
                ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20'
                : 'bg-white border-[#e6e0d4] hover:border-indigo-600/40'
            }`}
          >
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-indigo-800">
                Supervisors
              </span>
              <div className="text-3xl font-black text-[#1c1917] mt-1">
                {supervisorsCount}
              </div>
              <span className="text-[11px] text-[#78716c]">Bound to specific Locations</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-indigo-700" />
            </div>
          </div>
        </div>

        {/* Member List & Search Section */}
        <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl p-4 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
              <input
                id="input-search-team"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, phone, cab, or location..."
                className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
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

            {/* Filter Pills */}
            <div className="flex items-center bg-[#faf7f2] p-1 rounded-xl border border-[#ded7c8] self-start sm:self-auto text-xs">
              <button
                type="button"
                id="team-filter-all"
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  roleFilter === 'all'
                    ? 'bg-white text-[#1c1917] shadow-xs border border-[#ded7c8]'
                    : 'text-[#78716c] hover:text-[#1c1917]'
                }`}
              >
                All ({teamMembers.length})
              </button>
              <button
                type="button"
                id="team-filter-drivers"
                onClick={() => setRoleFilter('driver')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  roleFilter === 'driver'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'text-[#78716c] hover:text-emerald-800'
                }`}
              >
                Drivers ({driversCount})
              </button>
              <button
                type="button"
                id="team-filter-supervisors"
                onClick={() => setRoleFilter('supervisor')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  roleFilter === 'supervisor'
                    ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                    : 'text-[#78716c] hover:text-indigo-800'
                }`}
              >
                Supervisors ({supervisorsCount})
              </button>
            </div>
          </div>

          {/* Table of Members */}
          <div className="border border-[#ded7c8] rounded-xl overflow-hidden bg-white">
            {filteredMembers.length === 0 ? (
              <div className="py-12 text-center text-[#78716c]">
                <Users className="w-10 h-10 text-[#d6cebf] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#1c1917]">No team members found</p>
                <p className="text-xs text-[#78716c] mt-1">
                  Click &quot;Add Team Member&quot; to provision new drivers or supervisors.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#1c1917]">
                  <thead className="bg-[#f5f0e6] text-[#57534e] uppercase tracking-wider text-[10px] border-b border-[#ded7c8]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">User</th>
                      <th className="py-3 px-4 font-semibold">Role</th>
                      <th className="py-3 px-4 font-semibold">Cab Number (Drivers)</th>
                      <th className="py-3 px-4 font-semibold">Location / Site</th>
                      <th className="py-3 px-4 font-semibold">Contact Email</th>
                      <th className="py-3 px-4 font-semibold">Phone Number</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0eae0] font-sans">
                    {filteredMembers.map((member) => {
                      const isCurrentSupervisor = member.uid === currentSupervisor?.uid;
                      const isSupervisor = member.role === 'supervisor' || member.role === 'admin' || member.role === 'master_admin';
                      const isDriver = member.role === 'driver';

                      return (
                        <tr
                          key={member.uid || member.email}
                          className="hover:bg-[#faf7f2] transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isSupervisor
                                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div className="font-semibold text-[#1c1917] flex items-center gap-1.5">
                                  <span>{member.name || 'Unnamed User'}</span>
                                  {isCurrentSupervisor && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                      (You)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[#a8a29e] font-mono">
                                  UID: {member.uid?.substring(0, 12)}...
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {member.role === 'master_admin' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                                Master Admin
                              </span>
                            ) : isSupervisor ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                                <ShieldCheck className="w-3.5 h-3.5 text-indigo-700" />
                                Supervisor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                                <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                                Driver
                              </span>
                            )}
                          </td>

                          {/* Cab Number Column */}
                          <td className="py-3 px-4">
                            {isDriver ? (
                              member.cabNumber ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#faf7f2] border border-[#ded7c8]">
                                  <Car className="w-3.5 h-3.5 text-emerald-700" />
                                  <span className="font-mono font-bold text-[#1c1917]">
                                    {member.cabNumber}
                                  </span>
                                  <span className="text-[10px] font-semibold text-[#78716c] bg-white px-1.5 py-0.5 rounded border border-[#e6e0d4]">
                                    {member.driverSlot === 'second' ? '2nd Shift' : '1st Shift'}
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                                  <AlertCircle className="w-3 h-3" />
                                  No Cab Assigned
                                </span>
                              )
                            ) : (
                              <span className="text-[#a8a29e] text-xs font-mono">
                                — (Supervises Location)
                              </span>
                            )}
                          </td>

                          {/* Location / Site Column */}
                          <td className="py-3 px-4">
                            {member.site ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-100 text-stone-800 border border-stone-300 font-medium">
                                <MapPin className="w-3.5 h-3.5 text-stone-600" />
                                <span>{member.site}</span>
                              </span>
                            ) : (
                              <span className="text-[#a8a29e] text-xs italic">
                                {member.role === 'master_admin' ? 'All Locations (Global)' : 'Unassigned Location'}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-[#1c1917]">
                              <Mail className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                              <span className="font-mono">{member.email}</span>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-[#44403c] font-mono">
                              <Phone className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                              <span>{member.phoneNumber || '—'}</span>
                            </div>
                          </td>

                          {/* Actions Column */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(member)}
                                title="Edit Member, Cab & Location"
                                className="p-1.5 rounded-lg text-[#57534e] hover:text-amber-900 hover:bg-amber-100 border border-[#ded7c8] transition cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {!isCurrentSupervisor && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingMember(member)}
                                  title="Delete User Account"
                                  className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 transition cursor-pointer"
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
        </div>
      </main>

      {/* ========================================================================= */}
      {/* Add Team Member Modal */}
      {/* ========================================================================= */}
      {isAddingMember && (
        <div
          id="modal-add-team-member"
          className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-[#1c1917] my-8">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#e6e0d4] flex items-center justify-between bg-[#fbf9f5]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-amber-800" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-[#1c1917]">Add New Team Member</h2>
                  <p className="text-xs text-[#78716c]">
                    Creates a Firebase Auth user & matching Firestore profile
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="btn-close-add-member-modal"
                onClick={() => setIsAddingMember(false)}
                className="p-1.5 rounded-xl text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Success Result View */}
              {createdSuccess ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                      <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                      <span>Account Successfully Provisioned!</span>
                    </div>
                    <p className="text-[#44403c] text-xs">
                      The user account has been registered with Firebase Authentication and assigned the role of{' '}
                      <strong className="text-[#1c1917] uppercase font-bold">
                        {createdSuccess.role}
                      </strong>
                      .
                    </p>
                  </div>

                  {/* Credentials Card */}
                  <div className="bg-[#faf7f2] border border-[#ded7c8] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-[#ded7c8] pb-2">
                      <span className="text-[#78716c] font-semibold uppercase text-[10px] tracking-wider">
                        Login Credentials
                      </span>
                      <button
                        type="button"
                        id="btn-copy-credentials"
                        onClick={handleCopyCredentials}
                        className="text-amber-800 hover:text-amber-900 flex items-center gap-1 font-bold text-xs transition cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied to Clipboard!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Credentials</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#78716c] block text-[11px]">Full Name</span>
                        <span className="font-semibold text-[#1c1917]">{createdSuccess.name}</span>
                      </div>
                      <div>
                        <span className="text-[#78716c] block text-[11px]">Role</span>
                        <span className="font-semibold text-amber-800 uppercase">
                          {createdSuccess.role}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#78716c] block text-[11px]">
                          {createdSuccess.role === 'driver' ? 'Primary Login Identifier' : 'Email Address (Login ID)'}
                        </span>
                        <span className="font-mono font-bold text-[#1c1917]">
                          {createdSuccess.role === 'driver' && createdSuccess.cabNumber
                            ? `Cab Number: ${createdSuccess.cabNumber}`
                            : createdSuccess.email}
                        </span>
                      </div>
                      {createdSuccess.site && (
                        <div className="col-span-2">
                          <span className="text-[#78716c] block text-[11px]">Assigned Location / Hub</span>
                          <span className="font-semibold text-indigo-900 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-indigo-600" />
                            {createdSuccess.site}
                          </span>
                        </div>
                      )}
                      {createdSuccess.cabNumber && (
                        <div className="col-span-2">
                          <span className="text-[#78716c] block text-[11px]">Assigned Cab & Shift</span>
                          <span className="font-mono font-bold text-emerald-900 flex items-center gap-1">
                            <Car className="w-3 h-3 text-emerald-600" />
                            {createdSuccess.cabNumber} {createdSuccess.shift ? `(${createdSuccess.shift})` : ''}
                          </span>
                        </div>
                      )}
                      <div className="col-span-2 bg-white p-2.5 rounded-lg border border-[#ded7c8]">
                        <span className="text-[#78716c] block text-[11px] font-semibold mb-1">
                          Generated Temporary Password
                        </span>
                        <div className="font-mono text-amber-900 text-sm font-bold tracking-wider select-all">
                          {createdSuccess.tempPass}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedSuccess(null);
                        setPassword(generateTemporaryPassword());
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] text-xs font-semibold transition cursor-pointer"
                    >
                      Add Another Member
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingMember(false)}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-xs transition cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Registration Form */
                <form onSubmit={handleCreateMember} className="space-y-4">
                  {error && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Role Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-[#57534e] mb-1.5">
                      Assign Operational Role *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        id="role-select-driver"
                        onClick={() => setRole('driver')}
                        className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                          role === 'driver'
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-[#faf7f2] border-[#ded7c8] text-[#78716c] hover:border-[#c5bdaf]'
                        }`}
                      >
                        <Car
                          className={`w-5 h-5 ${
                            role === 'driver' ? 'text-emerald-700' : 'text-[#a8a29e]'
                          }`}
                        />
                        <div>
                          <div className="font-bold text-xs text-[#1c1917]">Driver</div>
                          <div className="text-[10px] text-[#78716c]">Mobile Duty + Assigned Cab</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        id="role-select-supervisor"
                        onClick={() => setRole('supervisor')}
                        className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                          role === 'supervisor'
                            ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'bg-[#faf7f2] border-[#ded7c8] text-[#78716c] hover:border-[#c5bdaf]'
                        }`}
                      >
                        <ShieldCheck
                          className={`w-5 h-5 ${
                            role === 'supervisor' ? 'text-indigo-700' : 'text-[#a8a29e]'
                          }`}
                        />
                        <div>
                          <div className="font-bold text-xs text-[#1c1917]">Supervisor</div>
                          <div className="text-[10px] text-[#78716c]">Dashboard + Location Bound</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-[#78716c]" />
                      <span>Full Name *</span>
                    </label>
                    <input
                      id="input-member-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Manoj Kumar"
                      className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
                      required
                    />
                  </div>

                  {/* Email & Phone grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {role === 'driver' ? (
                      <div>
                        <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Car className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Cab Number *</span>
                          </span>
                          <span className="text-[10px] text-emerald-800 font-mono font-bold bg-emerald-100 px-1.5 py-0.2 rounded">
                            Login ID
                          </span>
                        </label>
                        <input
                          id="input-member-cab-primary"
                          type="text"
                          value={cabNumber}
                          onChange={(e) => setCabNumber(e.target.value.toUpperCase())}
                          placeholder="e.g. KA01AB1024"
                          className="w-full bg-emerald-50/40 border border-emerald-300 rounded-xl px-3.5 py-2.5 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-emerald-500 transition font-mono font-bold uppercase"
                          required
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-[#78716c]" />
                          <span>Email Address *</span>
                        </label>
                        <input
                          id="input-member-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="supervisor@fleet.com"
                          className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition font-mono"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-[#78716c]" />
                        <span>Phone Number *</span>
                      </label>
                      <input
                        id="input-member-phone"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+91 99114 97631"
                        className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-xs text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition font-mono"
                        required
                      />
                    </div>
                  </div>

                  {/* Driver Specific: Shift and Quick Cab Suggestions */}
                  {role === 'driver' && (
                    <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                          <Car className="w-4 h-4 text-emerald-700" />
                          <span>Cab & Shift Configuration</span>
                        </label>
                        <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                          Driver Credentials
                        </span>
                      </div>

                      <div>
                        {/* Quick Cabs suggestions */}
                        {availableCabs.length > 0 && (
                          <div>
                            <span className="text-[10px] text-emerald-800 font-medium mr-1.5">
                              Quick Select Fleet Cab:
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto">
                              {availableCabs.slice(0, 8).map((c) => (
                                <button
                                  key={c.id || c.cabNumber}
                                  type="button"
                                  onClick={() => {
                                    setCabNumber(c.cabNumber);
                                    if (c.site) {
                                      setSite(c.site);
                                    }
                                  }}
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition cursor-pointer ${
                                    cabNumber === c.cabNumber
                                      ? 'bg-emerald-600 text-white border-emerald-700 font-bold'
                                      : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                                  }`}
                                >
                                  {c.cabNumber}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-[11px] text-emerald-900 mt-2 font-medium">
                          The driver will sign in using <strong>Cab Number ({cabNumber || '...'})</strong> and password.
                        </p>
                      </div>

                      {/* Driver Shift Selection */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200">
                        <button
                          type="button"
                          onClick={() => {
                            setShift('morning_12h');
                            setDriverSlot('first');
                          }}
                          className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                            shift === 'morning_12h'
                              ? 'bg-white border-emerald-500 shadow-xs'
                              : 'bg-emerald-50/50 border-emerald-200 text-[#78716c]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                            <Clock className="w-3 h-3 text-emerald-600" />
                            <span>Morning Shift</span>
                          </div>
                          <div className="text-[10px] text-[#78716c]">
                            12h: 06:00 - 18:00 (1st Driver)
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShift('night_12h');
                            setDriverSlot('second');
                          }}
                          className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                            shift === 'night_12h'
                              ? 'bg-white border-emerald-500 shadow-xs'
                              : 'bg-emerald-50/50 border-emerald-200 text-[#78716c]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                            <Clock className="w-3 h-3 text-indigo-600" />
                            <span>Night Shift</span>
                          </div>
                          <div className="text-[10px] text-[#78716c]">
                            12h: 18:00 - 06:00 (2nd Driver)
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Location / Site for Supervisor or Driver */}
                  <div>
                    <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-indigo-700" />
                        <span>Assigned Location / Hub {role === 'supervisor' ? '*' : '(Optional)'}</span>
                      </span>
                      {role === 'supervisor' && (
                        <span className="text-[10px] text-indigo-800 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                          Restricts Supervisor Access
                        </span>
                      )}
                    </label>

                    {!isCustomSite ? (
                      <div className="space-y-1.5">
                        <select
                          id="select-member-site"
                          value={site}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomSite(true);
                              setCustomSite('');
                            } else {
                              setSite(e.target.value);
                            }
                          }}
                          className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 transition"
                        >
                          {allKnownSites.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                          <option value="__custom__">+ Enter Custom Hub Location...</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customSite}
                          onChange={(e) => setCustomSite(e.target.value)}
                          placeholder="Type custom hub name (e.g. South Terminal Hub)"
                          className="flex-1 bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500 transition"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomSite(false);
                            setSite(DEFAULT_SITES[0]);
                          }}
                          className="text-xs text-[#78716c] hover:text-[#1c1917] px-2 py-1.5 border border-[#ded7c8] rounded-lg bg-white"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {role === 'supervisor' && (
                      <p className="text-[10px] text-indigo-800 mt-1">
                        🔒 Note: This supervisor will only be able to view and manage cabs and attendance for this assigned location.
                      </p>
                    )}
                  </div>

                  {/* Temporary Password Field with Generator */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[#57534e] flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-amber-700" />
                        <span>Generated Temporary Password *</span>
                      </label>
                      <button
                        type="button"
                        id="btn-regenerate-password"
                        onClick={handleGenerateNewPassword}
                        className="text-[11px] text-amber-800 hover:text-amber-900 flex items-center gap-1 transition cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Generate New</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        id="input-member-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 pr-10 text-xs text-amber-950 font-mono tracking-wider focus:outline-none focus:border-amber-500 transition"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-[#78716c] hover:text-[#1c1917] cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#78716c] mt-1">
                      The user can sign in immediately with these credentials.
                    </p>
                  </div>

                  {/* Modal Footer Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e6e0d4]">
                    <button
                      type="button"
                      onClick={() => setIsAddingMember(false)}
                      className="px-4 py-2.5 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] text-xs font-semibold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      id="btn-submit-team-member"
                      disabled={isSubmitting}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-stone-950" />
                          <span>Creating Account...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 text-stone-950" />
                          <span>Save & Create User</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Edit Team Member Modal */}
      {/* ========================================================================= */}
      {editingMember && (
        <div
          id="modal-edit-team-member"
          className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-[#1c1917] my-8">
            <div className="px-6 py-4 border-b border-[#e6e0d4] flex items-center justify-between bg-[#fbf9f5]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-300 flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-indigo-800" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-[#1c1917]">Edit Team Member</h2>
                  <p className="text-xs text-[#78716c]">
                    Update details, Cab Number, or Assigned Location
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1.5 rounded-xl text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-[#57534e] mb-1">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditRole('driver')}
                    className={`p-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      editRole === 'driver'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'bg-[#faf7f2] border-[#ded7c8] text-[#78716c]'
                    }`}
                  >
                    <Car className="w-3.5 h-3.5 text-emerald-700" />
                    Driver
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditRole('supervisor')}
                    className={`p-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      editRole === 'supervisor'
                        ? 'bg-indigo-100 text-indigo-900 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-[#faf7f2] border-[#ded7c8] text-[#78716c]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-700" />
                    Supervisor
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-[#57534e] mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#57534e] mb-1">
                    {editRole === 'driver' ? 'Email Address (Optional)' : 'Email Address *'}
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder={editRole === 'driver' ? 'Optional for driver' : 'supervisor@fleet.com'}
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2 text-xs text-[#1c1917] font-mono focus:outline-none focus:border-amber-500"
                    required={editRole === 'supervisor'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#57534e] mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2 text-xs text-[#1c1917] font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              {/* If Driver: Cab Number & Shift */}
              {editRole === 'driver' && (
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                  <label className="block text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Car className="w-4 h-4 text-emerald-700" />
                    <span>Assigned Cab Number for Driver</span>
                  </label>
                  <input
                    type="text"
                    value={editCabNumber}
                    onChange={(e) => setEditCabNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. KA-01-AB-1024"
                    className="w-full bg-white border border-emerald-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-emerald-950"
                  />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditShift('morning_12h');
                        setEditDriverSlot('first');
                      }}
                      className={`p-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        editShift === 'morning_12h'
                          ? 'bg-white border-emerald-500 text-emerald-950 shadow-xs'
                          : 'bg-emerald-50 text-[#78716c] border-emerald-200'
                      }`}
                    >
                      Morning 12h (1st)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditShift('night_12h');
                        setEditDriverSlot('second');
                      }}
                      className={`p-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        editShift === 'night_12h'
                          ? 'bg-white border-emerald-500 text-emerald-950 shadow-xs'
                          : 'bg-emerald-50 text-[#78716c] border-emerald-200'
                      }`}
                    >
                      Night 12h (2nd)
                    </button>
                  </div>
                </div>
              )}

              {/* Location for Supervisor or Driver */}
              <div>
                <label className="block text-xs font-semibold text-[#57534e] mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Assigned Location / Hub {editRole === 'supervisor' ? '*' : '(Optional)'}</span>
                </label>

                {!isEditCustomSite ? (
                  <select
                    value={editSite}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsEditCustomSite(true);
                        setEditCustomSite('');
                      } else {
                        setEditSite(e.target.value);
                      }
                    }}
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2 text-xs text-[#1c1917] focus:outline-none focus:border-amber-500"
                  >
                    {allKnownSites.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom Hub...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editCustomSite}
                      onChange={(e) => setEditCustomSite(e.target.value)}
                      placeholder="Type custom location"
                      className="flex-1 bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3 py-2 text-xs text-[#1c1917]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditCustomSite(false);
                        setEditSite(DEFAULT_SITES[0]);
                      }}
                      className="text-xs text-[#78716c] px-2 py-1 border rounded"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Password update (optional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#57534e] flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-700" />
                    <span>Login Password</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditPassword(generateTemporaryPassword())}
                    className="text-[11px] text-amber-800 hover:text-amber-900"
                  >
                    Generate New
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave unchanged or enter new password"
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2 pr-10 text-xs font-mono text-amber-950 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-2 text-[#78716c] cursor-pointer"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e6e0d4]">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditingSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isEditingSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Updates</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Delete Confirmation Modal */}
      {/* ========================================================================= */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-base text-[#1c1917]">Delete Team Member?</h3>
              <p className="text-xs text-[#78716c] mt-1">
                Are you sure you want to remove <strong className="text-[#1c1917]">{deletingMember.name}</strong> ({deletingMember.email})? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                className="px-4 py-2 rounded-xl bg-[#f5f0e6] text-[#44403c] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
