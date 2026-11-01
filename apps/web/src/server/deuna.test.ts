import { describe, expect, it } from "vitest";
import { deunaAuth, humanSize } from "./deuna";

const req = (key?: string) => new Request("http://localhost/api/deuna/v1/stores", { headers: key ? { "x-api-key": key } : {} });

describe("deunaAuth", () => {
  it("fails closed without a configured key", () => {
    expect(deunaAuth(req("anything"), {})).toBe("unconfigured");
    expect(deunaAuth(req("anything"), { DEUNA_API_KEY: " , " })).toBe("unconfigured");
  });

  it("accepts any key of a comma-separated list, and nothing else", () => {
    const env = { DEUNA_API_KEY: "alpha-key, beta-key" };
    expect(deunaAuth(req("alpha-key"), env)).toBeNull();
    expect(deunaAuth(req("beta-key"), env)).toBeNull();
    expect(deunaAuth(req(), env)).toBe("unauthorized");
    expect(deunaAuth(req("alpha"), env)).toBe("unauthorized");
    expect(deunaAuth(req("alpha-key, beta-key"), env)).toBe("unauthorized");
  });
});

describe("humanSize", () => {
  it("says sizes the way people do", () => {
    expect(humanSize("500.000", "g")).toBe("500 g");
    expect(humanSize("1000.000", "g")).toBe("1 kg");
    expect(humanSize("1500.000", "ml")).toBe("1,5 L");
    expect(humanSize("750.000", "ml")).toBe("750 ml");
    expect(humanSize("6.000", "unit")).toBe("6 und");
    expect(humanSize(null, "g")).toBeNull();
    expect(humanSize("0", "g")).toBeNull();
  });
});
