import {
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Clears all data from the Firestore database:
 * - fleet collection
 * - duties collection
 * - notifications collection
 * - location_logs collection
 * - users collection (except currently logged in user if desired)
 */
export async function clearAllFleetData(keepCurrentUserId?: string): Promise<{
  cabsDeleted: number;
  dutiesDeleted: number;
  notificationsDeleted: number;
  locationLogsDeleted: number;
  usersDeleted: number;
}> {
  let cabsDeleted = 0;
  let dutiesDeleted = 0;
  let notificationsDeleted = 0;
  let locationLogsDeleted = 0;
  let usersDeleted = 0;

  // 1. Clear fleet collection
  const fleetSnap = await getDocs(collection(db, 'fleet'));
  if (!fleetSnap.empty) {
    const batch = writeBatch(db);
    fleetSnap.docs.forEach((d) => {
      batch.delete(doc(db, 'fleet', d.id));
      cabsDeleted++;
    });
    await batch.commit();
  }

  // 2. Clear duties collection
  const dutiesSnap = await getDocs(collection(db, 'duties'));
  if (!dutiesSnap.empty) {
    const batch = writeBatch(db);
    dutiesSnap.docs.forEach((d) => {
      batch.delete(doc(db, 'duties', d.id));
      dutiesDeleted++;
    });
    await batch.commit();
  }

  // 3. Clear notifications collection
  const notifsSnap = await getDocs(collection(db, 'notifications'));
  if (!notifsSnap.empty) {
    const batch = writeBatch(db);
    notifsSnap.docs.forEach((d) => {
      batch.delete(doc(db, 'notifications', d.id));
      notificationsDeleted++;
    });
    await batch.commit();
  }

  // 4. Clear location_logs collection
  const logsSnap = await getDocs(collection(db, 'location_logs'));
  if (!logsSnap.empty) {
    const batch = writeBatch(db);
    logsSnap.docs.forEach((d) => {
      batch.delete(doc(db, 'location_logs', d.id));
      locationLogsDeleted++;
    });
    await batch.commit();
  }

  // 5. Clear users collection (except the current user)
  const usersSnap = await getDocs(collection(db, 'users'));
  if (!usersSnap.empty) {
    const batch = writeBatch(db);
    usersSnap.docs.forEach((d) => {
      if (!keepCurrentUserId || d.id !== keepCurrentUserId) {
        batch.delete(doc(db, 'users', d.id));
        usersDeleted++;
      }
    });
    await batch.commit();
  }

  return {
    cabsDeleted,
    dutiesDeleted,
    notificationsDeleted,
    locationLogsDeleted,
    usersDeleted,
  };
}
