import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check, LocateFixed, MapPin, Search, SlidersHorizontal } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { Button, Chip, labelStyle } from "@/components/ui";
import { roughLocation } from "@/lib/location";
import {
  CHAIN_NAMES, MODE_LABELS, fetchBranches, formatKm, formatMin,
  type Anchor, type Branch, type Chain, type LatLon, type TravelMode, type TravelPrefs,
} from "@/lib/route";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { TravelCostsSheet } from "./travel-costs-sheet";

export interface AnchorChoice {
  anchor: Anchor;
  /** Shown on the result while it loads */
  anchorLabel: string;
  start: LatLon | null;
  note: string;
}

const CHAINS: Chain[] = ["d1", "jumbo", "exito", "carulla"];
const MODES: TravelMode[] = ["walk", "bus", "moto", "car"];

/**
 * "¿A qué súper vas?": the chain and the branch (by name or neighborhood, or nearest by route when
 * the person shares their location), how they travel, and a note. Location is optional throughout.
 */
export function AnchorStep({ travel, onTravel, onSubmit, initialChain = "d1" }: {
  travel: TravelPrefs;
  onTravel: (t: TravelPrefs) => void;
  onSubmit: (choice: AnchorChoice) => void;
  initialChain?: Chain;
}) {
  const [chain, setChain] = useState<Chain>(initialChain);
  const [query, setQuery] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [picked, setPicked] = useState<Branch | null>(null);
  const [here, setHere] = useState<LatLon | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [byAddress, setByAddress] = useState(false);
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [costsOpen, setCostsOpen] = useState(false);
  const request = useRef<AbortController | null>(null);

  // Near the person: sorted by route time for their mode. Otherwise, a search by name or neighborhood.
  useEffect(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const q = query.trim();
    if (!here && q.length < 2) { setBranches([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      const ask = here && q.length < 2 ? fetchBranches({ near: here, chain, mode: travel.mode }, controller.signal) : fetchBranches({ q, chain }, controller.signal);
      ask
        .then(({ branches: found }) => {
          setBranches(found);
          // With location, the closest one of the chain is preselected.
          if (here && q.length < 2) setPicked(found[0] ?? null);
        })
        .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos buscar las tiendas."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, q ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [chain, query, here, travel.mode]);

  useEffect(() => { setPicked(p => (p && p.chain === chain ? p : null)); }, [chain]);

  async function locate() {
    setLocating(true);
    setLocationNote(null);
    const point = await roughLocation();
    setLocating(false);
    if (point) { setHere(point); setQuery(""); }
    else setLocationNote("Sin tu ubicación también funciona: busca tu tienda por nombre o barrio.");
  }

  const ready = byAddress ? address.trim().length >= 4 : Boolean(picked || here);
  function submit() {
    const anchor: Anchor = byAddress
      ? { chain, address: address.trim() }
      : picked ? { branchId: picked.id } : { chain, lat: here![0], lon: here![1] };
    const anchorLabel = byAddress ? `${CHAIN_NAMES[chain]} · ${address.trim()}` : picked ? picked.name : `Tu ${CHAIN_NAMES[chain]} (tu ubicación)`;
    onSubmit({ anchor, anchorLabel, start: here, note: note.trim() });
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>¿A qué súper vas?</Text>
          <Text style={styles.lede}>Te decimos si vale la pena pasar también por otra tienda cerca, y en qué orden.</Text>
        </View>

        <View style={styles.chains} accessibilityRole="radiogroup">
          {CHAINS.map(c => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected: chain === c }}
              accessibilityLabel={CHAIN_NAMES[c]}
              onPress={() => setChain(c)}
              style={[styles.chain, chain === c && styles.chainOn]}
            >
              <StoreLogo store={CHAIN_NAMES[c]} small />
            </Pressable>
          ))}
        </View>

        {!byAddress ? (
          <View style={styles.section}>
            <View style={styles.searchRow}>
              <Search size={16} color={colors.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Busca tu ${CHAIN_NAMES[chain]} por nombre o barrio`}
                placeholderTextColor={colors.mutedForeground}
                style={styles.search}
                accessibilityLabel="Buscar tienda por nombre o barrio"
                returnKeyType="search"
              />
            </View>
            <Pressable accessibilityRole="button" onPress={locate} disabled={locating} style={({ pressed }) => [styles.locate, pressed && styles.pressed]}>
              {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <LocateFixed size={16} color={colors.primary} />}
              <Text style={styles.locateText}>{here ? "Ordenadas por cercanía desde tu ubicación" : "Usar mi ubicación"}</Text>
            </Pressable>
            {locationNote && <Text style={styles.hint}>{locationNote}</Text>}

            {loading && <ActivityIndicator color={colors.primary} style={styles.spinner} />}
            {error && <Text style={styles.error}>{error}</Text>}
            {!loading && !error && branches.length === 0 && (query.trim().length >= 2 || here) && (
              <Text style={styles.hint}>No encontramos un {CHAIN_NAMES[chain]} así. Prueba otro barrio, usa tu ubicación o escribe la dirección.</Text>
            )}
            <View style={styles.list}>
              {branches.map((b, i) => {
                const on = picked?.id === b.id;
                return (
                  <Pressable
                    key={b.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setPicked(b)}
                    style={({ pressed }) => [styles.branch, i > 0 && styles.divider, on && styles.branchOn, pressed && styles.pressed]}
                  >
                    <MapPin size={16} color={on ? colors.primary : colors.mutedForeground} />
                    <View style={styles.flex}>
                      <Text style={styles.branchName}>{b.name}</Text>
                      <Text style={styles.branchSub} numberOfLines={1}>{[b.area, b.address].filter(Boolean).join(" · ") || "Sin dirección en el mapa"}</Text>
                    </View>
                    {b.distanceM !== undefined && b.durationS !== undefined && (
                      <Text style={styles.branchDistance}>{formatKm(b.distanceM)}{"\n"}{formatMin(b.durationS)}</Text>
                    )}
                    {on && <Check size={16} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </View>
            <Pressable accessibilityRole="button" onPress={() => setByAddress(true)} hitSlop={6}>
              <Text style={styles.link}>¿No está tu tienda? Escribe la dirección</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={labelStyle}>Dirección de tu {CHAIN_NAMES[chain]}</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Calle 63 # 9-20, Bogotá"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              accessibilityLabel={`Dirección de tu ${CHAIN_NAMES[chain]}`}
            />
            <Pressable accessibilityRole="button" onPress={() => setByAddress(false)} hitSlop={6}>
              <Text style={styles.link}>Buscar en la lista</Text>
            </Pressable>
          </View>
        )}
        <Text style={styles.attribution}>Tiendas: © OpenStreetMap contributors</Text>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={labelStyle}>¿Cómo te mueves?</Text>
            <Pressable accessibilityRole="button" onPress={() => setCostsOpen(true)} hitSlop={6} style={styles.costs}>
              <SlidersHorizontal size={13} color={colors.primary} />
              <Text style={styles.link}>Editar costos</Text>
            </Pressable>
          </View>
          <View style={styles.modes}>
            {MODES.map(m => <Chip key={m} selected={travel.mode === m} onPress={() => onTravel({ ...travel, mode: m })}>{MODE_LABELS[m]}</Chip>)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={labelStyle}>¿Algo que debamos saber? (opcional)</Text>
          <TextInput
            value={note}
            onChangeText={t => setNote(t.slice(0, 200))}
            placeholder="Voy cargado, tengo 30 minutos, voy con bebé…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.note]}
            multiline
            accessibilityLabel="Nota sobre tu situación"
          />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Planear mi ruta" onPress={submit} disabled={!ready} />
        {!ready && <Text style={styles.footerHint}>Elige tu tienda, usa tu ubicación o escribe la dirección.</Text>}
      </View>
      <TravelCostsSheet visible={costsOpen} travel={travel} onClose={() => setCostsOpen(false)} onSave={t => { onTravel(t); setCostsOpen(false); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  intro: { gap: spacing.xs },
  title: { fontSize: fontSize.headline, fontWeight: "800", letterSpacing: -0.4, color: colors.foreground },
  lede: { fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground },
  chains: { flexDirection: "row", gap: spacing.sm },
  chain: {
    flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
  },
  chainOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  section: { gap: spacing.sm },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 46,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  search: { flex: 1, fontSize: fontSize.subhead, color: colors.foreground, paddingVertical: spacing.sm },
  locate: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40, alignSelf: "flex-start", paddingHorizontal: spacing.xs },
  locateText: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  hint: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  error: { fontSize: fontSize.caption, color: colors.destructive },
  spinner: { alignSelf: "flex-start" },
  list: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  branch: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  branchOn: { backgroundColor: colors.secondary },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  branchName: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.foreground },
  branchSub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  branchDistance: { fontSize: fontSize.caption, fontWeight: "700", color: colors.foreground, textAlign: "right", fontVariant: ["tabular-nums"] },
  link: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  attribution: { fontSize: fontSize.tiny, color: colors.mutedForeground, marginTop: -spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  costs: { flexDirection: "row", alignItems: "center", gap: 4 },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  input: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.subhead, color: colors.foreground,
  },
  note: { minHeight: 64, textAlignVertical: "top" },
  pressed: { opacity: 0.7 },
  footer: { gap: spacing.xs, padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  footerHint: { fontSize: fontSize.caption, color: colors.mutedForeground, textAlign: "center" },
});
