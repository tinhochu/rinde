import * as Location from "expo-location";
import type { LatLon } from "./route";

/**
 * The person's location for this plan only, rounded to ~100 m before it leaves the phone. Null when
 * they say no or the phone can't tell; everything works without it.
 */
export async function roughLocation(): Promise<LatLon | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return [Math.round(coords.latitude * 1000) / 1000, Math.round(coords.longitude * 1000) / 1000];
  } catch {
    return null;
  }
}
