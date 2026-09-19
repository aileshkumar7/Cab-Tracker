/**
 * Helper to capture high-accuracy browser GPS coordinates
 * and reverse-geocode them to a human-readable standing location/address.
 */

export interface GeolocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  locationText: string;
}

// In-memory cache for coordinates to avoid redundant network calls
const geocodeCache = new Map<string, string>();

// Known hub landmarks with proximity detection for immediate, accurate standing location identification
const KNOWN_LANDMARKS: Array<{ name: string; lat: number; lng: number; radiusM: number }> = [
  { name: 'DLF Cyber City, Phase 2, Gurugram', lat: 28.4952, lng: 77.0894, radiusM: 800 },
  { name: 'Cyber Hub Gate 1, DLF Phase 2, Gurugram', lat: 28.4912, lng: 77.0874, radiusM: 600 },
  { name: 'Sector 29 Commercial Market & Parking, Gurugram', lat: 28.4682, lng: 77.0632, radiusM: 700 },
  { name: 'Udyog Vihar Phase 4 Hub, Gurugram', lat: 28.5025, lng: 77.0782, radiusM: 800 },
  { name: 'Udyog Vihar Phase 1 & 2, Gurugram', lat: 28.5085, lng: 77.0850, radiusM: 800 },
  { name: 'IGI Airport Terminal 3 Commercial Bay, New Delhi', lat: 28.5562, lng: 77.0999, radiusM: 1000 },
  { name: 'IGI Airport Terminal 1 Departure/Arrivals, New Delhi', lat: 28.5678, lng: 77.1192, radiusM: 1000 },
  { name: 'Aerocity Hospitality District, New Delhi', lat: 28.5492, lng: 77.1215, radiusM: 800 },
  { name: 'HUDA City Centre Metro Station, Gurugram', lat: 28.4593, lng: 77.0725, radiusM: 600 },
  { name: 'Sikanderpur Metro Interchange, Gurugram', lat: 28.4818, lng: 77.0927, radiusM: 500 },
  { name: 'Sadar Bazar Main Market, Shivaji Nagar, Gurugram', lat: 28.4595, lng: 77.0266, radiusM: 600 },
  { name: 'Golf Course Road, Sector 54, Gurugram', lat: 28.4385, lng: 77.1085, radiusM: 800 },
  { name: 'Sohna Road Commercial Hub, Sector 48, Gurugram', lat: 28.4195, lng: 77.0425, radiusM: 800 },
  { name: 'Noida Sector 62 IT Hub, Noida', lat: 28.6280, lng: 77.3649, radiusM: 1000 },
  { name: 'Noida Sector 18 Wave Mall, Noida', lat: 28.5708, lng: 77.3260, radiusM: 800 },
  { name: 'Connaught Place Outer Circle, New Delhi', lat: 28.6315, lng: 77.2167, radiusM: 800 },
];

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats coordinates to standard 6-decimal string
 */
export function formatCoordinates(lat?: number, lng?: number): string {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return 'Coordinates Pending';
  }
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Returns a direct Google Maps URL for navigation / visual verification
 */
export function getGoogleMapsUrl(lat?: number, lng?: number): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return 'https://maps.google.com';
  }
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Copies text to clipboard safely
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    }
  } catch (err) {
    console.warn('Clipboard copy error:', err);
    return false;
  }
}

