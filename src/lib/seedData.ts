import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';

export async function seedInitialFleetData(supervisorName: string = 'Operations Team') {
  const fleetCol = collection(db, 'fleet');
  const dutiesCol = collection(db, 'duties');
  const notifsCol = collection(db, 'notifications');

  // Check if fleet already has data
  const existingFleet = await getDocs(fleetCol);
  if (!existingFleet.empty) {
    return { count: existingFleet.size, alreadySeeded: true };
  }

  // Sample fleet cabs matching exact requirements
  const sampleCabs = [
    {
      id: 'cab_ka01_1024',
      cabNumber: 'KA-01-AB-1024',
      driverName: 'Rajesh Kumar',
      driverPhone: '+91 98765 43210',
      vehicleType: 'Sedan (Toyota Etios)',
      baseHub: 'North Terminal Hub - Gate 3',
      status: 'reported_at_hub',
      currentLocationText: 'North Terminal Hub, Bay A2',
      currentLocationLat: 13.1986,
      currentLocationLng: 77.7066,
      lastUpdated: serverTimestamp(),
      assignedSupervisor: supervisorName,
    },
    {
      id: 'cab_ka01_5588',
      cabNumber: 'KA-01-MG-5588',
      driverName: 'Amit Singh',
      driverPhone: '+91 98451 22334',
      vehicleType: 'SUV (Innova Crysta)',
      baseHub: 'Central Tech Park Hub',
      status: 'on_duty',
      currentLocationText: 'En route to Airport Terminal 2',
      currentLocationLat: 13.1124,
      currentLocationLng: 77.6321,
      lastUpdated: serverTimestamp(),
      assignedSupervisor: supervisorName,
    },
    {
      id: 'cab_ka01_9901',
      cabNumber: 'KA-01-ET-9901',
      driverName: 'Suresh Patil',
      driverPhone: '+91 99160 88990',
      vehicleType: 'EV Sedan (Tata Tigor)',
      baseHub: 'South City Hub',
      status: 'cab_off_duty',
      currentLocationText: 'South City Hub, Charging Station 4',
      currentLocationLat: 12.8892,
      currentLocationLng: 77.5891,
      lastUpdated: serverTimestamp(),
      assignedSupervisor: supervisorName,
    },
    {
      id: 'cab_ka01_3342',
      cabNumber: 'KA-01-ZX-3342',
      driverName: 'Vikram Joshi',
      driverPhone: '+91 97312 44556',
      vehicleType: 'Premium Sedan (Honda City)',
      baseHub: 'Central Tech Park Hub',
      status: 'reported_at_hub',
      currentLocationText: 'Central Tech Park Hub, Parking Slot 14',
      currentLocationLat: 12.9716,
      currentLocationLng: 77.5946,
      lastUpdated: serverTimestamp(),
      assignedSupervisor: supervisorName,
    },
  ];

  for (const cab of sampleCabs) {
    const { id, ...cabData } = cab;
    await setDoc(doc(db, 'fleet', id), cabData);
  }

  // Sample duties matching exact schema
  const sampleDuties = [
    {
      id: 'duty_001',
      cabNumber: 'KA-01-MG-5588',
      driverName: 'Amit Singh',
      startLocationText: 'Central Tech Park Hub, Tower 4',
      startTime: serverTimestamp(),
      endLocationText: 'Airport Terminal 2',
      endTime: null,
      status: 'active',
      assignedBy: supervisorName,
    },
    {
      id: 'duty_002',
      cabNumber: 'KA-01-AB-1024',
      driverName: 'Rajesh Kumar',
      startLocationText: 'Electronic City Phase 1',
      startTime: serverTimestamp(),
      endLocationText: 'North Terminal Hub',
      endTime: serverTimestamp(),
      status: 'completed',
      assignedBy: supervisorName,
    },
  ];

  for (const duty of sampleDuties) {
    const { id, ...dutyData } = duty;
    await setDoc(doc(db, 'duties', id), dutyData);
  }

  // Sample notifications matching exact schema
  const sampleNotifications = [
    {
      id: 'notif_001',
      cabNumber: 'KA-01-AB-1024',
      type: 'reported_at_hub',
      locationText: 'North Terminal Hub - Gate 3',
      lat: 13.1986,
      lng: 77.7066,
      timestamp: serverTimestamp(),
      read: false,
    },
    {
      id: 'notif_002',
      cabNumber: 'KA-01-AB-1024',
      type: 'duty_completed',
      locationText: 'North Terminal Hub',
      lat: 13.1986,
      lng: 77.7066,
      timestamp: serverTimestamp(),
      read: true,
    },
  ];

  for (const notif of sampleNotifications) {
    const { id, ...notifData } = notif;
    await setDoc(doc(db, 'notifications', id), notifData);
  }

  // Seed historical location logs for billing reports across multiple days
  await seedLocationAuditLogs();

  return { count: sampleCabs.length, alreadySeeded: false };
}

