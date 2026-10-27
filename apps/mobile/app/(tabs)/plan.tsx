import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useNavigation } from "expo-router";
import { FadeIn } from "@/components/motion";
import { BudgetPhase } from "@/components/plan/budget-phase";
import { ListPhase } from "@/components/plan/list-phase";
import { PlanHeader } from "@/components/plan/plan-header";
import { CheckingPhase, ResultsPhase } from "@/components/plan/results-phase";
import { mergeItems, PHASE, useAppState } from "@/lib/app-state";
import { tabBarStyle } from "@/lib/navigation";
import { toListItems } from "@/lib/shop";
import { colors } from "@/lib/theme";
import { toast } from "@/lib/toast";

/**
 * "Mi plan de ahorro": three phases on one screen. 1 · the list, 2 · budget and preferences, 3 · prices
 * (checking, then results). The list, budget and last result live in app state, so going back never
 * loses anything, and the tab bar stays out of the way until there is a plan to look at.
 */
export default function PlanScreen() {
  const app = useAppState();
  const { step, items, result, progress, go } = app;
  const navigation = useNavigation();
  const planning = step < PHASE.results;
  const phase = Math.min(step, 2);
  // How far the header lets you jump: the budget once there's a list, results once there's a plan.
  const reachable = result ? 2 : items.length ? 1 : 0;

  // Results need a plan; after the list changes there is none until the next comparison.
  useEffect(() => {
    if (step === PHASE.results && !result) go(items.length ? PHASE.budget : PHASE.list);
  }, [step, result, items.length, go]);

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: planning ? { display: "none" } : tabBarStyle });
  }, [navigation, planning]);

  function back() {
    if (step === PHASE.list) exit();
    else if (step === PHASE.checking || step === PHASE.results) go(PHASE.budget);
    else go(step - 1);
  }

  function exit() {
    if (items.length) toast.success("Tu lista quedó guardada. Retómala desde Planes guardados.", { duration: 2200 });
    if (router.canGoBack()) router.back();
    else app.explore();
  }

  return (
    <SafeAreaView edges={planning ? ["top", "bottom"] : ["top"]} style={styles.screen}>
      <PlanHeader
        phase={phase}
        reachable={reachable}
        busy={step === PHASE.checking}
        onBack={back}
        onExit={exit}
        onSaved={() => app.openModal("saved")}
        onPhase={p => go(p === 2 ? PHASE.results : p)}
      />
      <View style={styles.body}>
        <FadeIn key={step} style={styles.body}>
          {step === PHASE.list && (
            <ListPhase
              items={items}
              status={app.itemStatus}
              cart={app.cart}
              onChange={app.setItems}
              onUseCart={() => app.setItems(mergeItems(items, toListItems(app.cart)))}
              onNext={() => go(PHASE.budget)}
            />
          )}
          {step === PHASE.budget && (
            <BudgetPhase
              budget={app.budget}
              hasBudget={app.hasBudget}
              frequency={app.frequency}
              people={app.people}
              knowsPeople={app.knowsPeople}
              tripCost={app.tripCost}
              area={app.area}
              items={items}
              onPrefs={app.setPrefs}
              onItems={app.setItems}
              onArea={() => app.openModal("area")}
              onNext={app.compare}
            />
          )}
          {step === PHASE.checking && <CheckingPhase progress={progress} />}
          {step === PHASE.results && result && (
            <ResultsPhase
              result={result}
              hasBudget={app.hasBudget}
              area={app.area}
              progress={progress}
              refreshing={app.refreshing}
              deciding={app.deciding}
              onRefresh={app.refresh}
              onDecide={app.decide}
              onEdit={() => go(PHASE.list)}
            />
          )}
        </FadeIn>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
});
