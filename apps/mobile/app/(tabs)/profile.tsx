import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { InstallCard } from "@/components/install-card";
import { ProfileAccountCard } from "@/components/profile/account-card";
import { ContributionSummary } from "@/components/profile/contribution-summary";
import { HackathonCard } from "@/components/profile/hackathon-card";
import { AccountSection, DataSection } from "@/components/profile/data-section";
import { SettingsSection } from "@/components/profile/settings-section";
import { ShoppingPreferences } from "@/components/profile/shopping-preferences";
import { colors, fontSize, spacing } from "@/lib/theme";

/**
 * Perfil: a shopping control center. Who you are, how you shop (shared with Mi plan de ahorro), a
 * small window into your contributions (the detail lives in Mis aportes), settings, then data and help.
 */
export default function ProfileScreen() {
  return (
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Text accessibilityRole="header" style={styles.title}>Mi perfil</Text>
      <ProfileAccountCard />
      <InstallCard />
      <HackathonCard />
      <ShoppingPreferences />
      <ContributionSummary />
      <SettingsSection />
      <DataSection />
      <AccountSection />
      <View style={styles.footer}>
        <ShieldCheck size={13} color={colors.mutedForeground} />
        <Text style={styles.footerText}>Sin registro obligatorio. Solo precios observados en las tiendas.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl, backgroundColor: colors.background },
  title: { fontSize: fontSize.hero, fontWeight: "900", letterSpacing: -1, color: colors.foreground },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footerText: { fontSize: fontSize.small, color: colors.mutedForeground, textAlign: "center" },
});
