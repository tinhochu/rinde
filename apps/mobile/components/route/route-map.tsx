import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import type { LatLon, RouteGeometry, RouteStop } from "@/lib/route";
import { colors, fontSize, radius } from "@/lib/theme";

export interface RouteMapProps {
  route: RouteGeometry | null;
  stops: RouteStop[];
  /** The person's location, when shared */
  start: LatLon | null;
  height?: number;
}

/** The native map: the platform's map with the route along the streets and numbered stops. */
export function RouteMap({ route, stops, start, height = 260 }: RouteMapProps) {
  const map = useRef<MapView>(null);
  const line = route?.coordinates.map(([latitude, longitude]) => ({ latitude, longitude })) ?? [];
  const points = [...line, ...stops.map((s) => ({ latitude: s.lat, longitude: s.lon })), ...(start ? [{ latitude: start[0], longitude: start[1] }] : [])];
  const first = points[0] ?? { latitude: 4.65, longitude: -74.07 };

  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...first, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        onMapReady={() => map.current?.fitToCoordinates(points, { edgePadding: { top: 36, right: 36, bottom: 36, left: 36 }, animated: false })}
        accessibilityLabel={`Mapa de la ruta${route ? `: ${route.distance}, ${route.minutes}` : ""}`}
      >
        {line.length > 1 && <Polyline coordinates={line} strokeColor={colors.primary} strokeWidth={5} />}
        {start && <Marker coordinate={{ latitude: start[0], longitude: start[1] }} pinColor="#2B7FFF" title="Tú" />}
        {stops.map((s, i) => (
          <Marker key={`${s.chain}-${i}`} coordinate={{ latitude: s.lat, longitude: s.lon }} title={`${i + 1}. ${s.name}`}>
            <View style={styles.pin}><Text style={styles.pinText}>{i + 1}</Text></View>
          </Marker>
        ))}
      </MapView>
      <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  pin: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  pinText: { color: "#FFFFFF", fontWeight: "800", fontSize: fontSize.body },
  attribution: { position: "absolute", right: 6, bottom: 4, fontSize: fontSize.tiny, color: colors.mutedForeground, backgroundColor: colors.card, paddingHorizontal: 4, borderRadius: 4 },
});
