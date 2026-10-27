import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Car, Palette, Store as StoreIcon } from "lucide-react-native";
import { StoreFilterBar } from "@/components/home/store-filter";
import { Chip } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { allStores, toggleStore } from "@/lib/compare";
import { cop } from "@/lib/market";
import { TRIP_COSTS } from "@/lib/planner";
import { colors, fontSize, themePref } from "@/lib/theme";
import { saveThemePref, type ThemePref } from "@/lib/theme-pref";
import { toast } from "@/lib/toast";
import { PreferenceRow, Section, Segmented } from "./rows";

const ICON = 17;
const THEMES: { id: ThemePref; label: string }[] = [
  { id: "system", label: "Como tu celular" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
];

/** "Preferencias y ajustes": the settings people change once — stores, the cost of an extra stop, appearance. */
export function SettingsSection() {
  const { stores, tripCost, setPrefs } = useAppState();
  // Colors are built at launch, so the row shows the choice right away even when it applies on reopening.
  const [theme, setTheme] = useState<ThemePref>(themePref);

  function chooseTheme(next: ThemePref) {
    setTheme(next);
    if (next === themePref) return;
    if (!saveThemePref(next)) toast.success("Listo. Verás el cambio la próxima vez que abras Rinde.");
  }

  const storesValue = allStores(stores) ? "Todas" : stores.join(", ");

  return (
    <Section title="Preferencias y ajustes">
      <PreferenceRow icon={<StoreIcon size={ICON} color={colors.primary} />} label="Tiendas preferidas" value={storesValue}>
        <StoreFilterBar
          filter={stores}
          onChange={s => {
            const next = s === "all" ? [] : toggleStore(stores, s);
            setPrefs({ stores: next });
          }}
        />
        <Text style={styles.help}>
          Explorar y la búsqueda arrancan con estas tiendas; puedes cambiarlas allí en cualquier momento. Mi plan de ahorro compara siempre las tres para encontrar el total más bajo.
        </Text>
      </PreferenceRow>

      <PreferenceRow
        icon={<Car size={ICON} color={colors.primary} />}
        label="Costo de visitar otra tienda"
        value={tripCost ? cop(tripCost) : "No considerar"}
      >
        <Text style={styles.help}>Usamos este valor para evaluar si realmente conviene comprar en varias tiendas: solo te proponemos otra parada si ahorras más que esto.</Text>
        <View style={styles.chips}>
          {TRIP_COSTS.map(n => (
            <Chip key={n} selected={tripCost === n} onPress={() => setPrefs({ tripCost: n })}>{n ? cop(n) : "No considerar"}</Chip>
          ))}
        </View>
        {tripCost === 0 ? (
          <Text style={styles.help}>Elegiste no considerarlo: te mostramos la combinación más barata aunque tenga más paradas.</Text>
        ) : null}
      </PreferenceRow>

      <PreferenceRow
        icon={<Palette size={ICON} color={colors.primary} />}
        label="Apariencia"
        below={<Segmented label="Apariencia" options={THEMES} value={theme} onChange={chooseTheme} />}
        last
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
