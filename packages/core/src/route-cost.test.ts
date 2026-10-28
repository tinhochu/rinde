import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAVEL, extraTrip, formatDistance, formatMinutes, shorterOrder, stepText, stopCost, tripDurationS, withinLimit,
  type TravelMode,
} from "./route-cost";

const travel = (mode: TravelMode) => ({ mode, ...DEFAULT_TRAVEL });

describe("stop cost", () => {
  it("costs nothing on foot, one fare by bus, per km by moto, and per km plus parking by car", () => {
    expect(stopCost(travel("walk"), 2400)).toBe(0);
    expect(stopCost(travel("bus"), 2400)).toBe(3200);
    expect(stopCost(travel("moto"), 2400)).toBe(600);
    expect(stopCost(travel("car"), 2400)).toBe(1400 + 3000);
  });

  it("uses the person's edited costs", () => {
    expect(stopCost({ ...travel("bus"), busFare: 3550 }, 1000)).toBe(3550);
  });
});

describe("limits and times", () => {
  it("rules out a 45-minute bus detour and keeps a 25-minute one", () => {
    expect(withinLimit("bus", 45 * 60)).toBe(false);
    expect(withinLimit("bus", 25 * 60)).toBe(true);
    expect(withinLimit("walk", 21 * 60)).toBe(false);
  });

  it("estimates bus time from the car route, with the wait", () => {
    expect(tripDurationS("bus", 600)).toBe(600 * 1.6 + 480);
    expect(tripDurationS("car", 600)).toBe(600);
  });
});

describe("extra trip", () => {
  it("is the route through both stores minus the route to the anchor alone", () => {
    expect(extraTrip({ distanceM: 1000, durationS: 800 }, { distanceM: 1600, durationS: 1280 })).toEqual({ distanceM: 600, durationS: 480 });
  });

  it("is the whole anchor → B → anchor loop without the person's location", () => {
    expect(extraTrip(null, { distanceM: 1200, durationS: 960 })).toEqual({ distanceM: 1200, durationS: 960 });
  });

  it("picks the visiting order that takes less time", () => {
    const anchorFirst = { order: ["d1", "carulla"], route: { distanceM: 1500, durationS: 1300 } };
    const otherFirst = { order: ["carulla", "d1"], route: { distanceM: 1550, durationS: 1200 } };
    expect(shorterOrder([anchorFirst, otherFirst]).order).toEqual(["carulla", "d1"]);
  });
});

describe("formatting", () => {
  it("shows meters below a kilometer and km with a decimal comma above", () => {
    expect(formatDistance(594)).toBe("590 m");
    expect(formatDistance(1194)).toBe("1,2 km");
    expect(formatMinutes(1006.8)).toBe("17 min");
  });
});

describe("stepText", () => {
  const step = (type: string, modifier: string | null, name = "", distanceM = 0, exit: number | null = null) => ({ type, modifier, name, exit, distanceM });

  it("turns", () => {
    expect(stepText(step("turn", "right", "Calle 57", 200))).toBe("Gira a la derecha en la Calle 57 · 200 m");
    expect(stepText(step("turn", "slight left", "Carrera 7"))).toBe("Gira levemente a la izquierda en la Carrera 7");
    expect(stepText(step("end of road", "left", "Avenida Calle 63", 1400))).toBe("Al final de la vía, gira a la izquierda en la Avenida Calle 63 · 1,4 km");
    expect(stepText(step("turn", "uturn"))).toBe("Da la vuelta en U");
  });

  it("roundabouts", () => {
    expect(stepText(step("roundabout", null, "Carrera 15", 300, 2))).toBe("En la glorieta, toma la 2.ª salida hacia la Carrera 15 · 300 m");
    expect(stepText(step("exit roundabout", "right", "Carrera 15"))).toBe("Sal de la glorieta hacia la Carrera 15");
  });

  it("departs, continues and arrives", () => {
    expect(stepText(step("depart", "left", "Avenida Calle 63", 120))).toBe("Sal por la Avenida Calle 63 · 120 m");
    expect(stepText(step("depart", "left", "", 40))).toBe("Sal hacia la vía · 40 m");
    expect(stepText(step("new name", "straight", "Calle 64"))).toBe("Sigue por la Calle 64");
    expect(stepText(step("continue", "slight right", "Calle 64"))).toBe("Sigue levemente a la derecha por la Calle 64");
    expect(stepText(step("arrive", "right"), "Carulla Calle 63")).toBe("Llegas a Carulla Calle 63");
  });
});
