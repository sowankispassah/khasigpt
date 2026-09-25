const EARTH_RADIUS_KM = 6_371.0088;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function getRadiusBoundingBox(
  center: { latitude: number; longitude: number },
  radiusKm: number,
) {
  const latitudeDelta = radiusKm / 110.574;
  const longitudeScale = Math.max(
    0.01,
    111.32 * Math.cos(toRadians(center.latitude)),
  );
  const longitudeDelta = radiusKm / longitudeScale;

  return {
    low: {
      latitude: Math.max(-90, center.latitude - latitudeDelta),
      longitude: Math.max(-180, center.longitude - longitudeDelta),
    },
    high: {
      latitude: Math.min(90, center.latitude + latitudeDelta),
      longitude: Math.min(180, center.longitude + longitudeDelta),
    },
  };
}

export function formatDistanceKm(distanceKm: number) {
  return distanceKm < 1
    ? `${Math.max(10, Math.round((distanceKm * 1_000) / 10) * 10)} m away`
    : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km away`;
}

export function isInsideMeghalaya({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  // Broad guardrail around Meghalaya. The geocoder's administrative-area
  // result remains authoritative; this only rejects clearly unrelated points.
  return latitude >= 24.9 && latitude <= 26.2 && longitude >= 89.75 && longitude <= 92.85;
}
