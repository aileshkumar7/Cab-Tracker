import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { DriverDutyScreen } from './components/DriverDutyScreen';
import { Car, Loader2, ShieldCheck, UserCheck } from 'lucide-react';

function MainApp() {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f6f0] text-[#1c1917] flex flex-col items-center justify-center p-4 font-sans">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#1b2331] p-1 border-2 border-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 animate-pulse overflow-hidden">
            <img
              src="/icon-192.png"
              alt="Cab Fleet Tracker"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/icon.svg';
              }}
            />
          </div>
          <div className="flex items-center gap-2 text-[#78716c] text-sm font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
            <span>Connecting to Cab Fleet Tracker...</span>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Authentication (Sign in / Sign up)
  if (!userProfile) {
    return <AuthScreen />;
  }

  // Role-based routing
  if (
    userProfile.role === 'admin' ||
    userProfile.role === 'master_admin' ||
    userProfile.role === 'supervisor' ||
    userProfile.role === 'sub_vendor'
  ) {
    return <AdminDashboard />;
  }

  if (userProfile.role === 'driver') {
    return <DriverDutyScreen />;
  }

  // Fallback if role is unexpected
  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#1c1917] flex flex-col items-center justify-center p-4">
      <div className="p-6 bg-white border border-[#e6e0d4] rounded-2xl max-w-md text-center shadow-xs">
        <UserCheck className="w-10 h-10 text-amber-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#1c1917] mb-2">Unknown Role</h2>
        <p className="text-xs text-[#78716c] mb-4">
          Your profile has an unrecognized role ({userProfile.role || 'none'}). Please contact your fleet operations administrator.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
