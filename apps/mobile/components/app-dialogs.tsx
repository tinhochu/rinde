import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowRight, Bookmark, CheckCircle2, ClipboardList, MapPin, ShieldCheck, Trash2 } from "lucide-react-native";
import { Accordion, Button, Dialog } from "@/components/ui";
import { useAppState, type AppModal } from "@/lib/app-state";
import { cop } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { inputStyle } from "@/components/ui";

const TITLES: Record<Exclude<AppModal, null>, string> = {
  area: "Tu mercado empieza cerca.",
  saved: "Tu plan, a la mano.",
  help: "Menos vueltas. Así funciona.",
  privacy: "Tu información es tuya.",
};
const DESCRIPTIONS: Record<Exclude<AppModal, null>, string> = {
  area: "Empezamos en Medellín. Dinos en qué zona compras.",
  saved: "Guardado en este dispositivo, sin necesidad de registrarte.",
  help: "Explora lo que necesitas y convierte tu lista en un plan para ahorrar.",
  privacy: "Sin cuenta. Sin cobros. Tú decides qué guardar y compartir.",
};

export function DialogsHost() {
  const { modal, closeModal, zone, setZone, saved, resume, deleteSaved, openPlanner } = useAppState();
  const { control, handleSubmit, reset, formState: { errors } } = useForm<{ zone: string }>({ defaultValues: { zone } });

  useEffect(() => {
    if (modal === "area") reset({ zone });
  }, [modal, zone, reset]);

  return (
    <Dialog visible={!!modal} onClose={closeModal}>
      {modal && (
        <>
          <Text style={styles.title}>{TITLES[modal]}</Text>
          <Text style={styles.description}>{DESCRIPTIONS[modal]}</Text>
        </>
      )}

      {modal === "area" && (
        <>
          <Text style={styles.label}>Ciudad</Text>
          <View style={styles.cityRow}>
            <MapPin size={16} color={colors.primary} />
            <Text style={styles.city}>Medellín, Antioquia</Text>
            <CheckCircle2 size={15} color={colors.primary} />
          </View>
          <Text style={styles.label}>Barrio o zona (opcional)</Text>
          <Controller
            control={control}
            name="zone"
            rules={{ maxLength: { value: 60, message: "Usa hasta 60 caracteres para tu zona." } }}
            render={({ field: { onChange, value } }) => (
              <TextInput value={value} onChangeText={onChange} placeholder="Ej. Laureles, El Poblado, Belén" style={inputStyle} />
            )}
          />
          {errors.zone && <Text style={styles.error}>{errors.zone.message}</Text>}
          <Text style={styles.note}>Los precios corresponden al canal online, no a una sede física. La cobertura para tu dirección se confirma en cada tienda. No hacemos entregas.</Text>
          <Button title="Guardar mi zona" onPress={() => void handleSubmit(values => setZone(values.zone.trim()))()} icon={<MapPin size={15} color="#FFFFFF" />} />
        </>
      )}

      {modal === "saved" && (
        <>
          {saved?.items.length ? (
            <>
              <View style={styles.savedCard}>
                <View style={styles.savedHeader}>
                  <ClipboardList size={17} color={colors.primary} />
                  <Text style={styles.savedTitle}>Mi próximo mercado</Text>
                  <Text style={styles.savedCount}>{saved.items.length} productos</Text>
                </View>
                <Text style={styles.savedItems}>
                  {saved.items.slice(0, 5).map(item => item.name).join(", ")}
                  {saved.items.length > 5 && "…"}
                </Text>
                <Text style={styles.savedBudget}>
                  {saved.hasBudget === false ? "Sin presupuesto" : cop(saved.budget)} <Text style={styles.savedPeople}>· {saved.people} personas</Text>
                </Text>
                <Button title="Continuar mi plan" onPress={resume} icon={<ArrowRight size={15} color="#FFFFFF" />} />
              </View>
              <Pressable onPress={deleteSaved} style={styles.deleteRow}>
                <Trash2 size={14} color={colors.destructive} />
                <Text style={styles.deleteText}>Eliminar plan guardado</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.savedEmpty}>
              <Bookmark size={30} color={colors.primary} />
              <Text style={styles.savedEmptyText}>Aquí estará tu plan guardado.{"\n"}Tu lista y tus favoritos se guardan por separado.</Text>
              <Button title="Preparar mi mercado" onPress={() => openPlanner(false)} />
            </View>
          )}
          <Text style={styles.fine}>Los precios se consultan de nuevo. No mostramos precios guardados como actuales. No hay sincronización entre dispositivos.</Text>
        </>
      )}

      {modal === "help" && (
        <>
          {[
            { title: "Explora tu mercado", text: "Elige una tienda o un pasillo, busca productos y usa el + para añadirlos a tu lista. Las ideas sin precio son referencias, no inventario verificado." },
            { title: "Ponle un límite", text: "Abre tu lista y toca Armar mi plan. Confirma tu presupuesto, productos, cantidades y marcas. También puedes empezar un plan con una foto, texto o ingreso manual." },
            { title: "Comparamos, sin inventar", text: "Consultamos Éxito, Jumbo y D1 desde el servidor. Mostramos solo los precios que recibimos, con enlace, canal y hora. Si una tienda falla o falta un precio, te lo decimos." },
            { title: "Tú decides dónde comprar", text: "Compara la compra dividida y una sola tienda. Revisa paradas, saldo y faltantes, y comparte tu comprobante. Rinde no cobra, reserva ni compra por ti." },
          ].map((item, index) => (
            <View key={item.title} style={styles.helpRow}>
              <View style={styles.helpIndex}>
                <Text style={styles.helpIndexText}>{index + 1}</Text>
              </View>
              <View style={styles.helpBody}>
                <Text style={styles.helpTitle}>{item.title}</Text>
                <Text style={styles.helpText}>{item.text}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.note}>El ahorro compara ofertas consultadas de una lista completa, no todo el inventario del mercado. No incluye transporte ni domicilios. Sin comparación completa, no anunciamos ahorro.</Text>
          <Accordion title="Lectura de fotos y conexiones">
            <Text style={styles.helpText}>La lectura de fotos necesita una conexión activa a Meta Muse. Si no está configurada, puedes escribir la lista. Los catálogos pueden limitar o rechazar consultas; no se garantiza respuesta de todas las tiendas.</Text>
          </Accordion>
        </>
      )}

      {modal === "privacy" && (
        <View style={styles.privacy}>
          <ShieldCheck size={35} color={colors.primary} />
          <Text style={styles.privacyText}>Tu lista, tus favoritos, tu zona y tu plan guardado se guardan en este dispositivo. No pedimos nombre, correo ni dirección exacta.</Text>
          <Text style={styles.privacyText}>Los precios no se conservan como vigentes al volver a abrir la app. Para comparar, nuestro servidor consulta los nombres de los productos en los catálogos de las tiendas.</Text>
          <Text style={styles.privacyText}>Si usas la lectura de fotos con un modelo conectado, la foto se envía al proveedor para extraer la lista. No se guarda en tu historial local.</Text>
          <Text style={styles.privacyText}>Puedes vaciar tu lista, quitar favoritos o eliminar tu plan guardado desde sus respectivas secciones.</Text>
          <Text style={styles.note}>No hay cuentas ni sincronización. Compartir un comprobante siempre es una acción tuya. Rinde no hace compras ni entregas.</Text>
        </View>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: colors.primary },
  description: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  label: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  cityRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background, padding: spacing.md,
  },
  city: { flex: 1, fontSize: fontSize.subhead, color: colors.foreground },
  error: { fontSize: fontSize.caption, color: colors.destructive },
  note: { borderRadius: radius.md, backgroundColor: colors.secondary, padding: spacing.md, fontSize: fontSize.caption, lineHeight: 20, color: colors.primary },
  fine: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  savedCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  savedHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  savedTitle: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  savedCount: { fontSize: fontSize.small, color: colors.mutedForeground },
  savedItems: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  savedBudget: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.primary },
  savedPeople: { fontSize: fontSize.caption, fontWeight: "400", color: colors.mutedForeground },
  deleteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deleteText: { fontSize: fontSize.caption, color: colors.destructive },
  savedEmpty: {
    borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border,
    padding: spacing.xl, gap: spacing.md, alignItems: "center",
  },
  savedEmptyText: { fontSize: fontSize.subhead, lineHeight: 22, textAlign: "center", color: colors.mutedForeground },
  helpRow: { flexDirection: "row", gap: spacing.md },
  helpIndex: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  helpIndexText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  helpBody: { flex: 1, gap: 4 },
  helpTitle: { fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  helpText: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  privacy: { gap: spacing.lg },
  privacyText: { fontSize: fontSize.subhead, lineHeight: 26, color: colors.mutedForeground },
});
