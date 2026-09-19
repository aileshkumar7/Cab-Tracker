import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, UserRole, DriverShiftType, DriverSlotType } from '../types';

/**
 * Generates a clean synthetic email for drivers registering with Cab Number
 * Format: cab-{alphanumeric}@fleet.local
 */
export function generateDriverEmail(cabNumber: string): string {
  const clean = (cabNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `cab.${clean || 'driver'}@fleet.local`;
}

/**
 * Strips all undefined properties from an object so Firestore setDoc/updateDoc never throws
 * "Unsupported field value: undefined".
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && val !== null) {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Creates a new user in Firebase Auth and Firestore without logging out
 * the current active admin/supervisor session.
 */
export async function createTeamMemberAccount({
  name,
  email,
  phoneNumber,
  password,
  role,
  site,
  cabNumber,
  shift,
  driverSlot,
}: {
  name: string;
  email?: string;
  phoneNumber: string;
  password: string;
  role: UserRole;
  site?: string;
  cabNumber?: string;
  shift?: DriverShiftType;
  driverSlot?: DriverSlotType;
}): Promise<{ uid: string; userProfile: UserProfile }> {
  const cleanCab = cabNumber ? cabNumber.trim().toUpperCase().replace(/\s+/g, '') : undefined;
  
  // For drivers, if email is not provided or empty, generate a synthetic one from cab number
  let normEmail = email?.trim().toLowerCase();
  if (role === 'driver') {
    if (!cleanCab && !normEmail) {
      throw new Error('Please enter a Cab Number for the driver.');
    }
    if (!normEmail && cleanCab) {
      normEmail = generateDriverEmail(cleanCab);
    }
  }

  if (!normEmail) {
    throw new Error('Please provide an email address or cab number.');
  }

  // Check if email or cab number already registered in Firestore
  const qEmail = query(collection(db, 'users'), where('email', '==', normEmail));
  const snapEmail = await getDocs(qEmail);
  if (!snapEmail.empty) {
    throw new Error(
      role === 'driver' && cleanCab
        ? `A driver account with Cab Number "${cleanCab}" already exists.`
        : `An account with email "${normEmail}" already exists.`
    );
  }

  // If driver has a cab number, also check if that cab number is already assigned in users
  if (role === 'driver' && cleanCab) {
    const qCab = query(collection(db, 'users'), where('cabNumber', '==', cleanCab));
    const snapCabUsers = await getDocs(qCab);
    // If there's already a driver with the exact same slot on this cab
    const targetSlot = driverSlot || (shift === 'night_12h' ? 'second' : 'first');
    for (const docSnap of snapCabUsers.docs) {
      const uData = docSnap.data() as UserProfile;
      const uSlot = uData.driverSlot || (uData.shift === 'night_12h' ? 'second' : 'first');
      if (uSlot === targetSlot) {
        throw new Error(
          `Cab "${cleanCab}" already has a ${targetSlot === 'first' ? '1st (Morning)' : '2nd (Night)'} driver assigned (${uData.name || 'Existing Driver'}).`
        );
      }
    }
  }

  const secondaryAppName = `team-creator-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  let targetUid = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  try {
    // 1. Attempt to create Firebase Auth account on secondary app if available
    try {
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        normEmail,
        password
      );
      if (userCredential.user) {
        targetUid = userCredential.user.uid;
      }
      await signOut(secondaryAuth);
    } catch (authErr: any) {
      if (authErr?.code === 'auth/email-already-in-use') {
        throw new Error(`An account with email "${normEmail}" already exists in Authentication.`);
      }
      console.warn('Secondary auth provider notice (saving directly to Firestore users):', authErr?.code);
    }

    const cleanCab = cabNumber ? cabNumber.trim().toUpperCase().replace(/\s+/g, '') : undefined;
    const cleanSite = site ? site.trim() : undefined;
    const resolvedShift: DriverShiftType | undefined =
      role === 'driver' ? (shift || (driverSlot === 'second' ? 'night_12h' : 'morning_12h')) : undefined;
    const resolvedSlot: DriverSlotType | undefined =
      role === 'driver' ? (driverSlot || (shift === 'night_12h' ? 'second' : 'first')) : undefined;

    // 2. Build sanitized user profile document
    const userProfileData: UserProfile = {
      uid: targetUid,
      name: name.trim(),
      email: normEmail,
      phoneNumber: phoneNumber.trim(),
      role,
      temporaryPassword: password,
      createdAt: new Date().toISOString() as any,
    };

    if (cleanSite) {
      userProfileData.site = cleanSite;
    }
    if (cleanCab && role === 'driver') {
      userProfileData.cabNumber = cleanCab;
    }
    if (resolvedShift && role === 'driver') {
      userProfileData.shift = resolvedShift;
    }
    if (resolvedSlot && role === 'driver') {
      userProfileData.driverSlot = resolvedSlot;
    }

    const firestorePayload: Record<string, any> = {
      ...sanitizeFirestoreData(userProfileData),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      temporaryPassword: password,
    };

    // Save into Firestore "users" collection with no undefined fields
    await setDoc(doc(db, 'users', targetUid), firestorePayload, { merge: true });

    // 3. If driver has assigned cab, link driver to fleet cab document
    if (cleanCab && role === 'driver') {
      try {
        const qCab = query(collection(db, 'fleet'), where('cabNumber', '==', cleanCab));
        const snapCab = await getDocs(qCab);
        if (!snapCab.empty) {
          const cabDoc = snapCab.docs[0];
          const cabRef = doc(db, 'fleet', cabDoc.id);
          const updatePayload: Record<string, any> = {};
          if (resolvedSlot === 'second') {
            updatePayload.secondDriverName = name.trim();
            updatePayload.secondDriverPhone = phoneNumber.trim();
            updatePayload.secondDriverShift = 'night_12h';
          } else {
            updatePayload.firstDriverName = name.trim();
            updatePayload.firstDriverPhone = phoneNumber.trim();
            updatePayload.firstDriverShift = 'morning_12h';
            if (!cabDoc.data()?.driverName) {
              updatePayload.driverName = name.trim();
              updatePayload.driverPhone = phoneNumber.trim();
            }
          }
          if (cleanSite) {
            updatePayload.site = cleanSite;
          }
          await setDoc(cabRef, sanitizeFirestoreData(updatePayload), { merge: true });
        }
      } catch (linkErr) {
        console.warn('Fleet cab linkage error:', linkErr);
      }
    }

    return {
      uid: targetUid,
      userProfile: userProfileData,
    };
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch (e) {
      console.warn('Error deleting secondary Firebase app instance:', e);
    }
  }
}

/**
 * Updates an existing user's details and login credentials in Firestore
 */
export async function updateUserAccount(
  uid: string,
  updatedFields: {
    name?: string;
    email?: string;
    phoneNumber?: string;
    password?: string;
    role?: UserRole;
    site?: string;
    cabNumber?: string;
    shift?: DriverShiftType;
    driverSlot?: DriverSlotType;
  }
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const cleanPayload: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (updatedFields.name !== undefined && updatedFields.name.trim()) {
    cleanPayload.name = updatedFields.name.trim();
  }
  if (updatedFields.email !== undefined && updatedFields.email.trim()) {
    cleanPayload.email = updatedFields.email.trim().toLowerCase();
  }
  if (updatedFields.phoneNumber !== undefined && updatedFields.phoneNumber.trim()) {
    cleanPayload.phoneNumber = updatedFields.phoneNumber.trim();
  }
  if (updatedFields.password !== undefined && updatedFields.password.trim()) {
    cleanPayload.temporaryPassword = updatedFields.password.trim();
  }
  if (updatedFields.role !== undefined) {
    cleanPayload.role = updatedFields.role;
  }
  if (updatedFields.site !== undefined && updatedFields.site.trim()) {
    cleanPayload.site = updatedFields.site.trim();
  }
  if (updatedFields.cabNumber !== undefined && updatedFields.cabNumber.trim()) {
    cleanPayload.cabNumber = updatedFields.cabNumber.trim().toUpperCase().replace(/\s+/g, '');
  }
  if (updatedFields.shift !== undefined) {
    cleanPayload.shift = updatedFields.shift;
  }
  if (updatedFields.driverSlot !== undefined) {
    cleanPayload.driverSlot = updatedFields.driverSlot;
  }

  await updateDoc(userRef, sanitizeFirestoreData(cleanPayload));

  // If cabNumber was provided or changed for a driver, optionally link to fleet
  if (updatedFields.cabNumber && cleanPayload.cabNumber) {
    try {
      const qCab = query(collection(db, 'fleet'), where('cabNumber', '==', cleanPayload.cabNumber));
      const snapCab = await getDocs(qCab);
      if (!snapCab.empty) {
        const cabDoc = snapCab.docs[0];
        const cabRef = doc(db, 'fleet', cabDoc.id);
        const cabUpdate: Record<string, any> = {};
        if (updatedFields.name) {
          cabUpdate.driverName = updatedFields.name.trim();
        }
        if (updatedFields.phoneNumber) {
          cabUpdate.driverPhone = updatedFields.phoneNumber.trim();
        }
        if (updatedFields.site) {
          cabUpdate.site = updatedFields.site.trim();
        }
        await updateDoc(cabRef, sanitizeFirestoreData(cabUpdate));
      }
    } catch (cabErr) {
      console.warn('Fleet update note:', cabErr);
    }
  }
}

/**
 * Deletes a user account from Firestore
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await deleteDoc(userRef);
}

/**
 * Generate a secure, readable temporary password
 */
export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  let pass = '';
  // Ensure at least 1 uppercase, 1 lowercase, 1 number, 1 special symbol
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%&*';

  pass += uppers[Math.floor(Math.random() * uppers.length)];
  pass += lowers[Math.floor(Math.random() * lowers.length)];
  pass += digits[Math.floor(Math.random() * digits.length)];
  pass += specials[Math.floor(Math.random() * specials.length)];

  for (let i = 0; i < 6; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }

  // Shuffle string
  return pass
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('');
}
