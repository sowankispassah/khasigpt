export const LOCATION_ACCURACY_ERROR = "location_accuracy_insufficient";
export const LOCATION_ACCURACY_COPY = "Your device returned a very approximate location. We couldn't confirm your current area. Try again or enter your location manually.";
export const LOCATION_UNCONFIRMED_COPY = "We couldn't confirm your current area.";

export type CurrentLocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export class LocationResolutionError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

// Retry only a rejected coarse estimate, once. Permission and service failures
// stay separate and must not cause repeated requests or a guessed location.
export async function acquireCurrentLocation<T>(
  getPosition: () => Promise<CurrentLocationCoordinates>,
  resolve: (position: CurrentLocationCoordinates) => Promise<T>,
  isApproximateFailure: (error: unknown) => boolean,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const position = await getPosition();
    try { return await resolve(position); } catch (error) {
      if (attempt > 0 || !isApproximateFailure(error)) throw error;
    }
  }
}
