import React, { useState } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FleetCab } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Navigation,
  X,
  MapPin,
  Car,
  User,
  Phone,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface AssignDutyModalProps {
  cab: FleetCab | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (cabNumber: string) => void;
}

export const AssignDutyModal: React.FC<AssignDutyModalProps> = ({
  cab,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { userProfile } = useAuth();
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set default start location whenever a cab is opened
  React.useEffect(() => {
    if (cab) {
      setStartLocation(cab.currentLocationText || cab.baseHub || '');
      setEndLocation('');
      setError(null);
    }
  }, [cab]);

  if (!isOpen || !cab) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startLocation.trim()) {
      setError('Please provide starting location or dispatch instructions.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supervisorName = userProfile?.name || 'Operations Supervisor';
      const dutyDocId = `duty_${cab.cabNumber.replace(/[^A-Z0-9]/gi, '_').toLowerCase()}_${Date.now()}`;

      // 1. Create a new document in "duties" collection with status "active"
      const dutyRef = doc(db, 'duties', dutyDocId);
      await setDoc(dutyRef, {
        cabNumber: cab.cabNumber,
        driverName: cab.driverName,
        startLocationText: startLocation.trim(),
        startTime: serverTimestamp(),
        endLocationText: endLocation.trim() || 'As directed by passenger/ops',
        endTime: null,
        status: 'active',
        assignedBy: supervisorName,
      });

      // 2. Set that cab's status in "fleet" to "on_duty"
      if (cab.id) {
        const cabRef = doc(db, 'fleet', cab.id);
        await updateDoc(cabRef, {
          status: 'on_duty',
          currentLocationText: startLocation.trim(),
          lastUpdated: serverTimestamp(),
          assignedSupervisor: supervisorName,
        });
      } else {
        // Fallback find cab by cabNumber
        const q = query(collection(db, 'fleet'), where('cabNumber', '==', cab.cabNumber));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'fleet', snap.docs[0].id), {
            status: 'on_duty',
            currentLocationText: startLocation.trim(),
            lastUpdated: serverTimestamp(),
            assignedSupervisor: supervisorName,
          });
        }
      }

      // 3. Mark that cab's unread notifications as read
      try {
        const notifQuery = query(
          collection(db, 'notifications'),
          where('cabNumber', '==', cab.cabNumber),
          where('read', '==', false)
        );
        const unreadNotifs = await getDocs(notifQuery);
        const updatePromises = unreadNotifs.docs.map((d) =>
          updateDoc(doc(db, 'notifications', d.id), { read: true })
        );
        await Promise.all(updatePromises);
      } catch (notifErr) {
        console.warn('Failed to mark notifications read:', notifErr);
      }

      if (onSuccess) {
        onSuccess(cab.cabNumber);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to assign duty:', err);
      setError(err.message || 'Failed to dispatch and assign duty.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="modal-assign-duty"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-[#1c1917]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e6e0d4] flex items-center justify-between bg-[#fbf9f5]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-indigo-700" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#1c1917] flex items-center gap-2">
                Assign Duty Dispatch
              </h3>
              <span className="font-mono text-xs font-bold text-amber-800">
                {cab.cabNumber}
              </span>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-assign-duty-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Cab & Driver Context Card */}
          <div className="bg-[#faf7f2] border border-[#ded7c8] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-[#44403c]">
                <User className="w-3.5 h-3.5 text-[#78716c]" />
                <span className="font-semibold text-[#1c1917]">{cab.driverName}</span>
              </div>
              <div className="flex items-center gap-1 text-[#78716c]">
                <Phone className="w-3 h-3 text-[#78716c]" />
                <span>{cab.driverPhone}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-[#ded7c8]">
              <div className="text-[#78716c] flex items-center gap-1">
                <Car className="w-3.5 h-3.5 text-[#78716c]" />
                <span>{cab.vehicleType}</span>
              </div>
              <div className="text-[#78716c]">
                Hub: <span className="text-[#1c1917] font-medium">{cab.baseHub}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Starting Location / Instructions */}
          <div>
            <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-700" />
              <span>Starting Location / Pickup Instructions *</span>
            </label>
            <input
              id="input-duty-start-location"
              type="text"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              placeholder="e.g. North Terminal Hub, Bay 3 or Client Site Alpha"
              className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
              required
              autoFocus
            />
          </div>

          {/* Optional Destination / Target Location */}
          <div>
            <label className="block text-xs font-semibold text-[#57534e] mb-1.5 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-indigo-700" />
              <span>Destination / Route (Optional)</span>
            </label>
            <input
              id="input-duty-end-location"
              type="text"
              value={endLocation}
              onChange={(e) => setEndLocation(e.target.value)}
              placeholder="e.g. Tech Park Tower 2 / Airport"
              className="w-full bg-[#faf7f2] border border-[#ded7c8] rounded-xl px-3.5 py-2.5 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Automatic Action Note */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 space-y-1">
            <div className="font-semibold text-amber-950 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
              <span>Automatic Real-Time Updates:</span>
            </div>
            <ul className="list-disc list-inside text-amber-900/90 space-y-0.5 pl-1">
              <li>Creates new active duty record assigned by you</li>
              <li>Updates cab status in Firestore fleet to &quot;On Duty&quot;</li>
              <li>Clears unread notifications for {cab.cabNumber}</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              id="btn-cancel-assign-duty"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] border border-[#ded7c8] text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-submit-assign-duty"
              disabled={isSubmitting || !startLocation.trim()}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4" />
                  <span>Confirm & Dispatch Duty</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
