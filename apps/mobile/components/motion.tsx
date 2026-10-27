import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Platform, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

const native = Platform.OS !== "web";
let reducedNow = false;

/** The system "reduce motion" setting, kept current while the app is open. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(reducedNow);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(r => { reducedNow = r; if (live) setReduced(r); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", r => { reducedNow = r; setReduced(r); });
    return () => { live = false; sub.remove(); };
  }, []);
  return reduced;
}

/** Fades content up into place once, on mount. `index` staggers siblings by 40 ms (capped). */
export function FadeIn({ index = 0, delay = 0, style, children }: { index?: number; delay?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reducedNow ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { progress.setValue(1); return; }
    const anim = Animated.timing(progress, {
      toValue: 1, duration: 280, delay: delay + Math.min(index, 6) * 40,
      easing: Easing.out(Easing.cubic), useNativeDriver: native,
    });
    anim.start();
    return () => anim.stop();
  }, [reduced, progress, index, delay]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** A Pressable that gives under the finger: a quick scale-down on press, back on release. */
export function PressScale({ style, children, scaleTo = 0.97, ...props }: Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>; children: ReactNode; scaleTo?: number;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  // Sizing belongs to the pressable, so a card with flex: 1 still shares its row; the look stays on the animated view.
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: ViewStyle = { flex: flat.flex, flexGrow: flat.flexGrow, flexShrink: flat.flexShrink, flexBasis: flat.flexBasis, alignSelf: flat.alignSelf, width: flat.width, maxWidth: flat.maxWidth };
  const to = (toValue: number, duration: number) =>
    Animated.timing(scale, { toValue, duration, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
  return (
    <Pressable
      {...props}
      style={outer}
      onPressIn={e => { if (!reduced) to(scaleTo, 90); props.onPressIn?.(e); }}
      onPressOut={e => { if (!reduced) to(1, 160); props.onPressOut?.(e); }}
    >
      {({ pressed }) => (
        <Animated.View style={[style, { flexGrow: flat.flex || flat.flexGrow ? 1 : undefined, flex: undefined, alignSelf: undefined }, { transform: [{ scale }] }, reduced && pressed && { opacity: 0.7 }]}>{children}</Animated.View>
      )}
    </Pressable>
  );
}

/** A short "pop" whenever `value` changes, for counts that just went up or down. */
export function Pop({ value, children, style }: { value: number | string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) return;
    scale.setValue(0.82);
    Animated.spring(scale, { toValue: 1, speed: 28, bounciness: 6, useNativeDriver: native }).start();
  }, [value, reduced, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Animates the next layout change (rows appearing or leaving after a filter). Phones only; skipped with reduce motion. */
export function animateNextLayout() {
  if (!native || reducedNow) return;
  LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}
