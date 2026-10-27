import { Platform, type ViewStyle } from "react-native";
import { colors } from "./theme";

/** The bottom tab bar. The planner hides it while the person is building a plan and restores this. */
export const tabBarStyle: ViewStyle = {
  backgroundColor: colors.card, borderTopColor: colors.border,
  // Web has no safe-area inset under the bar, so give the labels their own room.
  ...(Platform.OS === "web" && { height: 68, paddingTop: 8, paddingBottom: 10 }),
};
