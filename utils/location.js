
export const STORES = [
  {
    name: "Aurangabad",
    latitude: 19.877505,
    longitude: 75.372084,
  },
  {
    name: "Bhubaneswar",
    latitude: 20.281865,
    longitude: 85.844351,
  },
  {
    name: "Guwahati",
    latitude: 26.173189,
    longitude: 91.760528,
  },
  {
    name: "Kolkata Diamond Plaza",
    latitude: 22.615512,
    longitude: 88.412296,
  },
  {
    name: "Kolkata Bhawanipore",
    latitude: 22.536275,
    longitude: 88.346016,
  },
  {
    name: "Lucknow",
    latitude: 26.872824,
    longitude: 81.002094,
  },
  {
    name: "Nagpur",
    latitude: 21.138178,
    longitude: 79.078813,
  },
  {
    name: "Nashik",
    latitude: 19.990630,
    longitude: 73.762138,
  },
  {
    name: "Patna",
    latitude: 25.612423,
    longitude: 85.056307,
  },
  {
    name: "Pune",
    latitude: 18.519592,
    longitude: 73.929693,
  },
  {
    name: "Raipur",
    latitude: 21.238356,
    longitude: 81.679026,
  },
  {
    name: "Siliguri",
    latitude: 26.728275,
    longitude: 88.431698,
  },
  {
    name: "Visakhapatnam",
    latitude: 17.734062,
    longitude: 83.318297,
  },
  {
    name: "Mumbai Head Office, Jogeshwari",
    latitude: 19.137031,
    longitude: 72.862710,
  },
];

// Maximum permitted distance in metres
export const MAX_DISTANCE = 500;

// Calculate straight-line distance between two GPS points
export const calculateDistance = (
  lat1,
  lon1,
  lat2,
  lon2
) => {
  const R = 6371e3;

  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;

  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
};

export const MOCK_LOCATION_MESSAGE =
  "Fake location detected. Turn off any mock/fake GPS app to mark attendance.";

// True when the OS reports the fix as coming from a mock-location provider.
// expo-location sets `mocked` on Android only; on iOS it is always undefined.
export const isMockLocation = (location) => location?.mocked === true;

// Check whether the employee is within 500 metres
// of at least one configured store.
export const checkStoreLocation = (
  latitude,
  longitude
) => {
  // Reject missing or invalid coordinates
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      allowed: false,
      store: null,
      distance: null,
      message: "Unable to verify your location.",
    };
  }

  let nearestStore = null;
  let nearestDistance = Infinity;

  for (const store of STORES) {
    const distance = calculateDistance(
      latitude,
      longitude,
      store.latitude,
      store.longitude
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStore = store;
    }
  }

  const allowed = nearestDistance <= MAX_DISTANCE;
  const distance = Math.round(nearestDistance);

  return {
    allowed,
    store: nearestStore,
    distance,
    message: allowed
      ? `Location verified near ${nearestStore.name}.`
      : `You are ${distance} metres from the nearest store. You must be within ${MAX_DISTANCE} metres to check in.`,
  };
};