/**
 * Seeds sample location logs across recent dates (Today, Yesterday, 2 days ago, 3 days ago)
 * for immediate testing of Date-wise Location & Cab Billing Reports.
 */
export async function seedLocationAuditLogs() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const sampleLogs = [
    // --- TODAY'S LOGS ---
    {
      id: 'log_today_01',
      cabNumber: 'KA-01-AB-1024',
      driverName: 'Rajesh Kumar',
      driverPhone: '+91 98765 43210',
      vehicleType: 'Sedan (Toyota Etios)',
      eventType: 'location_punch',
      locationText: 'North Terminal Hub - Gate 3, Kempegowda Intl Airport',
      lat: 13.1986,
      lng: 77.7066,
      dutyId: 'duty_today_101',
      speed: 0,
      notes: 'Morning shift start location punch',
      timestamp: new Date(now - 1000 * 60 * 45), // 45 mins ago
    },
    {
      id: 'log_today_02',
      cabNumber: 'KA-01-MG-5588',
      driverName: 'Amit Singh',
      driverPhone: '+91 98451 22334',
      vehicleType: 'SUV (Innova Crysta)',
      eventType: 'duty_started',
      locationText: 'Central Tech Park Hub, Tower 4',
      lat: 12.9716,
      lng: 77.5946,
      dutyId: 'duty_001',
      speed: 18,
      notes: 'Corporate airport drop pickup confirmed',
      timestamp: new Date(now - 1000 * 60 * 120), // 2 hours ago
    },
    {
      id: 'log_today_03',
      cabNumber: 'KA-01-MG-5588',
      driverName: 'Amit Singh',
      driverPhone: '+91 98451 22334',
      vehicleType: 'SUV (Innova Crysta)',
      eventType: 'location_punch',
      locationText: 'Hebbal Flyover Junction, Outer Ring Road',
      lat: 13.0358,
      lng: 77.597,
      dutyId: 'duty_001',
      speed: 42,
      notes: 'Mid-route checkpoint punch',
      timestamp: new Date(now - 1000 * 60 * 30), // 30 mins ago
    },
    {
      id: 'log_today_04',
      cabNumber: 'KA-01-ET-9901',
      driverName: 'Suresh Patil',
      driverPhone: '+91 99160 88990',
      vehicleType: 'EV Sedan (Tata Tigor)',
      eventType: 'reported_at_hub',
      locationText: 'South City Hub, Charging Station 4',
      lat: 12.8892,
      lng: 77.5891,
      dutyId: null,
      speed: 0,
      notes: 'Hub check-in for morning standby',
      timestamp: new Date(now - 1000 * 60 * 180), // 3 hours ago
    },

    // --- YESTERDAY'S LOGS ---
    {
      id: 'log_yest_01',
      cabNumber: 'KA-01-AB-1024',
      driverName: 'Rajesh Kumar',
      driverPhone: '+91 98765 43210',
      vehicleType: 'Sedan (Toyota Etios)',
      eventType: 'duty_started',
      locationText: 'Electronic City Phase 1, Gate 2',
      lat: 12.8452,
      lng: 77.6602,
      dutyId: 'duty_yest_001',
      speed: 0,
      notes: 'Client pickup started',
      timestamp: new Date(now - dayMs - 1000 * 60 * 60 * 8), // Yesterday 8 AM
    },
    {
      id: 'log_yest_02',
      cabNumber: 'KA-01-AB-1024',
      driverName: 'Rajesh Kumar',
      driverPhone: '+91 98765 43210',
      vehicleType: 'Sedan (Toyota Etios)',
      eventType: 'location_punch',
      locationText: 'Koramangala 5th Block, Sony World Signal',
      lat: 12.9352,
      lng: 77.6245,
      dutyId: 'duty_yest_001',
      speed: 24,
      notes: 'Traffic transit standing point',
      timestamp: new Date(now - dayMs - 1000 * 60 * 60 * 6), // Yesterday 10 AM
    },
    {
      id: 'log_yest_03',
      cabNumber: 'KA-01-AB-1024',
      driverName: 'Rajesh Kumar',
      driverPhone: '+91 98765 43210',
      vehicleType: 'Sedan (Toyota Etios)',
      eventType: 'duty_completed',
      locationText: 'Whitefield ITPL Main Gate',
      lat: 12.9854,
      lng: 77.7289,
      dutyId: 'duty_yest_001',
      speed: 0,
      notes: 'Trip drop completed safely. Final reading logged.',
      timestamp: new Date(now - dayMs - 1000 * 60 * 60 * 4), // Yesterday 12 PM
    },
    {
      id: 'log_yest_04',
      cabNumber: 'KA-01-ZX-3342',
      driverName: 'Vikram Joshi',
      driverPhone: '+91 97312 44556',
      vehicleType: 'Premium Sedan (Honda City)',
      eventType: 'location_punch',
      locationText: 'Central Tech Park Hub, Parking Slot 14',
      lat: 12.9716,
      lng: 77.5946,
      dutyId: 'duty_yest_002',
      speed: 0,
      notes: 'Standing location verified for afternoon run',
      timestamp: new Date(now - dayMs - 1000 * 60 * 60 * 3), // Yesterday 1 PM
    },
    {
      id: 'log_yest_05',
      cabNumber: 'KA-01-ZX-3342',
      driverName: 'Vikram Joshi',
      driverPhone: '+91 97312 44556',
      vehicleType: 'Premium Sedan (Honda City)',
      eventType: 'duty_completed',
      locationText: 'MG Road Metro Station Drop Gate',
      lat: 12.9756,
      lng: 77.6094,
      dutyId: 'duty_yest_002',
      speed: 0,
      notes: 'VIP drop completed',
      timestamp: new Date(now - dayMs - 1000 * 60 * 60 * 1), // Yesterday 3 PM
    },

    // --- 2 DAYS AGO LOGS ---
    {
      id: 'log_2d_01',
      cabNumber: 'KA-01-MG-5588',
      driverName: 'Amit Singh',
      driverPhone: '+91 98451 22334',
      vehicleType: 'SUV (Innova Crysta)',
      eventType: 'duty_started',
      locationText: 'Indiranagar 100ft Road Hub',
      lat: 12.9719,
      lng: 77.6412,
      dutyId: 'duty_2d_001',
      speed: 0,
      notes: 'Outstation trip started',
      timestamp: new Date(now - 2 * dayMs - 1000 * 60 * 60 * 9),
    },
    {
      id: 'log_2d_02',
      cabNumber: 'KA-01-MG-5588',
      driverName: 'Amit Singh',
      driverPhone: '+91 98451 22334',
      vehicleType: 'SUV (Innova Crysta)',
      eventType: 'location_punch',
      locationText: 'Mysore Highway Toll Plaza',
      lat: 12.7548,
      lng: 77.3421,
      dutyId: 'duty_2d_001',
      speed: 68,
      notes: 'Highway milestone punch',
      timestamp: new Date(now - 2 * dayMs - 1000 * 60 * 60 * 6),
    },
    {
      id: 'log_2d_03',
      cabNumber: 'KA-01-MG-5588',
      driverName: 'Amit Singh',
      driverPhone: '+91 98451 22334',
      vehicleType: 'SUV (Innova Crysta)',
      eventType: 'duty_completed',
      locationText: 'Indiranagar 100ft Road Hub',
      lat: 12.9719,
      lng: 77.6412,
      dutyId: 'duty_2d_001',
      speed: 0,
      notes: 'Outstation return duty complete',
      timestamp: new Date(now - 2 * dayMs - 1000 * 60 * 60 * 1),
    },

    // --- 3 DAYS AGO LOGS ---
    {
      id: 'log_3d_01',
      cabNumber: 'KA-01-ET-9901',
      driverName: 'Suresh Patil',
      driverPhone: '+91 99160 88990',
      vehicleType: 'EV Sedan (Tata Tigor)',
      eventType: 'duty_started',
      locationText: 'South City Hub, Jayanagar',
      lat: 12.9304,
      lng: 77.5838,
      dutyId: 'duty_3d_001',
      speed: 0,
      notes: 'Airport shift dispatch',
      timestamp: new Date(now - 3 * dayMs - 1000 * 60 * 60 * 7),
    },
    {
      id: 'log_3d_02',
      cabNumber: 'KA-01-ET-9901',
      driverName: 'Suresh Patil',
      driverPhone: '+91 99160 88990',
      vehicleType: 'EV Sedan (Tata Tigor)',
      eventType: 'duty_completed',
      locationText: 'Kempegowda Intl Airport, Departure Ramp 3',
      lat: 13.1989,
      lng: 77.7068,
      dutyId: 'duty_3d_001',
      speed: 0,
      notes: 'Passenger dropped at departure gate',
      timestamp: new Date(now - 3 * dayMs - 1000 * 60 * 60 * 4),
    },
  ];

  for (const log of sampleLogs) {
    const { id, ...logData } = log;
    await setDoc(doc(db, 'location_logs', id), logData, { merge: true });
  }

  return { count: sampleLogs.length };
}
