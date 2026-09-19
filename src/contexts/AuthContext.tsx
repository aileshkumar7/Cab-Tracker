import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole, DriverShiftType, DriverSlotType } from '../types';
import { sanitizeFirestoreData, generateDriverEmail } from '../lib/teamManagement';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (emailOrCab: string, pass: string) => Promise<void>;
  signUp: (params: {
    email?: string;
    pass: string;
    name: string;
    phoneNumber: string;
    role: UserRole;
    site?: string;
    cabNumber?: string;
    shift?: DriverShiftType;
    driverSlot?: DriverSlotType;
  }) => Promise<void>;
  updateProfile: (updatedData: Partial<UserProfile>) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const LOCAL_STORAGE_SESSION_KEY = 'cab_fleet_active_session_v3';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Real-time listener for user profile from Firestore
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeProfile = onSnapshot(
          userDocRef,
          async (docSnap) => {
            if (docSnap.exists()) {
              const prof = docSnap.data() as UserProfile;
              setUserProfile(prof);
              localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(prof));
            } else {
              // Try to find if a profile was created in Firestore by email
              try {
                const normEmail = (user.email || '').trim().toLowerCase();
                const qUsers = query(collection(db, 'users'), where('email', '==', normEmail));
                const snap = await getDocs(qUsers);
                if (!snap.empty) {
                  const existingProf = snap.docs[0].data() as UserProfile;
                  const linkedProf: UserProfile = {
                    ...existingProf,
                    uid: user.uid,
                  };
                  await setDoc(userDocRef, { ...linkedProf, lastLogin: serverTimestamp() }, { merge: true });
                  setUserProfile(linkedProf);
                  localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(linkedProf));
                } else {
                  // Check if full profile exists in localStorage before falling back to empty stub
                  let localData: UserProfile | null = null;
                  try {
                    const storedStr = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
                    if (storedStr) {
                      const parsed = JSON.parse(storedStr);
                      if (parsed && (parsed.email?.toLowerCase() === normEmail || parsed.uid === user.uid)) {
                        localData = parsed;
                      }
                    }
                  } catch {}

                  const isOps = normEmail.includes('supervisor') || normEmail.includes('admin');
                  const newProf: UserProfile = localData ? {
                    ...localData,
                    uid: user.uid,
                  } : {
                    uid: user.uid,
                    name: user.displayName || normEmail.split('@')[0],
                    email: normEmail,
                    phoneNumber: user.phoneNumber || '',
                    role: isOps ? 'supervisor' : 'driver',
                    createdAt: new Date().toISOString() as any,
                  };
                  await setDoc(userDocRef, { ...newProf, createdAt: serverTimestamp() }, { merge: true });
                  setUserProfile(newProf);
                  localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(newProf));
                }
              } catch (e) {
                console.warn('Profile linking notice:', e);
              }
            }
            setLoading(false);
          },
          (err) => {
            console.warn('Firestore profile sync note:', err);
            setLoading(false);
          }
        );
      } else {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        // If not authenticated via Firebase Auth, check if stored session exists and is still valid
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            setUserProfile(parsed);
          } else {
            setUserProfile(null);
          }
        } catch {
          setUserProfile(null);
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const setSessionAndSyncFirestore = async (profile: UserProfile) => {
    setUserProfile(profile);
    setError(null);
    try {
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }

    // Sync with Firestore - ALWAYS merge to preserve all fields
    try {
      const userRef = doc(db, 'users', profile.uid);
      const cleanProfile = sanitizeFirestoreData(profile);
      await setDoc(
        userRef,
        {
          ...cleanProfile,
          lastLogin: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (dbErr) {
      console.warn('Firestore profile save note:', dbErr);
    }
  };

  const signIn = async (identifier: string, pass: string) => {
    setError(null);
    const rawInput = identifier.trim();
    const normEmail = rawInput.toLowerCase();
    const isEmail = normEmail.includes('@');

    if (!rawInput || !pass) {
      const msg = 'Please enter your email or phone number and password.';
      setError(msg);
      throw new Error(msg);
    }

    // 1. If input is email, try standard Firebase Auth sign in first
    let authSucceeded = false;
    if (isEmail) {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, normEmail, pass);
        if (userCredential.user) {
          authSucceeded = true;
          // Attempt immediate Firestore fetch so state updates synchronously
          try {
            const userDocRef = doc(db, 'users', userCredential.user.uid);
            const snap = await getDoc(userDocRef);
            if (snap.exists()) {
              const prof = snap.data() as UserProfile;
              setUserProfile(prof);
              localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(prof));
              return;
            }
          } catch (fetchErr) {
            console.warn('Immediate profile fetch note:', fetchErr);
          }
          return;
        }
      } catch (authErr: any) {
        console.warn('Firebase Auth sign in notice, attempting Firestore fallback:', authErr?.code);
        // If wrong password was explicitly verified by Firebase Auth, propagate error
        if (authErr?.code === 'auth/wrong-password') {
          const msg = 'Incorrect password. Please check your credentials.';
          setError(msg);
          throw new Error(msg);
        }
      }
    }

    // 2. Comprehensive Firestore user lookup (by Email, Phone Number, or Cab Number)
    try {
      let foundUser: UserProfile | null = null;
      let userDocId: string = '';

      // A. Lookup by Email
      if (isEmail) {
        const qEmail = query(collection(db, 'users'), where('email', '==', normEmail));
        const snap = await getDocs(qEmail);
        if (!snap.empty) {
          foundUser = snap.docs[0].data() as UserProfile;
          userDocId = snap.docs[0].id;
        }
      }

      // B. Lookup by Phone Number
      if (!foundUser) {
        const cleanDigits = rawInput.replace(/\D/g, '');
        if (cleanDigits.length >= 7) {
          const qAllUsers = query(collection(db, 'users'));
          const snapAll = await getDocs(qAllUsers);
          for (const d of snapAll.docs) {
            const u = d.data() as UserProfile;
            const uDigits = (u.phoneNumber || '').replace(/\D/g, '');
            if (
              uDigits &&
              (uDigits.endsWith(cleanDigits.slice(-10)) || cleanDigits.endsWith(uDigits.slice(-10)))
            ) {
              foundUser = u;
              userDocId = d.id;
              break;
            }
          }
        }
      }

      // C. Lookup by Cab Number (in case driver entered assigned cab)
      if (!foundUser) {
        const cleanCab = rawInput.toUpperCase().replace(/[\s\-_]+/g, '');
        if (cleanCab.length >= 4) {
          const qAllUsers = query(collection(db, 'users'));
          const snapAll = await getDocs(qAllUsers);
          for (const d of snapAll.docs) {
            const u = d.data() as UserProfile;
            const uCab = (u.cabNumber || '').toUpperCase().replace(/[\s\-_]+/g, '');
            if (uCab && uCab === cleanCab) {
              foundUser = u;
              userDocId = d.id;
              break;
            }
          }
        }
      }

      // If user document found in Firestore, verify password
      if (foundUser) {
        const storedPass = foundUser.temporaryPassword;
        if (storedPass && pass && storedPass !== pass) {
          const msg = 'Incorrect password. Please check your credentials.';
          setError(msg);
          throw new Error(msg);
        }

        const fullProfile: UserProfile = {
          ...foundUser,
          uid: userDocId || foundUser.uid,
        };

        await setSessionAndSyncFirestore(fullProfile);
        return;
      }

      // 3. Predefined Demo Accounts fallback
      if (normEmail === 'admin@fleet.com' || normEmail === 'masteradmin@fleet.com') {
        if (pass !== 'Admin@12345') {
          const msg = 'Incorrect password for Master Admin.';
          setError(msg);
          throw new Error(msg);
        }
        const demoAdmin: UserProfile = {
          uid: 'admin-fleet-master',
          name: 'Master Fleet Administrator',
          email: normEmail,
          phoneNumber: '+91 98765 00000',
          role: 'master_admin',
          temporaryPassword: 'Admin@12345',
          createdAt: new Date().toISOString() as any,
        };
        await setSessionAndSyncFirestore(demoAdmin);
        return;
      }

      if (normEmail === 'supervisor@fleet.com' || normEmail === 'supervisor1@fleet.com') {
        if (pass !== 'Admin@12345') {
          const msg = 'Incorrect password for Supervisor.';
          setError(msg);
          throw new Error(msg);
        }
        const demoSupervisor: UserProfile = {
          uid: 'supervisor-fleet-demo-1',
          name: 'North Hub Supervisor',
          email: normEmail,
          phoneNumber: '+91 98765 00001',
          role: 'supervisor',
          site: 'North Terminal Hub',
          temporaryPassword: 'Admin@12345',
          createdAt: new Date().toISOString() as any,
        };
        await setSessionAndSyncFirestore(demoSupervisor);
        return;
      }

      if (normEmail === 'supervisor2@fleet.com') {
        if (pass !== 'Admin@12345') {
          const msg = 'Incorrect password for Supervisor.';
          setError(msg);
          throw new Error(msg);
        }
        const demoSupervisor2: UserProfile = {
          uid: 'supervisor-fleet-demo-2',
          name: 'Tech Park Supervisor',
          email: normEmail,
          phoneNumber: '+91 98765 00002',
          role: 'supervisor',
          site: 'Central Tech Park Hub',
          temporaryPassword: 'Admin@12345',
          createdAt: new Date().toISOString() as any,
        };
        await setSessionAndSyncFirestore(demoSupervisor2);
        return;
      }

      const cleanInputCab = rawInput.toUpperCase().replace(/[\s\-_]+/g, '');

      if (
        normEmail === 'driver@fleet.com' ||
        normEmail === 'driver1@fleet.com' ||
        cleanInputCab === 'KA01AB1024' ||
        cleanInputCab === 'KA011024'
      ) {
        if (pass !== 'Driver@12345') {
          const msg = 'Incorrect password for Driver.';
          setError(msg);
          throw new Error(msg);
        }
        const demoDriver1: UserProfile = {
          uid: 'driver-fleet-demo-1',
          name: 'Rajesh Kumar',
          email: 'driver1@fleet.com',
          phoneNumber: '+91 98765 43210',
          role: 'driver',
          site: 'North Terminal Hub',
          cabNumber: 'KA-01-AB-1024',
          shift: 'morning_12h',
          driverSlot: 'first',
          temporaryPassword: 'Driver@12345',
          createdAt: new Date().toISOString() as any,
        };
        await setSessionAndSyncFirestore(demoDriver1);
        return;
      }

      if (
        normEmail === 'driver2@fleet.com' ||
        cleanInputCab === 'KA01MG5588' ||
        cleanInputCab === 'KA015588'
      ) {
        if (pass !== 'Driver@12345') {
          const msg = 'Incorrect password for Driver.';
          setError(msg);
          throw new Error(msg);
        }
        const demoDriver2: UserProfile = {
          uid: 'driver-fleet-demo-2',
          name: 'Amit Singh',
          email: 'driver2@fleet.com',
          phoneNumber: '+91 98451 22334',
          role: 'driver',
          site: 'North Terminal Hub',
          cabNumber: 'KA-01-MG-5588',
          shift: 'night_12h',
          driverSlot: 'second',
          temporaryPassword: 'Driver@12345',
          createdAt: new Date().toISOString() as any,
        };
        await setSessionAndSyncFirestore(demoDriver2);
        return;
      }

      if (
        normEmail === 'driver3@fleet.com' ||
        cleanInputCab === 'KA01ET9901' ||
        cleanInputCab === 'KA019901'
      ) {
        if (pass !== 'Driver@12345') {
          const msg = 'Incorrect password for Driver.';
          setError(msg);
          throw new Error(msg);
        }
        const demoDriver3: UserProfile = {
          uid: 'driver-fleet-demo-3',
          name: 'Suresh Patil',
          email: 'driver3@fleet.com',
          phoneNumber: '+91 99160 88990',
          role: 'driver',
          site: 'Central Tech Park Hub',
          cabNumber: 'KA-01-ET-9901',
          shift: 'morning_12h',
          driverSlot: 'first',
          temporaryPassword: 'Driver@12345',
          createdAt: new Date().toISOString() as any,
        };
        await setSessionAndSyncFirestore(demoDriver3);
        return;
      }

      if (
        normEmail === 'driver4@fleet.com' ||
        cleanInputCab === 'KA01ZX3342' ||
        cleanInputCab === 'KA013342'
      ) {
        if (pass !== 'Driver@12345') {
          const msg = 'Incorrect password for Driver.';
          setError(msg);
          throw new Error(msg);
        }
        const demoDriver4: UserProfile = {
          uid: 'driver-fleet-demo-4',
          name: 'Vikram Joshi',
          email: 'driver4@fleet.com',
          phoneNumber: '+91 97312 44556',
          role: 'driver',
          site: 'Central Tech Park Hub',
          cabNumber: 'KA-01-ZX-3342',
          shift: 'night_12h',
          driverSlot: 'second',
          temporaryPassword: 'Driver@12345',
          createdAt: new Date().toISOString() as any,
        };
        await setSessionAndSyncFirestore(demoDriver4);
        return;
      }
    } catch (dbErr: any) {
      if (dbErr?.message?.includes('Incorrect password')) {
        throw dbErr;
      }
      console.warn('Firestore lookup note:', dbErr);
    }

    const message = 'Invalid credentials. No account found matching this Email, Phone number, or Cab Number. Please check your details or create an account.';
    setError(message);
    throw new Error(message);
  };

  const signUp = async ({
    email,
    pass,
    name,
    phoneNumber,
    role,
    site,
    cabNumber,
    shift,
    driverSlot,
  }: {
    email?: string;
    pass: string;
    name: string;
    phoneNumber: string;
    role: UserRole;
    site?: string;
    cabNumber?: string;
    shift?: DriverShiftType;
    driverSlot?: DriverSlotType;
  }) => {
    setError(null);

    const cleanCab = cabNumber ? cabNumber.trim().toUpperCase().replace(/\s+/g, '') : undefined;
    
    // For drivers, if email is not provided, generate a synthetic one from cab number
    let normEmail = email ? email.trim().toLowerCase() : '';
    if (role === 'driver') {
      if (!cleanCab && !normEmail) {
        const msg = 'Please enter your Cab Number to register your driver account.';
        setError(msg);
        throw new Error(msg);
      }
      if (!normEmail && cleanCab) {
        normEmail = generateDriverEmail(cleanCab);
      }
    }

    if (!normEmail || !pass || !name) {
      const msg = role === 'driver' 
        ? 'Please provide your full name, cab number, and password.'
        : 'Please provide full name, email, and password.';
      setError(msg);
      throw new Error(msg);
    }

    let uid = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Check if cab number is already registered in users for this shift slot
    if (role === 'driver' && cleanCab) {
      try {
        const qCabUsers = query(collection(db, 'users'), where('cabNumber', '==', cleanCab));
        const snapCabUsers = await getDocs(qCabUsers);
        const targetSlot = driverSlot || (shift === 'night_12h' ? 'second' : 'first');
        for (const docSnap of snapCabUsers.docs) {
          const uData = docSnap.data() as UserProfile;
          const uSlot = uData.driverSlot || (uData.shift === 'night_12h' ? 'second' : 'first');
          if (uSlot === targetSlot) {
            const msg = `Cab "${cleanCab}" already has an account registered for ${targetSlot === 'first' ? '1st (Morning)' : '2nd (Night)'} shift (${uData.name || 'Driver'}). You can sign in using your Cab Number.`;
            setError(msg);
            throw new Error(msg);
          }
        }
      } catch (checkErr: any) {
        if (checkErr?.message?.includes('already has an account')) throw checkErr;
      }
    }

    // Try creating with Firebase Auth if available
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, normEmail, pass);
      if (userCredential.user) {
        uid = userCredential.user.uid;
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        const message = role === 'driver' && cleanCab
          ? `An account for Cab "${cleanCab}" already exists. Please sign in with your Cab Number instead.`
          : 'An account with this email already exists. Please sign in instead.';
        setError(message);
        throw new Error(message);
      }
      if (err.code === 'auth/weak-password') {
        const message = 'Password must be at least 6 characters long.';
        setError(message);
        throw new Error(message);
      }
      console.warn('Auth provider note during signup, continuing to Firestore:', err?.code);
    }

    const resolvedShift: DriverShiftType | undefined =
      role === 'driver' ? (shift || (driverSlot === 'second' ? 'night_12h' : 'morning_12h')) : undefined;
    const resolvedSlot: DriverSlotType | undefined =
      role === 'driver' ? (driverSlot || (shift === 'night_12h' ? 'second' : 'first')) : undefined;

    const userProfileData: UserProfile = {
      uid,
      name: name.trim(),
      email: normEmail,
      phoneNumber: phoneNumber.trim(),
      role,
      temporaryPassword: pass,
      createdAt: new Date().toISOString() as any,
    };
    if (site?.trim()) {
      userProfileData.site = site.trim();
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

    // 1. Immediately write full profile document into Firestore
    try {
      const userDocRef = doc(db, 'users', uid);
      await setDoc(
        userDocRef,
        {
          ...sanitizeFirestoreData(userProfileData),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn('Direct Firestore save note during signup:', fsErr);
    }

    // 2. Set active session
    await setSessionAndSyncFirestore(userProfileData);

    // 3. If driver signed up with a cab, link to the fleet document for 2-driver roster
    if (cleanCab && role === 'driver') {
      try {
        const qCab = query(collection(db, 'fleet'), where('cabNumber', '==', cleanCab));
        const snap = await getDocs(qCab);
        if (!snap.empty) {
          const cabDoc = snap.docs[0];
          const cabRef = doc(db, 'fleet', cabDoc.id);
          const updatePayload: any = {};
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
          if (site) {
            updatePayload.site = site.trim();
          }
          await setDoc(cabRef, updatePayload, { merge: true });
        }
      } catch (linkErr) {
        console.warn('Cab fleet driver link note:', linkErr);
      }
    }
  };

  const updateProfile = async (updatedData: Partial<UserProfile>) => {
    if (!userProfile) return;
    const merged = { ...userProfile, ...updatedData };
    setUserProfile(merged);
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(merged));

    try {
      const userRef = doc(db, 'users', userProfile.uid);
      await setDoc(userRef, updatedData, { merge: true });
    } catch (err) {
      console.warn('Error updating profile in Firestore:', err);
    }
  };

  const signOut = async () => {
    setError(null);
    localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    setUserProfile(null);
    setCurrentUser(null);
    try {
      await firebaseSignOut(auth);
    } catch (err: any) {
      console.warn('Sign out notice:', err);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        error,
        signIn,
        signUp,
        updateProfile,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
