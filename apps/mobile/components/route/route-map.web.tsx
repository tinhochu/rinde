import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteMapProps } from "./route-map";
import { colors, fontSize, radius, scheme, spacing } from "@/lib/theme";

const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/**
 * The PWA's map: MapLibre GL on OpenStreetMap's raster tiles, with the route along the streets and
 * numbered stops. MapLibre loads only when this screen does; tiles only while the map is on screen.
 */
export function RouteMap({ route, stops, start, height = 260 }: RouteMapProps) {
  const host = useRef<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;

    // The UMD build carries its worker inline, so Metro needs no extra file to serve.
    import("maplibre-gl").then((mod) => {
      const maplibre = (mod as unknown as { default?: typeof mod }).default ?? mod;
      if (cancelled) return;
      const line = route?.coordinates.map(([lat, lon]) => [lon, lat] as [number, number]) ?? [];
      const points = [...line, ...stops.map((s) => [s.lon, s.lat] as [number, number]), ...(start ? [[start[1], start[0]] as [number, number]] : [])];
      const m = new maplibre.Map({
        container,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: ATTRIBUTION } },
          layers: [{
            id: "osm", type: "raster", source: "osm",
            // Dim the light tiles in dark mode so the map doesn't glare.
            paint: scheme === "dark" ? { "raster-brightness-max": 0.75, "raster-saturation": -0.3 } : {},
          }],
        },
        center: points[0] ?? [-74.07, 4.65],
        zoom: 14,
        attributionControl: { compact: false },
        cooperativeGestures: true,
      });
      map = m;
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      // A tile that fails is a gap, not a broken map: give up only if the map never loads.
      let loaded = false;
      m.on("error", (e) => { if (!loaded) { console.warn("[route-map]", e.error); setFailed(true); } });
      m.on("load", () => {
        loaded = true;
        setFailed(false);
        if (line.length > 1) {
          m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } } });
          m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FFFFFF", "line-width": 8 } });
          m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": colors.primary, "line-width": 5 } });
        }
        if (start) new maplibre.Marker({ element: dot() }).setLngLat([start[1], start[0]]).addTo(m);
        stops.forEach((s, i) => new maplibre.Marker({ element: pin(i + 1) }).setLngLat([s.lon, s.lat]).addTo(m));
        if (points.length > 1) {
          const bounds = points.reduce((b, p) => b.extend(p), new maplibre.LngLatBounds(points[0]!, points[0]!));
          m.fitBounds(bounds, { padding: 36, maxZoom: 17, duration: 0 });
        } else m.setZoom(16);
      });
    }).catch((error: unknown) => { console.warn("[route-map]", error); setFailed(true); });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route, stops, start]);

  return (
    <View style={[styles.frame, { height }]}>
      <View ref={host as never} style={styles.canvas} accessibilityLabel={`Mapa de la ruta${route ? `: ${route.distance}, ${route.minutes}` : ""}`} />
      {failed && <RouteSketch route={route} stops={stops} start={start} />}
    </View>
  );
}

/**
 * Without WebGL2 (old phones, locked-down browsers) MapLibre can't draw. The route's own shape
 * still shows where to go: the line along the streets, the numbered stops and the person.
 */
function RouteSketch({ route, stops, start }: Pick<RouteMapProps, "route" | "stops" | "start">) {
  const points: [number, number][] = [...(route?.coordinates ?? []), ...stops.map((s) => [s.lat, s.lon] as [number, number]), ...(start ? [start] : [])];
  if (!points.length) return null;
  const W = 400, H = 260, PAD = 28;
  const k = Math.cos((points[0]![0] * Math.PI) / 180);
  const xs = points.map(([, lon]) => lon * k), ys = points.map(([lat]) => lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((W - 2 * PAD) / (maxX - minX || 1e-4), (H - 2 * PAD) / (maxY - minY || 1e-4));
  const offX = (W - (maxX - minX) * scale) / 2, offY = (H - (maxY - minY) * scale) / 2;
  const xy = ([lat, lon]: [number, number]) => [offX + (lon * k - minX) * scale, H - offY - (lat - minY) * scale] as const;
  const line = (route?.coordinates ?? []).map((p) => xy(p).join(",")).join(" ");
  return (
    <View style={styles.sketch}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label="Esquema de la ruta">
        {line && <polyline points={line} fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={scheme === "dark" ? 0.15 : 1} />}
        {line && <polyline points={line} fill="none" stroke={colors.primary} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
        {start && (() => { const [x, y] = xy(start); return <circle cx={x} cy={y} r={7} fill="#2B7FFF" stroke="#FFFFFF" strokeWidth={3} />; })()}
        {stops.map((s, i) => {
          const [x, y] = xy([s.lat, s.lon]);
          return (
            <g key={`${s.chain}-${i}`}>
              <circle cx={x} cy={y} r={13} fill={colors.primary} stroke="#FFFFFF" strokeWidth={2} />
              <text x={x} y={y + 4.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#FFFFFF" fontFamily="system-ui, sans-serif">{i + 1}</text>
            </g>
          );
        })}
      </svg>
      <Text style={styles.sketchNote}>Esquema de la ruta: este navegador no puede mostrar el mapa.</Text>
    </View>
  );
}

function pin(n: number) {
  const el = document.createElement("div");
  el.textContent = String(n);
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    width: "28px", height: "28px", borderRadius: "14px", background: colors.primary, color: "#FFFFFF",
    border: "2px solid #FFFFFF", display: "flex", alignItems: "center", justifyContent: "center",
    font: "800 13px system-ui, sans-serif", boxShadow: "0 1px 4px rgba(0,0,0,.35)",
  });
  return el;
}

function dot() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, { width: "16px", height: "16px", borderRadius: "8px", background: "#2B7FFF", border: "3px solid #FFFFFF", boxShadow: "0 0 0 1px rgba(0,0,0,.2)" });
  return el;
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted },
  // Not absoluteFill: MapLibre's stylesheet makes its container position: relative, which would collapse it.
  canvas: { width: "100%", height: "100%" },
  sketch: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.muted },
  sketchNote: { position: "absolute", left: spacing.sm, right: spacing.sm, bottom: 6, fontSize: fontSize.tiny, color: colors.mutedForeground, textAlign: "center" },
});
