import { Platform, type ViewStyle } from "react-native";
import { colors } from "./theme";

/** The bottom tab bar. The planner hides it while the person is building a plan and restores this. */
export const tabBarStyle: ViewStyle = {
  backgroundColor: colors.card, borderTopColor: colors.border,
  // Web sizes the bar itself: room for the labels, plus the home indicator once installed on an iPhone
  // (the inset is 0 in a browser tab). react-native-web passes the calc() through to CSS.
  ...(Platform.OS === "web" && {
    height: "calc(68px + env(safe-area-inset-bottom))" as unknown as number,
    paddingTop: 8,
    paddingBottom: "calc(10px + env(safe-area-inset-bottom))" as unknown as number,
  }),
};
