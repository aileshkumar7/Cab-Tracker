import {
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface PendingOfflineAction {
  id: string;
  type: 'start_duty' | 'end_duty' | 'report_hub' | 'punch_location';
  timestamp: number;
  cabNumber: string;
  driverName: string;
  driverPhone?: string;
  dutyId?: string | null;
  fleetDocId?: string | null;
  latitude: number;
  longitude: number;
  locationText: string;
  driverSlot?: 'first' | 'second';
}

const STORAGE_KEY = 'cab_tracker_pending_offline_actions';

export function getPendingOfflineActions(): PendingOfflineAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Failed to read pending offline actions from localStorage:', e);
    return [];
  }
}

export function savePendingOfflineAction(action: PendingOfflineAction): void {
  try {
    const current = getPendingOfflineActions();
    current.push(action);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to save pending offline action to localStorage:', e);
  }
}

export function removePendingOfflineAction(id: string): void {
  try {
    const current = getPendingOfflineActions();
    const filtered = current.filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed to remove pending offline action from localStorage:', e);
  }
}

/**
 * Synchronizes any queued offline punch actions to Firestore once online
 */
export async function syncPendingOfflineActions(): Promise<{ syncedCount: number; errors: any[] }> {
  const pending = getPendingOfflineActions();
  if (pending.length === 0) return { syncedCount: 0, errors: [] };

  let syncedCount = 0;
  const errors: any[] = [];

  for (const item of pending) {
    try {
      const now = serverTimestamp();

      if (item.type === 'start_duty') {
        const updateData: any = {
          status: 'on_duty',
          activeDriverSlot: item.driverSlot || 'first',
          activeDriverName: item.driverName,
          activeDriverPhone: item.driverPhone || '',
          dutyStartLocation: item.locationText,
          dutyStartedAt: now,
          currentLocationLat: item.latitude,
          currentLocationLng: item.longitude,
          currentLocationText: item.locationText,
          lastUpdated: now,
        };
        if (item.driverSlot === 'second') {
          updateData.secondDriverName = item.driverName;
          updateData.secondDriverPhone = item.driverPhone || '';
        } else {
          updateData.firstDriverName = item.driverName;
          updateData.firstDriverPhone = item.driverPhone || '';
        }

        if (item.fleetDocId) {
          await updateDoc(doc(db, 'fleet', item.fleetDocId), updateData);
        } else {
          await addDoc(collection(db, 'fleet'), {
            cabNumber: item.cabNumber,
            driverName: item.driverName,
            driverPhone: item.driverPhone || '',
            ...updateData,
            vehicleType: 'Commercial Sedan',
            baseHub: 'Main Hub',
            assignedSupervisor: 'Operations',
          });
        }

        const dutyRef = await addDoc(collection(db, 'duties'), {
          cabNumber: item.cabNumber,
          driverName: item.driverName,
          startLocationText: item.locationText,
          startTime: now,
          endLocationText: '',
          endTime: null,
          status: 'active',
          assignedBy: 'Driver Self-Punch',
        });

        // Also punch in attendance record
        try {
          const punchDateStr = new Date(item.timestamp).toISOString().split('T')[0];
          await addDoc(collection(db, 'attendance'), {
            driverName: item.driverName,
            driverPhone: item.driverPhone || '',
            cabNumber: item.cabNumber,
            driverSlot: item.driverSlot || 'first',
            driverSlotLabel: item.driverSlot === 'second' ? '2nd Driver' : '1st Driver',
            date: punchDateStr,
            punchInTime: now,
            punchInLocation: item.locationText,
            punchOutTime: null,
            punchOutLocation: null,
            status: 'present',
            dutyId: dutyRef.id,
            createdAt: now,
          });
        } catch (attErr) {
          console.warn('Offline attendance punch sync notice:', attErr);
        }

        await addDoc(collection(db, 'notifications'), {
          type: 'duty_started',
          cabNumber: item.cabNumber,
          driverName: item.driverName,
          locationText: item.locationText,
          lat: item.latitude,
          lng: item.longitude,
          timestamp: now,
          read: false,
          offlineQueuedAt: item.timestamp,
        });
      } else if (item.type === 'end_duty') {
        if (item.dutyId) {
          await updateDoc(doc(db, 'duties', item.dutyId), {
            status: 'completed',
            endTime: now,
            endLocationText: item.locationText,
          });

          // Update matching attendance record
          try {
            const attQ = query(collection(db, 'attendance'), where('dutyId', '==', item.dutyId));
            const attSnap = await getDocs(attQ);
            if (!attSnap.empty) {
              await updateDoc(doc(db, 'attendance', attSnap.docs[0].id), {
                punchOutTime: now,
                punchOutLocation: item.locationText,
                status: 'completed',
              });
            }
          } catch (attErr) {
            console.warn('Attendance punch out sync notice:', attErr);
          }
        }

        if (item.fleetDocId) {
          await updateDoc(doc(db, 'fleet', item.fleetDocId), {
            status: 'cab_off_duty',
            dutyEndLocation: item.locationText,
            dutyEndedAt: now,
            currentLocationLat: item.latitude,
            currentLocationLng: item.longitude,
            currentLocationText: item.locationText,
            lastUpdated: now,
          });
        }

        await addDoc(collection(db, 'notifications'), {
          type: 'duty_completed',
          cabNumber: item.cabNumber,
          locationText: item.locationText,
          lat: item.latitude,
          lng: item.longitude,
          timestamp: now,
          read: false,
          offlineQueuedAt: item.timestamp,
        });
      } else if (item.type === 'punch_location') {
        if (item.fleetDocId) {
          await updateDoc(doc(db, 'fleet', item.fleetDocId), {
            driverName: item.driverName,
            driverPhone: item.driverPhone || '',
            currentLocationLat: item.latitude,
            currentLocationLng: item.longitude,
            currentLocationText: item.locationText,
            lastPunchedLocation: item.locationText,
            lastPunchedLat: item.latitude,
            lastPunchedLng: item.longitude,
            lastPunchedAt: now,
            lastUpdated: now,
          });
        } else {
          await addDoc(collection(db, 'fleet'), {
            cabNumber: item.cabNumber,
            driverName: item.driverName,
            driverPhone: item.driverPhone || '',
            vehicleType: 'Commercial Sedan',
            baseHub: 'Main Hub',
            status: 'reported_at_hub',
            currentLocationLat: item.latitude,
            currentLocationLng: item.longitude,
            currentLocationText: item.locationText,
            lastPunchedLocation: item.locationText,
            lastPunchedLat: item.latitude,
            lastPunchedLng: item.longitude,
            lastPunchedAt: now,
            lastUpdated: now,
            assignedSupervisor: 'Operations',
          });
        }

        await addDoc(collection(db, 'notifications'), {
          type: 'location_punch',
          cabNumber: item.cabNumber,
          driverName: item.driverName,
          locationText: item.locationText,
          lat: item.latitude,
          lng: item.longitude,
          timestamp: now,
          read: false,
          offlineQueuedAt: item.timestamp,
        });
      } else if (item.type === 'report_hub') {
        if (item.fleetDocId) {
          await updateDoc(doc(db, 'fleet', item.fleetDocId), {
            status: 'reported_at_hub',
            currentLocationLat: item.latitude,
            currentLocationLng: item.longitude,
            currentLocationText: item.locationText,
            lastUpdated: now,
          });
        }

        await addDoc(collection(db, 'notifications'), {
          type: 'reported_at_hub',
          cabNumber: item.cabNumber,
          locationText: item.locationText,
          lat: item.latitude,
          lng: item.longitude,
          timestamp: now,
          read: false,
          offlineQueuedAt: item.timestamp,
        });
      }

      removePendingOfflineAction(item.id);
      syncedCount++;
    } catch (err) {
      console.error('Error syncing queued offline action:', err);
      errors.push(err);
    }
  }

  return { syncedCount, errors };
}
