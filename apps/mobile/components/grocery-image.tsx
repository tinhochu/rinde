import { useState } from "react";
import { StyleSheet, View, type StyleProp } from "react-native";
import { Image, type ImageStyle } from "expo-image";
import { ShoppingBasket } from "lucide-react-native";
import { colors } from "@/lib/theme";

export function GroceryImage({
  src, alt, style, contain = false, size = 40,
}: {
  src: string; alt: string; style?: StyleProp<ImageStyle>; contain?: boolean; size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <View accessibilityLabel={alt} style={[styles.fallback, style]}>
        <ShoppingBasket size={size} strokeWidth={1.3} color={colors.primary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt}
      contentFit={contain ? "contain" : "cover"}
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
      style={[contain && styles.contain, style]}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  contain: { backgroundColor: colors.card },
});