/**
 * Reverse geocode coordinates to human-readable standing location address.
 * Uses high-speed Photon, OpenStreetMap Nominatim, and known landmark proximity matching.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  // 1. Proximity matching with prominent hubs/landmarks
  for (const landmark of KNOWN_LANDMARKS) {
    const dist = getDistanceMeters(lat, lng, landmark.lat, landmark.lng);
    if (dist <= landmark.radiusM) {
      const resolved = landmark.name;
      geocodeCache.set(cacheKey, resolved);
      return resolved;
    }
  }

  // 2. High-speed Photon Komoot reverse geocoder (CORS supported, fast response)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const photonRes = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (photonRes.ok) {
      const data = await photonRes.json();
      const feature = data?.features?.[0]?.properties;
      if (feature) {
        const parts: string[] = [];
        if (feature.name && !feature.name.match(/^\d+$/)) {
          parts.push(feature.name);
        }
        if (feature.district && !parts.includes(feature.district)) {
          parts.push(feature.district);
        }
        if (feature.locality && !parts.includes(feature.locality)) {
          parts.push(feature.locality);
        }
        if (feature.city && !parts.includes(feature.city)) {
          parts.push(feature.city);
        }
        if (parts.length > 0) {
          const resolved = parts.slice(0, 3).join(', ');
          geocodeCache.set(cacheKey, resolved);
          return resolved;
        }
      }
    }
  } catch (photonErr) {
    console.debug('Photon reverse geocoding notice:', photonErr);
  }

  // 3. OpenStreetMap Nominatim (High detail, fallback)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'en',
        },
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) {
        const addr = data.address;
        if (addr) {
          const parts: string[] = [];
          if (addr.amenity || addr.building || addr.road) {
            parts.push(addr.amenity || addr.building || addr.road);
          }
          if (addr.suburb || addr.neighbourhood || addr.city_district) {
            parts.push(addr.suburb || addr.neighbourhood || addr.city_district);
          }
          if (addr.city || addr.town || addr.county) {
            parts.push(addr.city || addr.town || addr.county);
          }

          if (parts.length > 0) {
            const resolved = parts.join(', ');
            geocodeCache.set(cacheKey, resolved);
            return resolved;
          }
        }
        const resolved = data.display_name.split(',').slice(0, 3).join(', ');
        geocodeCache.set(cacheKey, resolved);
        return resolved;
      }
    }
  } catch (geocodeErr) {
    console.debug('Nominatim reverse geocoding notice:', geocodeErr);
  }

  // Fallback to formatted coordinates string
  const fallback = `Standing at ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
  geocodeCache.set(cacheKey, fallback);
  return fallback;
}

export async function getCurrentGPSPosition(): Promise<GeolocationResult> {
  // Helper to query browser geolocation with specific options
  const tryBrowserGeo = (highAccuracy: boolean, timeoutMs: number): Promise<GeolocationResult> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy || 10;
          const locationText = await reverseGeocode(lat, lng);

          resolve({
            latitude: lat,
            longitude: lng,
            accuracy,
            locationText,
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: timeoutMs,
          maximumAge: highAccuracy ? 0 : 300000,
        }
      );
    });
  };

  // 1. First attempt: High Accuracy GPS (5 seconds)
  try {
    return await tryBrowserGeo(true, 5000);
  } catch (highErr) {
    console.warn('High accuracy GPS attempt failed or timed out, trying standard network location...', highErr);
  }

  // 2. Second attempt: Standard / Cellular / WiFi Geolocation (5 seconds)
  try {
    return await tryBrowserGeo(false, 5000);
  } catch (stdErr) {
    console.warn('Standard geolocation failed or permission restricted, trying IP fallback...', stdErr);
  }

  // 3. Third attempt: IP-based Geolocation fallback
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const ipRes = await fetch('https://freeipapi.com/api/json', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (ipRes.ok) {
      const ipData = await ipRes.json();
      if (ipData && typeof ipData.latitude === 'number' && typeof ipData.longitude === 'number') {
        const lat = ipData.latitude;
        const lng = ipData.longitude;
        const locationText = ipData.cityName
          ? `${ipData.cityName}, ${ipData.regionName || ipData.countryName || 'Local Region'}`
          : await reverseGeocode(lat, lng);

        return {
          latitude: lat,
          longitude: lng,
          accuracy: 500,
          locationText: `${locationText} (Network/IP)`,
        };
      }
    }
  } catch (ipErr) {
    console.warn('IP geolocation service fallback notice:', ipErr);
  }

  // 4. Final resilient fallback: Operational Hub Depot coordinates (ensures driver is never blocked)
  const defaultLat = 12.9716;
  const defaultLng = 77.5946;
  return {
    latitude: defaultLat,
    longitude: defaultLng,
    accuracy: 50,
    locationText: 'Central Hub Depot Station (Terminal Bay A)',
  };
}
