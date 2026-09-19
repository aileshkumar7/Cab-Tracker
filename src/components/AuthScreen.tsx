import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, DriverShiftType, DriverSlotType, DEFAULT_SITES } from '../types';
import {
  Car,
  ShieldCheck,
  UserCheck,
  Lock,
  Mail,
  Phone,
  User,
  AlertCircle,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  Key,
  Sun,
  Moon,
  MapPin,
  Building2,
  Shield,
} from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const { signIn, signUp, error, clearError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // URL Query parameter checks (e.g. ?role=driver&cab=DL1Z9999)
  const isDriverDeepLink = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('role') === 'driver' ||
    new URLSearchParams(window.location.search).get('app') === 'driver'
  );
  const initialCabParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('cab') || ''
    : '';

  // Form states
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [site, setSite] = useState<string>('North Terminal Hub');
  const [cabNumber, setCabNumber] = useState(initialCabParam);
  const [role, setRole] = useState<UserRole>('driver');
  const [shift, setShift] = useState<DriverShiftType>('morning_12h');
  const [driverSlot, setDriverSlot] = useState<DriverSlotType>('first');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleQuickDemoLogin = async (demoEmail: string, demoPass: string) => {
    clearError();
    setFormMsg(null);
    setEmailOrPhone(demoEmail);
    setPassword(demoPass);
    setIsSubmitting(true);
    try {
      await signIn(demoEmail, demoPass);
    } catch (err: any) {
      // Error handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setFormMsg(null);

    // Validate login inputs
    if (mode === 'login') {
      if (!emailOrPhone.trim() || !password) {
        setFormMsg('Please enter your Cab Number, Email, or Phone Number along with your password.');
        return;
      }
    }

    // Validate registration inputs
    if (mode === 'register') {
      if (!name.trim()) {
        setFormMsg('Please enter your full name.');
        return;
      }
      if (!phoneNumber.trim()) {
        setFormMsg('Please enter your phone number.');
        return;
      }
      if (role === 'driver') {
        // Phone number is required for driver account creation via mobile
        // Cab number is optional - if provided, driver and cab are instantly linked in admin dashboard
      } else {
        if (!emailOrPhone.trim()) {
          setFormMsg('Please enter your email address.');
          return;
        }
      }
      if (!password) {
        setFormMsg('Please enter a password.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await signIn(emailOrPhone.trim(), password);
      } else {
        await signUp({
          email: role === 'driver' ? (emailOrPhone.trim() || undefined) : emailOrPhone.trim(),
          pass: password,
          name: name.trim(),
          phoneNumber: phoneNumber.trim(),
          role,
          site: site.trim(),
          cabNumber: role === 'driver' ? cabNumber.trim().toUpperCase().replace(/\s+/g, '') : undefined,
          shift: role === 'driver' ? shift : undefined,
          driverSlot: role === 'driver' ? driverSlot : undefined,
        });
      }
    } catch (err: any) {
      // Error handled in AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#1c1917] flex flex-col justify-center py-10 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Brand Header */}
        <div className="flex items-center justify-center space-x-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Car className="w-7 h-7 text-stone-950 font-bold" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#1c1917] flex items-center gap-2">
              Cab Fleet Tracker
            </h1>
            <span className="text-xs uppercase tracking-wider text-amber-800 font-bold">
              Live Fleet Dispatch System
            </span>
          </div>
        </div>

        <p className="text-center text-sm text-[#78716c] mb-6 font-medium">
          Real-time operations dispatch & driver duty tracking
        </p>

        {/* Driver Quick Access Banner when opened via QR Code */}
        {isDriverDeepLink && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-sm text-amber-950 text-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500 text-stone-950 rounded-xl font-bold shrink-0 shadow-xs">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <div className="font-black text-amber-950 text-sm">Driver Mobile Terminal</div>
                <div className="text-[11px] text-amber-800 font-medium">Select a driver account below for instant 1-tap mobile duty testing:</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                id="btn-quick-deep-driver1"
                onClick={() => handleQuickDemoLogin('driver1@fleet.com', 'Driver@12345')}
                className="p-2 rounded-xl bg-white hover:bg-amber-100 text-[#1c1917] border border-amber-300 font-bold text-[11px] text-center transition cursor-pointer shadow-xs flex flex-col items-center"
              >
                <span>Driver 1</span>
                <span className="text-[9px] font-mono font-medium text-amber-800">KA01-1024</span>
              </button>
              <button
                type="button"
                id="btn-quick-deep-driver2"
                onClick={() => handleQuickDemoLogin('driver2@fleet.com', 'Driver@12345')}
                className="p-2 rounded-xl bg-white hover:bg-amber-100 text-[#1c1917] border border-amber-300 font-bold text-[11px] text-center transition cursor-pointer shadow-xs flex flex-col items-center"
              >
                <span>Driver 2</span>
                <span className="text-[9px] font-mono font-medium text-amber-800">KA01-5588</span>
              </button>
              <button
                type="button"
                id="btn-quick-deep-driver3"
                onClick={() => handleQuickDemoLogin('driver3@fleet.com', 'Driver@12345')}
                className="p-2 rounded-xl bg-white hover:bg-amber-100 text-[#1c1917] border border-amber-300 font-bold text-[11px] text-center transition cursor-pointer shadow-xs flex flex-col items-center"
              >
                <span>Driver 3</span>
                <span className="text-[9px] font-mono font-medium text-amber-800">KA01-9901</span>
              </button>
            </div>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-white border-2 border-[#e6e0d4] shadow-md rounded-3xl p-6 sm:p-8">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-[#f5f0e6] rounded-2xl mb-6 border border-[#e6e0d4]">
            <button
              type="button"
              id="tab-mode-login"
              onClick={() => {
                setMode('login');
                clearError();
                setFormMsg(null);
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-[#1c1917] shadow-xs'
                  : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              id="tab-mode-register"
              onClick={() => {
                setMode('register');
                clearError();
                setFormMsg(null);
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-amber-500 text-stone-950 shadow-xs'
                  : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
            >
              Create Account
            </button>
          </div>

          {(error || formMsg) && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2.5 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error || formMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-[#44403c] mb-1.5">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
                    <input
                      id="input-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
                      required={mode === 'register'}
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-bold text-[#44403c] mb-1.5">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
                    <input
                      id="input-phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
                      required={mode === 'register'}
                    />
                  </div>
                </div>

                {/* Role Picker */}
                <div>
                  <label className="block text-xs font-bold text-[#44403c] mb-2">
                    Select Account Role
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      id="btn-role-supervisor"
                      onClick={() => setRole('supervisor')}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                        role === 'supervisor'
                          ? 'border-indigo-500 bg-indigo-50/80 text-indigo-950'
                          : 'border-[#ded7c8] bg-[#faf7f2] text-[#78716c] hover:border-[#a8a29e]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-900">
                        <ShieldCheck className="w-4 h-4 text-indigo-600" />
                        Supervisor
                      </div>
                      <span className="text-[11px] text-[#78716c] leading-tight">
                        Admin Dashboard & fleet dispatch
                      </span>
                    </button>

                    <button
                      type="button"
                      id="btn-role-driver"
                      onClick={() => setRole('driver')}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                        role === 'driver'
                          ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950'
                          : 'border-[#ded7c8] bg-[#faf7f2] text-[#78716c] hover:border-[#a8a29e]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        Driver
                      </div>
                      <span className="text-[11px] text-[#78716c] leading-tight">
                        Mobile Duty Screen & live GPS
                      </span>
                    </button>
                  </div>
                </div>

                {/* Driver Shift Selection (1st Driver vs 2nd Driver - 12 hrs Shift) */}
                {role === 'driver' && (
                  <div>
                    <label className="block text-xs font-bold text-[#44403c] mb-1.5 flex items-center justify-between">
                      <span className="text-amber-900">Choose Driver Designation *</span>
                      <span className="text-[10px] text-[#78716c]">Dynamic 12h Duty Count</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        id="btn-shift-morning"
                        onClick={() => {
                          setShift('morning_12h');
                          setDriverSlot('first');
                        }}
                        className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 cursor-pointer ${
                          driverSlot === 'first'
                            ? 'border-amber-500 bg-amber-50/90 text-amber-950 shadow-xs'
                            : 'border-[#ded7c8] bg-[#faf7f2] text-[#78716c] hover:border-[#a8a29e]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
                          <Sun className="w-4 h-4 text-amber-600" />
                          <span>1st Driver</span>
                        </div>
                        <span className="text-[11px] text-[#57534e] leading-snug">
                          12-hour shift starts when driver begins duty
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 border border-amber-300">
                            1st Driver Slot
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        id="btn-shift-night"
                        onClick={() => {
                          setShift('night_12h');
                          setDriverSlot('second');
                        }}
                        className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 cursor-pointer ${
                          driverSlot === 'second'
                            ? 'border-indigo-500 bg-indigo-50/90 text-indigo-950 shadow-xs'
                            : 'border-[#ded7c8] bg-[#faf7f2] text-[#78716c] hover:border-[#a8a29e]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-950">
                          <Moon className="w-4 h-4 text-indigo-600" />
                          <span>2nd Driver</span>
                        </div>
                        <span className="text-[11px] text-[#57534e] leading-snug">
                          12-hour shift starts when driver begins duty
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-200/80 text-indigo-900 border border-indigo-300">
                            2nd Driver Slot
                          </span>
                        </div>
                      </button>
                    </div>
                    <p className="text-[10px] text-[#78716c] mt-1.5 leading-normal">
                      &bull; Continuous duty counts 12 hours from start time + 2 hours grace buffer (14 hrs total max). Attendance punches in automatically.
                    </p>
                  </div>
                )}

                {/* Site / Location Binding */}
                <div>
                  <label className="block text-xs font-bold text-[#44403c] mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-600" />
                      Assigned Site / Location *
                    </span>
                    <span className="text-[10px] text-[#78716c]">Site Isolation Policy</span>
                  </label>
                  <select
                    id="select-site-auth"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-sm text-[#1c1917] focus:outline-none focus:border-amber-500 transition font-medium"
                  >
                    {DEFAULT_SITES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#78716c] mt-1">
                    {role === 'supervisor'
                      ? 'Supervisors only see, track, and manage cabs and drivers for their assigned site.'
                      : 'Driver will be bound to this site and report to this location.'}
                  </p>
                </div>

                {/* Cab Number (for Driver in Registration) */}
                {role === 'driver' && (
                  <div>
                    <label className="block text-xs font-bold text-[#44403c] mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-amber-950">
                        <Car className="w-3.5 h-3.5 text-amber-600" />
                        Assigned Cab Number
                      </span>
                      <span className="text-[10px] text-amber-800 font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                        Cab or Mobile ID
                      </span>
                    </label>
                    <div className="relative">
                      <Car className="w-4 h-4 text-amber-600 absolute left-3.5 top-3" />
                      <input
                        id="input-cab-number"
                        type="text"
                        value={cabNumber}
                        onChange={(e) => setCabNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. HR55BD0168 or leave blank if pending"
                        className="w-full bg-amber-50/40 border-2 border-amber-300 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-[#1c1917] font-mono placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 focus:bg-white transition uppercase"
                      />
                    </div>
                    <p className="text-[11px] text-amber-800 mt-1 font-medium">
                      Enter your cab number to auto-link your vehicle. You can log in using either your Cab Number or Mobile Number!
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Email Address (for Supervisor/Admin registration, or optional in driver mode) */}
            {mode === 'register' && role === 'supervisor' && (
              <div>
                <label className="block text-xs font-bold text-[#44403c] mb-1.5">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
                  <input
                    id="input-email-register"
                    type="email"
                    value={emailOrPhone}
                    onChange={(e) => setEmailOrPhone(e.target.value)}
                    placeholder="supervisor@fleet.com"
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
                    required
                  />
                </div>
              </div>
            )}

            {/* Sign In Identifier (Cab Number, Email, or Mobile) */}
            {mode === 'login' && (
              <div>
                <label className="block text-xs font-bold text-[#44403c] mb-1.5 flex items-center justify-between">
                  <span>Cab Number, Email, or Mobile *</span>
                  <span className="text-[10px] text-amber-800 font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                    Driver Login
                  </span>
                </label>
                <div className="relative">
                  <Car className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
                  <input
                    id="input-email"
                    type="text"
                    value={emailOrPhone}
                    onChange={(e) => setEmailOrPhone(e.target.value)}
                    placeholder="Enter Cab Number (e.g. KA01-1024) or Email / Mobile"
                    className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
                    required
                  />
                </div>
                <p className="text-[11px] text-[#78716c] mt-1">
                  Drivers can enter their registered <strong>Cab Number</strong> directly.
                </p>
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-[#44403c] mb-1.5">
                Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-3" />
                <input
                  id="input-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="btn-submit-auth"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'login' ? 'Sign In to Portal' : 'Register & Enter Fleet'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins Section */}
          <div className="mt-6 pt-5 border-t border-[#e6e0d4]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#57534e] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Quick 1-Click Demo Logins
              </span>
              <span className="text-[10px] text-[#78716c] font-bold bg-[#f5f0e6] px-2 py-0.5 rounded-full border border-[#ded7c8]">
                Multi-Site Demo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Master Admin */}
              <button
                type="button"
                id="btn-quick-login-master-admin"
                disabled={isSubmitting}
                onClick={() => handleQuickDemoLogin('admin@fleet.com', 'Admin@12345')}
                className="p-3 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border-2 border-amber-500/50 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-700 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-amber-950">Master Admin</span>
                  </div>
                  <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded uppercase">
                    All Sites
                  </span>
                </div>
                <div className="text-[11px] text-[#57534e] mt-1 font-mono">admin@fleet.com &bull; Full Access</div>
              </button>

              {/* North Hub Supervisor */}
              <button
                type="button"
                id="btn-quick-login-supervisor-north"
                disabled={isSubmitting}
                onClick={() => handleQuickDemoLogin('supervisor@fleet.com', 'Admin@12345')}
                className="p-3 rounded-2xl bg-indigo-50/80 hover:bg-indigo-100/90 border border-indigo-200 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-700 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-indigo-950">North Hub Supervisor</span>
                  </div>
                  <span className="text-[9px] bg-indigo-200 text-indigo-900 font-bold px-1.5 py-0.5 rounded">
                    Site 1
                  </span>
                </div>
                <div className="text-[11px] text-[#57534e] mt-1 font-mono">supervisor@fleet.com &bull; North Hub</div>
              </button>

              {/* Tech Park Supervisor */}
              <button
                type="button"
                id="btn-quick-login-supervisor-tech"
                disabled={isSubmitting}
                onClick={() => handleQuickDemoLogin('supervisor2@fleet.com', 'Admin@12345')}
                className="p-3 rounded-2xl bg-indigo-50/80 hover:bg-indigo-100/90 border border-indigo-200 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-700 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-indigo-950">Tech Park Supervisor</span>
                  </div>
                  <span className="text-[9px] bg-indigo-200 text-indigo-900 font-bold px-1.5 py-0.5 rounded">
                    Site 2
                  </span>
                </div>
                <div className="text-[11px] text-[#57534e] mt-1 font-mono">supervisor2@fleet.com &bull; Tech Park</div>
              </button>

              {/* Driver 1 Quick Login */}
              <button
                type="button"
                id="btn-quick-login-driver1"
                disabled={isSubmitting}
                onClick={() => handleQuickDemoLogin('driver1@fleet.com', 'Driver@12345')}
                className="p-3 rounded-2xl bg-amber-50/80 hover:bg-amber-100/90 border border-amber-200 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-700 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-amber-950">Driver 1 (Rajesh)</span>
                  </div>
                  <span className="text-[9px] bg-emerald-100 text-emerald-900 font-bold px-1.5 py-0.5 rounded">
                    North Hub
                  </span>
                </div>
                <div className="text-[11px] text-[#57534e] mt-1 font-mono">driver1@fleet.com &bull; KA-01-AB-1024</div>
              </button>
            </div>
          </div>
        </div>

        {/* Preset Credentials Reference Box */}
        <div className="mt-4 p-4 rounded-3xl bg-white border-2 border-[#e6e0d4] text-[#57534e] text-xs shadow-sm">
          <div className="flex items-center justify-between mb-3 text-[#1c1917] font-bold">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-600" />
              <span>Multi-Site Role Credentials Reference</span>
            </div>
            <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 font-bold">
              Active Test Matrix
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Master Admin Creds */}
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-300 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-700" />
                  Master Admin (Unrestricted All Sites & Reports)
                </div>
                <div className="font-mono text-[#1c1917] text-xs mt-0.5">
                  Email: <span className="text-amber-800 font-bold">admin@fleet.com</span>
                </div>
                <div className="font-mono text-[#57534e] text-[11px]">
                  Pass: <span className="text-[#1c1917] font-semibold">Admin@12345</span>
                </div>
              </div>
              <button
                type="button"
                id="btn-copy-admin-creds"
                onClick={() => copyToClipboard('admin@fleet.com\nAdmin@12345', 'admin')}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-50 text-[#1c1917] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                {copiedKey === 'admin' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Supervisor 1 Creds */}
            <div className="p-3 rounded-2xl bg-[#faf7f2] border border-[#ded7c8] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">
                  North Hub Supervisor (Site: North Terminal Hub)
                </div>
                <div className="font-mono text-[#1c1917] text-xs mt-0.5">
                  Email: <span className="text-amber-800 font-bold">supervisor@fleet.com</span>
                </div>
                <div className="font-mono text-[#57534e] text-[11px]">
                  Pass: <span className="text-[#1c1917] font-semibold">Admin@12345</span>
                </div>
              </div>
              <button
                type="button"
                id="btn-copy-supervisor-creds"
                onClick={() => copyToClipboard('supervisor@fleet.com\nAdmin@12345', 'supervisor')}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#ded7c8] hover:bg-[#f5f0e6] text-[#1c1917] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                {copiedKey === 'supervisor' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Supervisor 2 Creds */}
            <div className="p-3 rounded-2xl bg-[#faf7f2] border border-[#ded7c8] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">
                  Tech Park Supervisor (Site: Central Tech Park Hub)
                </div>
                <div className="font-mono text-[#1c1917] text-xs mt-0.5">
                  Email: <span className="text-amber-800 font-bold">supervisor2@fleet.com</span>
                </div>
                <div className="font-mono text-[#57534e] text-[11px]">
                  Pass: <span className="text-[#1c1917] font-semibold">Admin@12345</span>
                </div>
              </div>
              <button
                type="button"
                id="btn-copy-supervisor2-creds"
                onClick={() => copyToClipboard('supervisor2@fleet.com\nAdmin@12345', 'supervisor2')}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#ded7c8] hover:bg-[#f5f0e6] text-[#1c1917] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                {copiedKey === 'supervisor2' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Driver 1 Creds */}
            <div className="p-3 rounded-2xl bg-[#faf7f2] border border-[#ded7c8] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                  Driver: Rajesh Kumar (North Hub &bull; Morning 12h)
                </div>
                <div className="font-mono text-[#1c1917] text-xs mt-0.5">
                  Cab Number (Login ID): <span className="text-amber-800 font-bold">KA-01-AB-1024</span> (or KA01-1024)
                </div>
                <div className="font-mono text-[#57534e] text-[11px]">
                  Pass: <span className="text-[#1c1917] font-semibold">Driver@12345</span> &bull; Mobile: 9876543210
                </div>
              </div>
              <button
                type="button"
                id="btn-copy-driver1-creds"
                onClick={() => copyToClipboard('KA-01-AB-1024\nDriver@12345', 'driver1')}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#ded7c8] hover:bg-[#f5f0e6] text-[#1c1917] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                {copiedKey === 'driver1' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="mt-2.5 text-[11px] text-[#78716c]">
            Tip: Drivers can log in directly using their <strong>Cab Number</strong> (e.g. KA01-1024) and password.
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-xs text-[#78716c]">
          Cab Fleet Tracker &bull; Multi-Site Enterprise Operations &bull; Cloud Firestore Active
        </div>
      </div>
    </div>
  );
};
